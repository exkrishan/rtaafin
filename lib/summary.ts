import { supabase } from '@/lib/supabase';
import { getEffectiveConfig } from '@/lib/config';
import { emitTelemetry } from '@/lib/telemetry';
import { z, infer as zInfer } from 'zod';

type RawDisposition = {
  label?: string;
  score?: number;
  confidence?: number;
  subDisposition?: string | null;
};

export interface SummaryResponse {
  issue: string;
  resolution: string;
  next_steps: string;
  dispositions: Array<{ label: string; score: number; subDisposition?: string }>;
  confidence: number;
  raw?: any;
}

export interface MappedDisposition {
  originalLabel: string;
  score: number;
  mappedCode: string;
  mappedTitle: string;
  mappedId?: number | null; // ID from dispositions_master table
  matchType: 'code' | 'title' | 'tag' | 'fallback';
  taxonomyTags: string[];
  confidence: number;
  subDisposition?: string; // Preserve sub-disposition label from LLM
  subDispositionId?: number | null; // ID from dispositions_master table
}

export interface GenerateCallSummaryResult {
  ok: boolean;
  summary?: SummaryResponse;
  mappedDispositions?: MappedDisposition[];
  usedFallback: boolean;
  error?: string;
}

interface TaxonomyRow {
  parent_id?: number;
  parent_code?: string;
  parent_label?: string;
  parent_category?: string;
  code?: string; // For backward compatibility
  title?: string; // For backward compatibility
  label?: string; // Alias for title
  tags?: string[] | null;
  sub_dispositions?: Array<{ id: number; code: string; label: string }>;
}

interface TranscriptData {
  combined: string;
  chunks: string[];
}

const LLM_RESPONSE_SCHEMA = z.object({
  issue: z.string(),
  resolution: z.string().optional(),
  next_steps: z.string().optional(),
  dispositions: z
    .array(
      z.object({
        label: z.string(),
        score: z.number().optional(),
        subDisposition: z.string().optional(), // Optional sub-disposition
      })
    )
    .optional(),
  confidence: z.number().optional(),
});

type LlmStructuredSummary = zInfer<typeof LLM_RESPONSE_SCHEMA>;

const summaryCache = new Map<
  string,
  { value: GenerateCallSummaryResult; expiry: number }
>();
const SUMMARY_CACHE_TTL_MS = 5000;
const RAW_OUTPUT_LIMIT = 16000;

class TimeoutError extends Error {
  code = 'TIMEOUT';
  constructor(message: string) {
    super(message);
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

function getCachedSummary(key: string): GenerateCallSummaryResult | null {
  const cached = summaryCache.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiry) {
    summaryCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedSummary(key: string, value: GenerateCallSummaryResult): void {
  summaryCache.set(key, {
    value,
    expiry: Date.now() + SUMMARY_CACHE_TTL_MS,
  });
}

export function resetSummaryCache(): void {
  summaryCache.clear();
}

async function fetchTranscript(callId: string): Promise<TranscriptData> {
  try {
    // First, try to select all columns to see what's available
    const { data, error } = await (supabase as any)
      .from('ingest_events')
      .select('*')
      .eq('call_id', callId)
      .order('seq', { ascending: true });

    if (error) {
      // Check if it's a column name issue
      if (error.message.includes('does not exist') || error.message.includes('column')) {
        const helpfulError = `Database schema mismatch. The required columns don't exist in 'ingest_events' table.

Please run the migration:
1. Open your Supabase SQL Editor
2. Run this SQL:

DROP TABLE IF EXISTS ingest_events CASCADE;

CREATE TABLE ingest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(call_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_ingest_events_call_id ON ingest_events(call_id);
CREATE INDEX IF NOT EXISTS idx_ingest_events_call_seq ON ingest_events(call_id, seq);
CREATE INDEX IF NOT EXISTS idx_ingest_events_created_at ON ingest_events(created_at);

Original error: ${error.message}`;
        throw new Error(helpfulError);
      }
      
      // Check if it's a network/Supabase connection issue
      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
        throw new Error(`Failed to connect to database. Please check your Supabase connection settings. Original error: ${error.message}`);
      }
      
      throw new Error(`Failed to load transcript: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('No transcript events found for call. Make sure you clicked "Start Call" and waited for transcript lines to appear.');
    }

    // Extract text from the data - try 'text' column first
    const chunks = data
      .map((row: any) => {
        // Try 'text' column first, then fallback to other possible names
        const textValue = row?.text || row?.transcript || row?.content || row?.message || '';
        return String(textValue).trim();
      })
      .filter((text: string) => Boolean(text));

    if (chunks.length === 0) {
      throw new Error('No transcript events found for call');
    }

    return {
      combined: chunks.join('\n'),
      chunks,
    };
  } catch (err: any) {
    // Re-throw with better context
    if (err.message.includes('Database schema')) {
      throw err; // Already has helpful message
    }
    throw new Error(`Failed to load transcript: ${err.message}`);
  }
}

function buildPrompt(transcript: string): string {
  return [
    'You are an assistant that summarizes a customer support call into structured JSON with fields:',
    'issue (string), resolution (string), next_steps (string), dispositions (array of {label, score between 0 and 1, subDisposition optional}), confidence (0-1).',
    'For dispositions, select the most relevant disposition label and provide a specific subDisposition if applicable (e.g., "credit card fraud", "card replacement", "account balance inquiry").',
    'Return ONLY valid JSON. Do not include markdown, prose, or explanations.',
    '',
    'Transcript:',
    '"""',
    transcript.trim(),
    '"""',
  ].join('\n');
}

/**
 * Parse rate limit error from OpenAI API response
 * Returns the retry-after time in seconds, or null if not a rate limit error
 */
function parseRateLimitError(errorText: string): { retryAfterSeconds: number | null; message: string } {
  try {
    const errorData = JSON.parse(errorText);
    if (errorData?.error?.code === 'rate_limit_exceeded' || errorData?.error?.type === 'requests') {
      // Try to extract retry-after from error message
      const message = errorData.error?.message || '';
      const match = message.match(/try again in (\d+)s/i);
      const retryAfter = match ? parseInt(match[1], 10) : null;
      
      return {
        retryAfterSeconds: retryAfter,
        message: `Rate limit exceeded. ${retryAfter ? `Please wait ${retryAfter} seconds` : 'Please wait a moment'} before retrying. ${message.includes('payment method') ? 'You can increase your rate limit by adding a payment method at https://platform.openai.com/account/billing' : ''}`,
      };
    }
  } catch {
    // Not JSON or not a rate limit error
  }
  return { retryAfterSeconds: null, message: '' };
}

async function callLLM(prompt: string, timeoutMs: number, retryOnRateLimit = true): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  const llmUrl = process.env.LLM_API_URL;
  const provider = process.env.LLM_PROVIDER || 'openai'; // Default to OpenAI for backward compatibility

  // Use LLM API if API key is provided
  if (apiKey) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Support Google Gemini API
      if (provider === 'gemini' || provider === 'google') {
        console.info('[summary] Calling Google Gemini API for summary generation');
        
        // Use gemini-2.5-flash (latest, fastest) or gemini-2.5-pro (more capable)
        // Note: Model names should NOT include "models/" prefix in the URL
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
        
        const fullPrompt = `You are an assistant that summarizes customer support calls into structured JSON. Return ONLY valid JSON, no markdown code blocks, no explanations, no text before or after the JSON.

Required JSON structure:
{
  "issue": "string",
  "resolution": "string", 
  "next_steps": "string",
  "dispositions": [{"label": "string", "score": 0.0-1.0, "subDisposition": "optional string"}],
  "confidence": 0.0-1.0
}

For dispositions, select the most relevant disposition label and provide a specific subDisposition if applicable (e.g., "credit card fraud", "card replacement", "account balance inquiry").

Return ONLY the JSON object, nothing else. Do not wrap in markdown code blocks.\n\n${prompt}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: fullPrompt,
              }],
            }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1000, // Increased to prevent truncation
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          // Handle rate limit errors with retry
          if (response.status === 429 && retryOnRateLimit) {
            console.warn(`[summary] Gemini rate limit hit, waiting 20s before retry...`);
            await new Promise(resolve => setTimeout(resolve, 20000));
            return callLLM(prompt, timeoutMs, false);
          }
          
          // Handle service unavailable/overloaded errors (503) with retry
          if (response.status === 503 && retryOnRateLimit) {
            console.warn(`[summary] Gemini service overloaded (503), waiting 5s before retry...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return callLLM(prompt, timeoutMs, false);
          }
          
          // Parse error message for user-friendly display
          let errorMessage = `Gemini API error: ${response.status} ${response.statusText}`;
          try {
            const errorData = JSON.parse(errorText);
            if (errorData?.error?.message) {
              errorMessage = `Gemini API error: ${errorData.error.message}`;
            }
          } catch {
            // If error text is not JSON, use the raw text
            if (errorText) {
              errorMessage += ` ${errorText}`;
            }
          }
          
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!content) {
          throw new Error('Gemini API returned empty response');
        }

        return content;
      }
      
      // Default to OpenAI API
      console.info('[summary] Calling OpenAI API for summary generation');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an assistant that summarizes customer support calls into structured JSON. Always respond with valid JSON only, no markdown or explanations.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 1000, // Increased to prevent truncation
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle rate limit errors with retry
        if (response.status === 429 && retryOnRateLimit) {
          const rateLimitInfo = parseRateLimitError(errorText);
          const retryAfter = rateLimitInfo.retryAfterSeconds ?? 20; // Default to 20 seconds
          
          console.warn(`[summary] Rate limit hit, waiting ${retryAfter}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          
          // Retry once with exponential backoff disabled to avoid infinite loops
          return callLLM(prompt, timeoutMs, false);
        }
        
        // For other errors, throw with helpful message
        if (response.status === 429) {
          const rateLimitInfo = parseRateLimitError(errorText);
          throw new Error(rateLimitInfo.message || `OpenAI API rate limit: ${errorText}`);
        }
        
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('OpenAI API returned empty response');
      }

      return content;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new TimeoutError(`LLM request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  // Fall back to custom LLM endpoint if URL is provided
  if (!llmUrl) {
    throw new Error('Either LLM_API_KEY or LLM_API_URL must be configured');
  }

  // Validate that llmUrl is actually a URL, not an API key
  try {
    new URL(llmUrl);
  } catch {
    throw new Error(`LLM_API_URL must be a valid URL, but got: ${llmUrl.substring(0, 50)}... (looks like an API key - use LLM_API_KEY instead)`);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(llmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        maxTokens: 400,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(
        `LLM request failed: ${response.status} ${response.statusText} ${raw}`
      );
    }

    return raw;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new TimeoutError(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function parseLLMResponse(raw: string): any {
  // Clean the raw response
  let cleaned = raw.trim();
  
  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Continue to other parsing strategies
  }

  // Remove markdown code blocks (common in Gemini responses)
  // Matches ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Continue
  }

  // Try to detect JSON wrapper structures or embedded JSON
  try {
    const wrapper = JSON.parse(raw);
    if (typeof wrapper === 'string') {
      return JSON.parse(wrapper);
    }

    const content =
      typeof wrapper?.output === 'string'
        ? wrapper.output
        : typeof wrapper?.content === 'string'
        ? wrapper.content
        : Array.isArray(wrapper?.choices) &&
          typeof wrapper.choices[0]?.message?.content === 'string'
        ? wrapper.choices[0].message.content
        : null;

    if (content) {
      return JSON.parse(content);
    }
  } catch (_) {
    // ignore
  }

  // Extract JSON from text (look for first { ... } block)
  // This handles cases where there's text before/after the JSON
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      // If JSON is truncated, try to complete it
      let jsonStr = jsonMatch[0];
      
      // Check if JSON is incomplete (missing closing brace)
      const openBraces = (jsonStr.match(/\{/g) || []).length;
      const closeBraces = (jsonStr.match(/\}/g) || []).length;
      
      if (openBraces > closeBraces) {
        // Try to complete truncated JSON by closing missing braces and adding default values
        let fixed = jsonStr;
        
        // Close missing braces
        for (let i = 0; i < openBraces - closeBraces; i++) {
          fixed += '}';
        }
        
        // Try to fix incomplete strings/arrays/objects
        // If there's a trailing comma or incomplete property, try to close it
        fixed = fixed.replace(/,\s*$/, ''); // Remove trailing comma
        
        // Try to complete common incomplete structures
        if (fixed.includes('"resol') && !fixed.includes('"resolution"')) {
          // Try to add missing resolution field
          fixed = fixed.replace(/("resol[^"]*")?/, '"resolution": "See transcript for details"');
        }
        
        // Ensure all required fields exist
        if (!fixed.includes('"issue"')) {
          fixed = fixed.replace(/\{/, '{"issue": "Summary unavailable", ');
        }
        if (!fixed.includes('"resolution"')) {
          fixed = fixed.replace(/\{/, '{"resolution": "N/A", ');
        }
        if (!fixed.includes('"next_steps"')) {
          fixed = fixed.replace(/\{/, '{"next_steps": "N/A", ');
        }
        if (!fixed.includes('"dispositions"')) {
          fixed = fixed.replace(/\{/, '{"dispositions": [{"label": "general_inquiry", "score": 0.1}], ');
        }
        if (!fixed.includes('"confidence"')) {
          fixed = fixed.replace(/\{/, '{"confidence": 0.5, ');
        }
        
        try {
          return JSON.parse(fixed);
        } catch (err2) {
          console.warn('[parseLLMResponse] Failed to parse even after fixing truncation:', err2);
        }
      }
      
      // Try to find nested JSON objects
      const nestedMatch = cleaned.match(/\{[^{}]*\{[\s\S]*\}[\s\S]*\}/);
      if (nestedMatch) {
        try {
          return JSON.parse(nestedMatch[0]);
        } catch (_) {
          // ignore
        }
      }
    }
  }

  // Last attempt: look for JSON-like structures with more lenient matching
  const looseMatch = cleaned.match(/\{[\s\S]{10,}\}/); // At least 10 chars to avoid false matches
  if (looseMatch) {
    try {
      // Try to fix common issues
      let fixed = looseMatch[0]
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .replace(/'/g, '"'); // Replace single quotes with double quotes (if not in strings)
      
      // Try to complete truncated JSON
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
      }
      
      return JSON.parse(fixed);
    } catch (err) {
      console.warn('[parseLLMResponse] Failed to parse even with fixes:', err);
    }
  }

  // Final fallback: try to extract partial JSON and complete it with defaults
  const partialMatch = cleaned.match(/\{[\s\S]*/);
  if (partialMatch) {
    try {
      let partial = partialMatch[0];
      // Remove trailing incomplete text
      partial = partial.replace(/[^}]*$/, '');
      
      // Ensure it's closed
      const openBraces = (partial.match(/\{/g) || []).length;
      const closeBraces = (partial.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        partial += '}'.repeat(openBraces - closeBraces);
      }
      
      // Try to extract and complete fields
      let result: any = {};
      
      // Extract issue
      const issueMatch = partial.match(/"issue"\s*:\s*"([^"]*)"/);
      if (issueMatch) {
        result.issue = issueMatch[1];
      } else {
        result.issue = 'Summary unavailable';
      }
      
      // Extract resolution (even if truncated)
      const resolMatch = partial.match(/"resol[^"]*"\s*:\s*"([^"]*)/);
      if (resolMatch) {
        result.resolution = resolMatch[1] || 'See transcript for details';
      } else {
        result.resolution = 'N/A';
      }
      
      // Extract next_steps
      const nextStepsMatch = partial.match(/"next_steps"\s*:\s*"([^"]*)"/);
      if (nextStepsMatch) {
        result.next_steps = nextStepsMatch[1];
      } else {
        result.next_steps = 'N/A';
      }
      
      // Extract dispositions
      const dispMatch = partial.match(/"dispositions"\s*:\s*\[(.*?)\]/);
      if (dispMatch) {
        try {
          result.dispositions = JSON.parse(`[${dispMatch[1]}]`);
        } catch {
          result.dispositions = [{ label: 'general_inquiry', score: 0.1 }];
        }
      } else {
        result.dispositions = [{ label: 'general_inquiry', score: 0.1 }];
      }
      
      // Extract confidence
      const confMatch = partial.match(/"confidence"\s*:\s*([0-9.]+)/);
      if (confMatch) {
        result.confidence = parseFloat(confMatch[1]);
      } else {
        result.confidence = 0.5;
      }
      
      console.warn('[parseLLMResponse] Using partial JSON extraction due to truncation');
      return result;
    } catch (err) {
      console.warn('[parseLLMResponse] Failed to extract partial JSON:', err);
    }
  }

  // Log the raw response for debugging
  console.error('[parseLLMResponse] Raw response that failed to parse:', raw.substring(0, 500));
  throw new Error(`Unable to parse LLM response as JSON. Raw response: ${raw.substring(0, 200)}...`);
}

function convertToSummaryPayload(payload: LlmStructuredSummary): SummaryResponse {
  const dispositionsList: RawDisposition[] = Array.isArray(payload.dispositions)
    ? payload.dispositions
    : [];

  const normalizedDispositions = dispositionsList
    .map((item) => ({
      label: String(item.label ?? '').trim().toLowerCase(),
      score: Number.isFinite(Number(item.score))
        ? Number(item.score)
        : Number(item.confidence ?? 0),
      subDisposition: item.subDisposition ? String(item.subDisposition).trim() : undefined,
    }))
    .filter((item) => item.label);

  return {
    issue: payload.issue.trim() || 'Summary unavailable',
    resolution:
      String(payload.resolution ?? '').trim() || 'Resolution not captured.',
    next_steps:
      String(payload.next_steps ?? '').trim() || 'No next steps recorded.',
    dispositions:
      normalizedDispositions.length > 0
        ? normalizedDispositions.map((item) => ({
            label: item.label,
            score: Math.max(0, Math.min(1, item.score ?? 0)),
            subDisposition: item.subDisposition,
          }))
        : [
            {
              label: 'general_inquiry',
              score: 0.1,
            },
          ],
    confidence: Math.max(
      0,
      Math.min(1, Number(payload.confidence ?? 0) || 0)
    ),
    raw: payload,
  };
}

async function loadDispositionTaxonomy(): Promise<TaxonomyRow[]> {
  // Load from new hierarchical disposition_taxonomy view
  const { data, error } = await supabase
    .from('disposition_taxonomy')
    .select('parent_id, parent_code, parent_label, parent_category, sub_dispositions');

  if (error) {
    throw new Error(`Failed to load disposition taxonomy: ${error.message}`);
  }

  // Transform to match TaxonomyRow interface for backward compatibility
  return ((data || []) as any[]).map((row: any) => ({
    parent_id: Number(row.parent_id) || undefined,
    parent_code: String(row.parent_code || ''),
    parent_label: String(row.parent_label || ''),
    parent_category: String(row.parent_category || ''),
    code: String(row.parent_code || ''), // For backward compatibility
    title: String(row.parent_label || ''), // For backward compatibility
    label: String(row.parent_label || ''),
    tags: [], // Tags not in new schema, but kept for compatibility
    sub_dispositions: Array.isArray(row.sub_dispositions) ? row.sub_dispositions : [],
  }));
}

function mapDispositionsToTaxonomy(
  dispositions: SummaryResponse['dispositions'],
  taxonomy: TaxonomyRow[]
): { mapped: MappedDisposition[]; usedFallback: boolean } {
  const mapped: MappedDisposition[] = [];
  let usedFallback = false;

  const fallbackOrder = ['OTHER', 'GENERAL_INQUIRY'];
  const fallbackEntry =
    taxonomy.find((item) =>
      fallbackOrder.includes((item.code || '').toUpperCase())
    ) || null;

  for (const disposition of dispositions) {
    const originalLabel = disposition.label || '';
    const normalized = originalLabel.trim().toLowerCase();
    const normalizedScore = Number.isFinite(disposition.score)
      ? disposition.score
      : 0;

    let matched: TaxonomyRow | null =
      taxonomy.find(
        (item) => (item.code || '').toLowerCase() === normalized
      ) || null;
    let matchType: MappedDisposition['matchType'] = 'code';

    if (!matched) {
      matched =
        taxonomy.find(
          (item) => (item.title || '').toLowerCase() === normalized
        ) || null;
      if (matched) {
        matchType = 'title';
      }
    }

    if (!matched) {
      const tagMatch = taxonomy.find((item) => {
        if (!Array.isArray(item.tags)) return false;
        return item.tags.some(
          (tag) => typeof tag === 'string' && tag.toLowerCase() === normalized
        );
      });

      if (tagMatch) {
        matched = tagMatch;
        matchType = 'tag';
      }
    }

    if (!matched && fallbackEntry) {
      matched = fallbackEntry;
      matchType = 'fallback';
      usedFallback = true;
    } else if (!matched) {
      usedFallback = true;
      matched = {
        parent_code: 'GENERAL_INQUIRY',
        parent_label: 'General Inquiry',
        code: 'GENERAL_INQUIRY',
        title: 'General Inquiry',
        tags: [],
        sub_dispositions: [],
      };
      matchType = 'fallback';
    }

    // Get ID from parent_code or code
    const mappedId = matched.parent_id || null;
    
    // Try to find matching sub-disposition if subDisposition is provided
    let subDispositionId: number | null = null;
    const subDispositionLabel = 'subDisposition' in disposition && disposition.subDisposition
      ? String(disposition.subDisposition).trim()
      : undefined;
    
    if (subDispositionLabel && matched.sub_dispositions && Array.isArray(matched.sub_dispositions)) {
      // Try to match sub-disposition by code or label
      const subMatch = matched.sub_dispositions.find(
        (sub: any) => 
          sub.code?.toLowerCase() === subDispositionLabel.toLowerCase() ||
          sub.label?.toLowerCase() === subDispositionLabel.toLowerCase()
      );
      if (subMatch) {
        subDispositionId = Number(subMatch.id) || null;
      }
    }

    mapped.push({
      originalLabel,
      score: Math.max(0, Math.min(1, normalizedScore)),
      mappedCode: matched.code || matched.parent_code || '',
      mappedTitle: matched.title || matched.parent_label || '',
      mappedId,
      matchType,
      taxonomyTags: Array.isArray(matched.tags) ? matched.tags : [],
      confidence:
        matchType === 'fallback'
          ? Math.min(normalizedScore || 0.2, 0.3)
          : normalizedScore || 0.5,
      subDisposition: subDispositionLabel,
      subDispositionId,
    });
  }

  return { mapped, usedFallback };
}

async function persistAutoNote(params: {
  callId: string;
  tenantId?: string;
  summary: SummaryResponse;
  mappedDispositions: MappedDisposition[];
  rawLLMOutput: string;
  model?: string;
  promptVersion?: string;
}) {
  const {
    callId,
    tenantId,
    summary,
    mappedDispositions,
    rawLLMOutput,
    model,
    promptVersion,
  } = params;

  const payload = {
    call_id: callId,
    tenant_id: tenantId || null,
    issue: summary.issue,
    resolution: summary.resolution,
    next_steps: summary.next_steps,
    dispositions: mappedDispositions.map((item) => ({
      code: item.mappedCode,
      title: item.mappedTitle,
      score: item.score,
      matchType: item.matchType,
      confidence: item.confidence,
    })),
    disposition_id: mappedDispositions.length > 0 ? mappedDispositions[0].mappedId || null : null,
    sub_disposition: mappedDispositions.length > 0 ? mappedDispositions[0].subDisposition || null : null,
    sub_disposition_id: mappedDispositions.length > 0 ? mappedDispositions[0].subDispositionId || null : null,
    confidence: summary.confidence,
    raw_llm_output: truncate(rawLLMOutput, RAW_OUTPUT_LIMIT),
    model: model || null,
    prompt_version: promptVersion || null,
    note: JSON.stringify(
      {
        issue: summary.issue,
        resolution: summary.resolution,
        next_steps: summary.next_steps,
        dispositions: summary.dispositions,
        confidence: summary.confidence,
      },
      null,
      2
    ),
  };

  try {
    const { error } = await (supabase as any)
      .from('auto_notes')
      .upsert(payload, { onConflict: 'call_id' })
      .select('id')
      .single();

    if (error) {
      console.error('[summary] Failed to upsert auto_notes entry', error);
    }
  } catch (err) {
    console.error('[summary] Unexpected error while saving auto_notes', err);
  }
}

function buildFallbackSummary(
  chunks: string[],
  options?: { resolution?: string; nextSteps?: string }
): SummaryResponse {
  const issueSnippet = chunks.slice(0, 2).join(' ').trim();

  return {
    issue: issueSnippet || 'Summary unavailable',
    resolution: options?.resolution ?? 'LLM request failed.',
    next_steps: options?.nextSteps ?? 'Please retry summary generation later.',
    dispositions: [
      {
        label: 'general_inquiry',
        score: 0.1,
      },
    ],
    confidence: 0,
  };
}

export async function generateCallSummary(
  callId: string,
  tenantId?: string
): Promise<GenerateCallSummaryResult> {
  const cacheKey = `${tenantId || 'default'}|${callId}`;
  const cached = getCachedSummary(cacheKey);
  if (cached) {
    return cached;
  }

  let transcriptData: TranscriptData;
  try {
    transcriptData = await fetchTranscript(callId);
  } catch (error: any) {
    const message = error?.message ?? 'Failed to load transcript';
    await emitTelemetry('summary_llm_error', {
      tenant_id: tenantId,
      call_id: callId,
      reason: 'transcript_fetch',
      error: message,
    });

    const fallbackSummary = buildFallbackSummary([], {
      resolution: 'Transcript could not be loaded.',
      nextSteps: 'Please retry after transcript ingestion completes.',
    });

    const taxonomy = await loadDispositionTaxonomy().catch(() => []);
    const { mapped } = mapDispositionsToTaxonomy(
      fallbackSummary.dispositions,
      taxonomy
    );

    const result: GenerateCallSummaryResult = {
      ok: false,
      usedFallback: true,
      summary: fallbackSummary,
      mappedDispositions: mapped,
      error: message,
    };
    setCachedSummary(cacheKey, result);
    return result;
  }

  // Default timeout: 30 seconds for summary generation (LLM calls can be slow)
  // This is longer than intent detection because summaries require more processing
  let baseTimeout = 30000; // 30 seconds
  let autoNotesModel: string | undefined;
  let autoNotesPrompt: string | undefined;

  try {
    const config = await getEffectiveConfig({ tenantId });
    // Support configurable timeout from tenant config
    if (config?.autoNotes?.timeoutMs) {
      const parsedTimeout = Number(config.autoNotes.timeoutMs);
      if (!Number.isNaN(parsedTimeout) && parsedTimeout > 0) {
        baseTimeout = parsedTimeout;
      }
    } else if (config?.kb?.timeoutMs) {
      // Fallback to kb timeout if autoNotes timeout not set
      const parsedTimeout = Number(config.kb.timeoutMs);
      if (!Number.isNaN(parsedTimeout) && parsedTimeout > 0) {
        baseTimeout = parsedTimeout;
      }
    }
    autoNotesModel = config?.autoNotes?.model;
    autoNotesPrompt = config?.autoNotes?.promptVersion;
  } catch (err) {
    console.warn('[summary] Failed to load tenant config, using defaults', err);
  }

  const prompt = buildPrompt(transcriptData.combined);

  let rawLLMOutput = '';
  let parsedPayload: any = null;
  let lastError: Error | null = null;
  let usedFallback = false;

  // Use progressive timeouts: 30s first attempt, 45s second attempt
  // Summary generation can take longer than intent detection
  const attemptTimeouts = [baseTimeout, baseTimeout * 1.5];

  for (let attempt = 0; attempt < attemptTimeouts.length; attempt++) {
    const timeoutMs = attemptTimeouts[attempt];
    try {
      console.info('[summary] Requesting LLM summary', {
        callId,
        tenantId,
        attempt: attempt + 1,
        timeoutMs,
      });

      rawLLMOutput = await callLLM(prompt, timeoutMs);
      parsedPayload = parseLLMResponse(rawLLMOutput);
      break;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const reason = error instanceof TimeoutError ? 'timeout' : 'llm_request';
      
      // Check if it's a service unavailable error (503) - retry with delay
      const isServiceUnavailable = lastError.message.includes('503') || 
                                   lastError.message.includes('overloaded') ||
                                   lastError.message.includes('UNAVAILABLE');
      
      await emitTelemetry('summary_llm_error', {
        tenant_id: tenantId,
        call_id: callId,
        reason,
        attempt: attempt + 1,
        timeout_ms: timeoutMs,
        error: lastError.message,
      });

      if (reason === 'timeout' && attempt === 0) {
        await sleep(200);
        continue;
      }
      
      // Retry on service unavailable errors
      if (isServiceUnavailable && attempt < attemptTimeouts.length - 1) {
        const retryDelay = (attempt + 1) * 3000; // 3s, 6s, etc.
        console.warn(`[summary] Service unavailable, retrying in ${retryDelay}ms...`);
        await sleep(retryDelay);
        continue;
      }

      break;
    }
  }

  if (!parsedPayload) {
    const fallbackSummary = buildFallbackSummary(transcriptData.chunks);
    const taxonomy = await loadDispositionTaxonomy().catch(() => []);
    const { mapped } = mapDispositionsToTaxonomy(
      fallbackSummary.dispositions,
      taxonomy
    );

    await persistAutoNote({
      callId,
      tenantId,
      summary: fallbackSummary,
      mappedDispositions: mapped,
      rawLLMOutput: rawLLMOutput || lastError?.message || 'LLM failure',
      model: autoNotesModel,
      promptVersion: autoNotesPrompt,
    });

    const result: GenerateCallSummaryResult = {
      ok: false,
      summary: fallbackSummary,
      mappedDispositions: mapped,
      usedFallback: true,
      error: lastError?.message ?? 'LLM request failed',
    };

    setCachedSummary(cacheKey, result);
    return result;
  }

  const validation = LLM_RESPONSE_SCHEMA.safeParse(parsedPayload);
  let summaryPayload: SummaryResponse;

  if (!validation.success) {
    usedFallback = true;
    await emitTelemetry('summary_llm_error', {
      tenant_id: tenantId,
      call_id: callId,
      reason: 'malformed_output',
      error: validation.error.message,
    });

    summaryPayload = buildFallbackSummary(transcriptData.chunks, {
      resolution: 'See raw output',
      nextSteps: 'Review raw model output for details.',
    });
  } else {
    summaryPayload = convertToSummaryPayload(validation.data);
  }

  const taxonomy = await loadDispositionTaxonomy().catch((error) => {
    console.error('[summary] Failed to load disposition taxonomy', error);
    return [];
  });

  const { mapped, usedFallback: mappingFallback } = mapDispositionsToTaxonomy(
    summaryPayload.dispositions,
    taxonomy
  );
  usedFallback = usedFallback || mappingFallback;

  await persistAutoNote({
    callId,
    tenantId,
    summary: summaryPayload,
    mappedDispositions: mapped,
    rawLLMOutput: rawLLMOutput || JSON.stringify(parsedPayload),
    model: autoNotesModel,
    promptVersion: autoNotesPrompt,
  });

  if (!validation.success) {
    const result: GenerateCallSummaryResult = {
      ok: false,
      summary: summaryPayload,
      mappedDispositions: mapped,
      usedFallback: true,
      error: 'LLM returned malformed output',
    };
    setCachedSummary(cacheKey, result);
    return result;
  }

  await emitTelemetry('summary_generated', {
    tenant_id: tenantId,
    call_id: callId,
    dispositions: mapped.length,
    usedFallback,
    confidence: summaryPayload.confidence,
  });

  const result: GenerateCallSummaryResult = {
    ok: true,
    summary: summaryPayload,
    mappedDispositions: mapped,
    usedFallback,
  };

  setCachedSummary(cacheKey, result);
  return result;
}

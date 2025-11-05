import { supabase } from '@/lib/supabase';
import { getEffectiveConfig } from '@/lib/config';
import { emitTelemetry } from '@/lib/telemetry';
import { z, infer as zInfer } from 'zod';

type RawDisposition = {
  label?: string;
  score?: number;
  confidence?: number;
};

export interface SummaryResponse {
  issue: string;
  resolution: string;
  next_steps: string;
  dispositions: Array<{ label: string; score: number }>;
  confidence: number;
  raw?: any;
}

export interface MappedDisposition {
  originalLabel: string;
  score: number;
  mappedCode: string;
  mappedTitle: string;
  matchType: 'code' | 'title' | 'tag' | 'fallback';
  taxonomyTags: string[];
  confidence: number;
}

export interface GenerateCallSummaryResult {
  ok: boolean;
  summary?: SummaryResponse;
  mappedDispositions?: MappedDisposition[];
  usedFallback: boolean;
  error?: string;
}

interface TaxonomyRow {
  code: string;
  title: string;
  tags?: string[] | null;
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
  const { data, error } = await supabase
    .from('ingest_events')
    .select('text')
    .eq('call_id', callId)
    .order('seq', { ascending: true });

  if (error) {
    throw new Error(`Failed to load transcript: ${error.message}`);
  }

  const chunks =
    data
      ?.map((row) => (row?.text ?? '').trim())
      .filter((text) => Boolean(text)) ?? [];

  if (chunks.length === 0) {
    throw new Error('No transcript events found for call');
  }

  return {
    combined: chunks.join('\n'),
    chunks,
  };
}

function buildPrompt(transcript: string): string {
  return [
    'You are an assistant that summarizes a customer support call into structured JSON with fields:',
    'issue (string), resolution (string), next_steps (string), dispositions (array of {label, score between 0 and 1}), confidence (0-1).',
    'Return ONLY valid JSON. Do not include markdown, prose, or explanations.',
    '',
    'Transcript:',
    '"""',
    transcript.trim(),
    '"""',
  ].join('\n');
}

async function callLLM(prompt: string, timeoutMs: number): Promise<string> {
  const llmUrl = process.env.LLM_API_URL;
  if (!llmUrl) {
    throw new Error('LLM_API_URL is not configured');
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
  try {
    return JSON.parse(raw);
  } catch (_) {
    // Try to detect JSON wrapper structures or embedded JSON
  }

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

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (_) {
      // ignore
    }
  }

  throw new Error('Unable to parse LLM response as JSON');
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
  const { data, error } = await supabase
    .from('disposition_taxonomy')
    .select('code,title,tags');

  if (error) {
    throw new Error(`Failed to load disposition taxonomy: ${error.message}`);
  }

  return data || [];
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
        code: 'GENERAL_INQUIRY',
        title: 'General Inquiry',
        tags: [],
      };
      matchType = 'fallback';
    }

    mapped.push({
      originalLabel,
      score: Math.max(0, Math.min(1, normalizedScore)),
      mappedCode: matched.code,
      mappedTitle: matched.title,
      matchType,
      taxonomyTags: Array.isArray(matched.tags) ? matched.tags : [],
      confidence:
        matchType === 'fallback'
          ? Math.min(normalizedScore || 0.2, 0.3)
          : normalizedScore || 0.5,
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
    const { error } = await supabase
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

  let baseTimeout = 2500;
  let autoNotesModel: string | undefined;
  let autoNotesPrompt: string | undefined;

  try {
    const config = await getEffectiveConfig({ tenantId });
    if (config?.kb?.timeoutMs) {
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

  const attemptTimeouts = [baseTimeout, 4000];

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

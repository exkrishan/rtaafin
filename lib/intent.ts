/**
 * Intent Detection Library
 * Uses OpenAI API to detect customer intent from transcript chunks
 */

interface IntentResult {
  intent: string;
  confidence: number;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Detect customer intent from transcript text using OpenAI
 * @param text - The transcript text to analyze
 * @param context - Optional previous transcript chunks for context
 * @returns Intent label and confidence score
 */
export async function detectIntent(
  text: string,
  context?: string[]
): Promise<IntentResult> {
  const apiKey = process.env.LLM_API_KEY;
  const provider = process.env.LLM_PROVIDER || 'openai';

  if (!apiKey) {
    console.warn('[intent] LLM_API_KEY not configured, returning unknown intent');
    return { intent: 'unknown', confidence: 0 };
  }

  try {
    // Build context window
    const contextText = context && context.length > 0
      ? `Previous context:\n${context.join('\n')}\n\nCurrent:`
      : 'Current:';

    const prompt = `You are an intent classifier for customer support calls. Analyze the transcript and identify the PRIMARY intent. Be specific - distinguish between different card types and account types.

${contextText}
"${text}"

IMPORTANT: 
- "credit card" issues are DIFFERENT from "debit card" or "account" issues
- "credit card" = credit_card, credit_card_fraud, credit_card_block, credit_card_replacement
- "debit card" = debit_card, debit_card_fraud, debit_card_block
- "account" issues = account_balance, account_inquiry, savings_account, salary_account (only if specifically mentioned)
- "fraud" = fraudulent_transaction, unauthorized_charge, dispute_fraud

Respond ONLY with valid JSON in this exact format:
{"intent": "intent_label", "confidence": 0.0}

Use specific intents like: credit_card_fraud, credit_card_block, credit_card_replacement, debit_card_fraud, account_balance, payment_issue, etc.`;

    console.info('[intent] Starting detection', {
      textLength: text.length,
      textPreview: text.substring(0, 100),
      provider,
      hasApiKey: !!apiKey,
    });

    // Support Google Gemini API
    if (provider === 'gemini' || provider === 'google') {
      // Use gemini-2.0-flash (stable, no thinking tokens) or gemini-2.5-flash (with higher token limit)
      // Available models: gemini-2.0-flash, gemini-2.5-flash, gemini-2.0-flash-lite
      // Note: Model names should NOT include "models/" prefix in the URL
      let model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      
      // Use gemini-2.0-flash if 2.5 is specified (to avoid thinking token issues)
      const actualModel = model.includes('2.5') ? 'gemini-2.0-flash' : model;
      const url = `https://generativelanguage.googleapis.com/v1/models/${actualModel}:generateContent?key=${apiKey}`;
      
      console.info('[intent] Calling Google Gemini API', {
        requestedModel: model,
        actualModel: actualModel,
        url: url.substring(0, 80) + '...',
        promptLength: prompt.length,
      });
      
      const fullPrompt = `You are a customer support intent classifier. Always respond with valid JSON containing "intent" and "confidence" fields.\n\n${prompt}`;
      
      let response;
      try {
        response = await fetch(url, {
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
              maxOutputTokens: 200, // Sufficient for gemini-2.0-flash (doesn't use thinking tokens)
            },
          }),
        });
      } catch (fetchErr: any) {
        console.error('[intent] Fetch error (network/timeout):', {
          error: fetchErr.message,
          name: fetchErr.name,
          code: fetchErr.code,
        });
        return { intent: 'unknown', confidence: 0 };
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[intent] Gemini API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          url: url.substring(0, 100) + '...',
        });
        return { intent: 'unknown', confidence: 0 };
      }

      const data = await response.json();
      
      // Check if response was truncated
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason === 'MAX_TOKENS') {
        console.warn('[intent] Gemini response truncated (MAX_TOKENS), increasing token limit might help');
      }
      
      const content = candidate?.content?.parts?.[0]?.text;

      if (!content) {
        // Check if response was truncated due to thinking tokens (gemini-2.5-flash issue)
        if (candidate?.finishReason === 'MAX_TOKENS') {
          console.error('[intent] No content in Gemini response - truncated by thinking tokens', {
            finishReason: candidate?.finishReason,
            model: actualModel,
            totalTokens: data.usageMetadata?.totalTokenCount,
            thinkingTokens: data.usageMetadata?.thoughtsTokenCount,
            promptTokens: data.usageMetadata?.promptTokenCount,
            suggestion: 'Using gemini-1.5-flash instead of gemini-2.5-flash to avoid thinking tokens',
          });
        } else {
          console.error('[intent] No content in Gemini response', {
            finishReason: candidate?.finishReason,
            candidates: data.candidates?.length || 0,
            responseKeys: Object.keys(data),
            candidateKeys: candidate ? Object.keys(candidate) : [],
          });
        }
        return { intent: 'unknown', confidence: 0 };
      }

      // Parse JSON response - handle markdown code blocks and truncation
      let cleanedContent = content.trim();
      
      // Remove markdown code blocks if present
      cleanedContent = cleanedContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      cleanedContent = cleanedContent.trim();
      
      // Handle truncated JSON (if response was cut off)
      if (candidate?.finishReason === 'MAX_TOKENS' && !cleanedContent.endsWith('}')) {
        // Try to complete truncated JSON
        if (cleanedContent.includes('"intent"') && cleanedContent.includes('"confidence"')) {
          // Extract intent and confidence from truncated JSON
          const intentMatch = cleanedContent.match(/"intent"\s*:\s*"([^"]*)"/);
          const confidenceMatch = cleanedContent.match(/"confidence"\s*:\s*([0-9.]+)/);
          
          if (intentMatch && confidenceMatch) {
            console.warn('[intent] Response truncated, using extracted values', {
              intent: intentMatch[1],
              confidence: confidenceMatch[1],
            });
            cleanedContent = JSON.stringify({
              intent: intentMatch[1],
              confidence: parseFloat(confidenceMatch[1]),
            });
          } else {
            // Try to fix by adding closing brace
            if (cleanedContent.includes('{') && !cleanedContent.includes('}')) {
              cleanedContent = cleanedContent.replace(/,\s*$/, '') + '}';
            }
          }
        }
      }
      
      let result;
      try {
        result = JSON.parse(cleanedContent);
      } catch (parseErr: any) {
        console.error('[intent] Failed to parse Gemini response:', {
          originalContent: content.substring(0, 200),
          cleanedContent: cleanedContent.substring(0, 200),
          finishReason: candidate?.finishReason,
          error: parseErr.message,
        });
        return { intent: 'unknown', confidence: 0 };
      }

      // Normalize intent
      const normalizedIntent = normalizeIntent(result.intent);
      const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));

      console.info('[intent] Detected intent:', { 
        raw: result.intent,
        normalized: normalizedIntent, 
        confidence,
        provider: 'gemini',
      });

      return {
        intent: normalizedIntent,
        confidence,
      };
    }

    // Default to OpenAI API
    console.info('[intent] Calling OpenAI API for intent detection');

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
            content: 'You are a customer support intent classifier. Always respond with valid JSON containing "intent" and "confidence" fields.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[intent] OpenAI API error:', response.status, errorText);
      return { intent: 'unknown', confidence: 0 };
    }

    const data: OpenAIResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error('[intent] No content in OpenAI response');
      return { intent: 'unknown', confidence: 0 };
    }

    // Parse JSON response
    const result = JSON.parse(content.trim());

    // Normalize intent
    const normalizedIntent = normalizeIntent(result.intent);
    const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));

    console.info('[intent] Detected intent:', { intent: normalizedIntent, confidence });

    return {
      intent: normalizedIntent,
      confidence,
    };
  } catch (error: any) {
    console.error('[intent] Error detecting intent:', error.message);
    return { intent: 'unknown', confidence: 0 };
  }
}

/**
 * Normalize intent string for consistency and KB query
 * @param str - Raw intent string
 * @returns Normalized intent string
 */
export function normalizeIntent(str: string): string {
  if (!str) return 'unknown';

  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars except space and dash
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/-+/g, '_') // Replace dashes with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .substring(0, 50); // Limit length
}

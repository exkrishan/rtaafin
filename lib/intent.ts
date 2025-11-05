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

  if (!apiKey) {
    console.warn('[intent] LLM_API_KEY not configured, returning unknown intent');
    return { intent: 'unknown', confidence: 0 };
  }

  try {
    // Build context window
    const contextText = context && context.length > 0
      ? `Previous context:\n${context.join('\n')}\n\nCurrent:`
      : 'Current:';

    const prompt = `You are an intent classifier for customer support calls. Given the transcript snippet below, output a concise 3-5 word intent label and a confidence score (0-1).

${contextText}
"${text}"

Respond ONLY with valid JSON in this exact format:
{"intent": "intent_label", "confidence": 0.0}

Common intents: reset_password, update_billing, plan_upgrade, account_inquiry, technical_support, cancel_service, payment_issue`;

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

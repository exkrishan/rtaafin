/**
 * Core Ingest Transcript Logic
 * Shared function that can be called directly (by TranscriptConsumer) or via HTTP (by external clients)
 * 
 * ARCHITECTURE:
 * - Transcripts: In-memory only, broadcast directly to UI via SSE (instant, no DB)
 * - Intents: Stored in Supabase (needed for KB lookup and analytics)
 * - KB Articles: Fetched from Supabase
 * - Disposition: Generated from in-memory transcripts + intent data
 */

import { supabase } from '@/lib/supabase';
import { detectIntent } from '@/lib/intent';
import { broadcastEvent } from '@/lib/realtime';
import { getKbAdapter, type KBArticle } from '@/lib/kb-adapter';
import { getEffectiveConfig } from '@/lib/config';

// In-memory transcript cache (for polling fallback)
// Key: callId, Value: array of transcripts
const transcriptCache = new Map<string, Array<{
  seq: number;
  text: string;
  ts: string;
  speaker: 'agent' | 'customer';
}>>();

// Cache cleanup (remove old calls after 1 hour)
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [callId, timestamp] of cacheTimestamps.entries()) {
    if (now - timestamp > CACHE_TTL) {
      transcriptCache.delete(callId);
      cacheTimestamps.delete(callId);
      console.log('[ingest-transcript-core] 🧹 Cleaned up old call from cache:', callId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

/**
 * Get transcripts from in-memory cache
 */
export function getTranscriptsFromCache(callId: string) {
  return transcriptCache.get(callId) || [];
}

/**
 * Get the most recent callId with transcripts from cache
 */
export function getLatestCallIdFromCache(): { callId: string; transcriptCount: number; latestActivity: string } | null {
  if (cacheTimestamps.size === 0) {
    return null;
  }
  
  // Find the callId with the most recent timestamp
  let latestCallId: string | null = null;
  let latestTimestamp = 0;
  
  for (const [callId, timestamp] of cacheTimestamps.entries()) {
    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestCallId = callId;
    }
  }
  
  if (!latestCallId) {
    return null;
  }
  
  const transcripts = transcriptCache.get(latestCallId) || [];
  
  return {
    callId: latestCallId,
    transcriptCount: transcripts.length,
    latestActivity: new Date(latestTimestamp).toISOString(),
  };
}

/**
 * Clear transcripts for a specific call (called on disposition)
 */
export function clearCallFromCache(callId: string): boolean {
  const hadTranscripts = transcriptCache.has(callId);
  
  transcriptCache.delete(callId);
  cacheTimestamps.delete(callId);
  
  console.info('[ingest-transcript-core] 🧹 Cleared call from cache (disposed)', {
    callId,
    hadTranscripts,
    remainingCalls: transcriptCache.size,
  });
  
  return hadTranscripts;
}

/**
 * Detect speaker from text patterns
 */
function detectSpeaker(text: string, seq: number): 'agent' | 'customer' {
  const lowerText = text.toLowerCase().trim();
  
  // Agent indicators (common agent phrases)
  const agentPatterns = [
    /^(hi|hello|good morning|good afternoon|good evening|thank you for calling|how may i help|how can i assist)/i,
    /^(i can|i will|i'll|let me|i understand|i see|i'll help|i can help)/i,
    /^(is there anything else|anything else i can|have a great day|thank you for calling|you're welcome)/i,
    /^(please hold|one moment|let me check|i'll transfer|i'll connect)/i,
  ];
  
  // Customer indicators (common customer phrases)
  const customerPatterns = [
    /^(i need|i want|i would like|i'm calling|i have|i noticed|i saw|i received)/i,
    /^(my card|my account|my balance|my transaction|my statement)/i,
    /^(can you|could you|please|help me|i need help)/i,
    /^(there's|there is|something|someone|fraud|unauthorized|stolen|lost)/i,
  ];
  
  // Check agent patterns first (more specific)
  for (const pattern of agentPatterns) {
    if (pattern.test(text)) {
      return 'agent';
    }
  }
  
  // Check customer patterns
  for (const pattern of customerPatterns) {
    if (pattern.test(text)) {
      return 'customer';
    }
  }
  
  // Fallback: alternate based on seq (better than always 'customer')
  return seq % 2 === 0 ? 'customer' : 'agent';
}

/**
 * Expand intent label into multiple search terms for better KB matching
 */
function expandIntentToSearchTerms(intent: string, originalText: string): string[] {
  const terms = new Set<string>();
  
  // Add the full intent
  terms.add(intent);
  
  // Split intent by underscores and add individual words
  const words = intent.split('_').filter(w => w.length > 2);
  words.forEach(word => terms.add(word));
  
  // Extract key phrases from original text for context (more precise matching)
  const textLower = originalText.toLowerCase();
  
  // CREDIT CARD specific terms (high priority)
  if (intent.includes('credit_card') || textLower.includes('credit card') || textLower.includes('creditcard')) {
    terms.add('credit card');
    terms.add('credit');
    if (textLower.includes('fraud') || textLower.includes('fraudulent') || textLower.includes('unauthorized')) {
      terms.add('fraud');
      terms.add('fraudulent');
      terms.add('unauthorized');
      terms.add('dispute');
    }
    if (textLower.includes('block') || textLower.includes('blocked') || textLower.includes('blocking')) {
      terms.add('block');
      terms.add('blocked');
      terms.add('card block');
    }
    if (textLower.includes('replacement') || textLower.includes('replace') || textLower.includes('new card')) {
      terms.add('replacement');
      terms.add('replace');
      terms.add('new card');
    }
    if (textLower.includes('issue') || textLower.includes('issuing')) {
      terms.add('issue');
      terms.add('card issue');
    }
  }
  
  // DEBIT CARD specific terms
  else if (intent.includes('debit_card') || textLower.includes('debit card') || textLower.includes('debitcard')) {
    terms.add('debit card');
    terms.add('debit');
    if (textLower.includes('fraud') || textLower.includes('fraudulent')) {
      terms.add('fraud');
      terms.add('fraudulent');
    }
  }
  
  // ACCOUNT specific terms (only if intent is account-related)
  else if (intent.includes('account') && !intent.includes('credit_card') && !intent.includes('debit_card')) {
    if (textLower.includes('salary') || textLower.includes('salary account')) {
      terms.add('salary account');
      terms.add('salary');
    } else if (textLower.includes('savings') || textLower.includes('savings account')) {
      terms.add('savings account');
      terms.add('savings');
    } else {
      terms.add('account');
    }
    if (textLower.includes('balance')) {
      terms.add('balance');
      terms.add('account balance');
    }
  }
  
  // Generic terms only if no specific card/account match
  if (!intent.includes('credit_card') && !intent.includes('debit_card') && !intent.includes('account')) {
    const genericTerms = ['fraud', 'transaction', 'payment', 'billing', 'charge', 'dispute', 'refund'];
    for (const term of genericTerms) {
      if (textLower.includes(term)) {
        terms.add(term);
      }
    }
  }
  
  // Map specific intent patterns to keywords
  const intentMappings: Record<string, string[]> = {
    'credit_card': ['credit card', 'credit'],
    'credit_card_fraud': ['credit card fraud', 'credit card fraudulent', 'credit card unauthorized'],
    'credit_card_block': ['credit card block', 'credit card blocked', 'block credit card'],
    'credit_card_replacement': ['credit card replacement', 'new credit card', 'replace credit card'],
    'debit_card': ['debit card', 'debit'],
    'debit_card_fraud': ['debit card fraud', 'debit card fraudulent'],
    'fraud': ['fraud', 'fraudulent', 'unauthorized', 'dispute'],
    'transaction': ['transaction', 'charge', 'transfer'],
    'salary_account': ['salary account', 'salary'],
    'savings_account': ['savings account', 'savings'],
    'account_balance': ['account balance', 'balance'],
    'security': ['security', 'authentication', 'verification', '2fa'],
    'sim': ['sim', 'sim card', 'replacement'],
    'password': ['password', 'reset', 'forgot'],
  };
  
  for (const [key, values] of Object.entries(intentMappings)) {
    if (intent.includes(key)) {
      values.forEach(v => terms.add(v));
    }
  }
  
  return Array.from(terms);
}

export interface IngestTranscriptParams {
  callId: string;
  seq: number;
  ts: string;
  text: string;
  tenantId?: string;
  waitForKB?: boolean; // If true, wait for KB articles to be fetched synchronously (for demo mode)
}

export interface IngestTranscriptResult {
  ok: boolean;
  intent?: string;
  confidence?: number;
  articles?: KBArticle[];
  error?: string;
}

/**
 * Core function to ingest a transcript chunk
 * This can be called directly (by TranscriptConsumer) or via HTTP (by external clients)
 */
export async function ingestTranscriptCore(
  params: IngestTranscriptParams
): Promise<IngestTranscriptResult> {
  try {
    // Fix 1.1: Validate required fields with enhanced callId validation
    if (!params.callId || (typeof params.callId === 'string' && params.callId.trim().length === 0)) {
      console.error('[ingest-transcript-core] ❌ Invalid callId in params', {
        callId: params.callId,
        callIdType: typeof params.callId,
        seq: params.seq,
        timestamp: new Date().toISOString(),
      });
      return {
        ok: false,
        error: 'Missing or invalid callId field',
      };
    }
    
    if (params.seq === undefined || !params.ts || !params.text) {
      return {
        ok: false,
        error: 'Missing required fields: seq, ts, or text',
      };
    }
    
    // Fix 1.1: Ensure callId is a valid string
    const validatedCallId = String(params.callId).trim();
    if (validatedCallId.length === 0) {
      console.error('[ingest-transcript-core] ❌ callId is empty after validation', {
        originalCallId: params.callId,
        seq: params.seq,
      });
      return {
        ok: false,
        error: 'callId cannot be empty',
      };
    }

    const tenantId = params.tenantId || 'default';

    // CRITICAL FIX: Smart auto-subscription on first transcript
    // This replaces blind auto-discovery to prevent memory leaks from old calls
    // Only subscribe when we receive actual transcripts (proves call is active)
    if (params.seq <= 2) { // First or second transcript
      try {
        const { subscribeToTranscripts } = await import('./transcript-consumer');
        await subscribeToTranscripts(validatedCallId);
        console.info('[ingest-transcript-core] ✅ Auto-subscribed to new call (first transcript)', {
          callId: validatedCallId,
          seq: params.seq,
          timestamp: new Date().toISOString(),
        });
      } catch (subscribeErr: any) {
        // Already subscribed or consumer not running - this is fine
        if (!subscribeErr.message?.includes('already') && !subscribeErr.message?.includes('subscription')) {
          console.warn('[ingest-transcript-core] Failed to auto-subscribe (non-critical)', {
            callId: validatedCallId,
            seq: params.seq,
            error: subscribeErr.message,
          });
        }
      }
    }

    console.info('[ingest-transcript-core] Processing transcript chunk', {
      callId: validatedCallId,
      seq: params.seq,
      ts: params.ts,
      textLength: params.text.length,
      textPreview: params.text.substring(0, 50),
      tenantId,
      timestamp: new Date().toISOString(),
      note: 'Transcripts NOT stored in DB - direct streaming to UI only',
    });

    // OPTIMIZATION: Store transcripts in-memory cache (not in database)
    // This enables instant SSE broadcasting + polling fallback without DB overhead
    const detectedSpeaker = detectSpeaker(params.text, params.seq);
    
    if (!transcriptCache.has(validatedCallId)) {
      transcriptCache.set(validatedCallId, []);
    }
    
    const callTranscripts = transcriptCache.get(validatedCallId)!;
    callTranscripts.push({
      seq: params.seq,
      text: params.text,
      ts: params.ts,
      speaker: detectedSpeaker,
    });
    
    // Sort by seq to maintain order
    callTranscripts.sort((a, b) => a.seq - b.seq);
    
    // Update cache timestamp for TTL
    cacheTimestamps.set(validatedCallId, Date.now());
    
    console.info('[ingest-transcript-core] ✅ Transcript cached in-memory', {
      callId: validatedCallId,
      seq: params.seq,
      cacheSize: callTranscripts.length,
      speaker: detectedSpeaker,
      note: 'Instant SSE broadcast + polling fallback (no DB storage)',
    });

    // Broadcast transcript line to real-time listeners
    // CRITICAL FIX: Broadcast IMMEDIATELY (don't wait for intent detection)
    try {
      // Task 1.2: Enhanced logging before broadcast
      console.log('[DEBUG] Broadcasting transcript with callId:', params.callId, {
        callIdType: typeof params.callId,
        callIdLength: params.callId?.length || 0,
        isEmpty: !params.callId || params.callId.trim().length === 0,
        seq: params.seq,
        textLength: params.text.length,
        timestamp: new Date().toISOString(),
      });
      
      // CRITICAL FIX: Use speaker detection instead of hardcoded 'customer'
      const detectedSpeaker = detectSpeaker(params.text, params.seq);
      
      const broadcastPayload = {
        type: 'transcript_line' as const,
        callId: params.callId,
        seq: params.seq,
        ts: params.ts,
        text: params.text,
        speaker: detectedSpeaker, // Use detected speaker instead of hardcoded 'customer'
      };
      
      console.info('[ingest-transcript-core] 📤 Broadcasting transcript_line', {
        callId: params.callId,
        seq: params.seq,
        textLength: params.text.length,
        textPreview: params.text.substring(0, 50),
        speaker: detectedSpeaker,
        timestamp: new Date().toISOString(),
        note: 'UI should be connected with this exact callId to receive this event',
      });
      
      broadcastEvent(broadcastPayload);
      console.info('[ingest-transcript-core] ✅ Broadcast transcript_line', {
        callId: validatedCallId,
        seq: params.seq,
        textLength: params.text.length,
        textPreview: params.text.substring(0, 50),
        speaker: detectedSpeaker,
        timestamp: new Date().toISOString(),
      });
    } catch (broadcastErr) {
      console.error('[ingest-transcript-core] ❌ Failed to broadcast transcript_line:', {
        error: broadcastErr,
        callId: validatedCallId,
        seq: params.seq,
        timestamp: new Date().toISOString(),
      });
      // Don't fail the request
    }

    // CRITICAL FIX: Intent detection and KB surfacing - make it NON-BLOCKING
    // This prevents latency from blocking transcript broadcasting
    // CRITICAL FIX: Always try to surface KB articles, even for short text
    // Reduced minimum length to ensure KB suggestions trigger for all transcripts
    const MIN_TEXT_LENGTH_FOR_INTENT = 5; // Reduced from 10 to catch more transcripts
    const shouldDetectIntent = params.text.trim().length >= MIN_TEXT_LENGTH_FOR_INTENT;

    // If waitForKB is true (demo mode), wait for KB articles synchronously
    if (params.waitForKB) {
      let intent = 'unknown';
      let confidence = 0.0;
      let articles: KBArticle[] = [];

      // Try intent-based KB surfacing first
      if (shouldDetectIntent) {
        try {
          const intentResult = await detectIntentAndSurfaceKB(validatedCallId, params.text, params.seq, tenantId, true);
          intent = intentResult.intent;
          confidence = intentResult.confidence;
          articles = intentResult.articles || [];
        } catch (err) {
          console.error('[ingest-transcript-core] Intent detection failed (synchronous):', err);
        }
      }

      // Always try text-based KB surfacing (even if intent detection ran)
      // This ensures we get articles even if intent detection fails
      try {
        const textBasedArticles = await surfaceKBFromText(validatedCallId, params.text, params.seq, tenantId, true);
        // Merge articles, avoiding duplicates
        const existingIds = new Set(articles.map(a => a.id));
        for (const article of textBasedArticles) {
          if (!existingIds.has(article.id)) {
            articles.push(article);
            existingIds.add(article.id);
          }
        }
      } catch (err) {
        console.error('[ingest-transcript-core] KB text search failed (synchronous):', err);
      }

      return {
        ok: true,
        intent,
        confidence,
        articles: articles.slice(0, 10), // Limit to 10 articles for demo
      };
    }

    // Fire and forget - don't await intent detection (non-blocking)
    if (shouldDetectIntent) {
      detectIntentAndSurfaceKB(validatedCallId, params.text, params.seq, tenantId)
        .catch(err => {
          console.error('[ingest-transcript-core] Intent detection failed (non-blocking):', err);
        });
    }
    
    // CRITICAL FIX: Always try to surface KB articles, even for short text or when intent detection runs
    // This ensures KB suggestions appear even if intent detection fails or text is short
    surfaceKBFromText(validatedCallId, params.text, params.seq, tenantId)
      .catch(err => {
        console.error('[ingest-transcript-core] KB surfacing failed (non-blocking):', err);
      });

    // Return immediately (don't wait for intent detection)
    return {
      ok: true,
      intent: 'unknown', // Will be updated asynchronously via intent_update event
      confidence: 0.0,
      articles: [], // Will be updated asynchronously via intent_update event
    };
  } catch (err: any) {
    console.error('[ingest-transcript-core] Error:', err);
    return {
      ok: false,
      error: err.message || String(err),
    };
  }
}

/**
 * CRITICAL FIX: Async function for intent detection and KB surfacing
 * This runs in the background and doesn't block transcript broadcasting
 */
async function detectIntentAndSurfaceKB(
  callId: string,
  text: string,
  seq: number,
  tenantId: string,
  returnArticles: boolean = false
): Promise<{ intent: string; confidence: number; articles: KBArticle[] }> {
  let intent = 'unknown';
  let confidence = 0.0;
  let articles: KBArticle[] = [];

  try {
    console.info('[ingest-transcript-core] Detecting intent for seq:', seq, {
      textLength: text.length,
      textPreview: text.substring(0, 100),
    });
    
    const intentResult = await detectIntent(text);
    intent = intentResult.intent;
    confidence = intentResult.confidence;

    console.info('[ingest-transcript-core] Intent detected:', { 
      intent, 
      confidence,
      wasSuccessful: intent !== 'unknown',
    });

    // Store intent in database
    try {
      const { error: intentError } = await (supabase as any).from('intents').insert({
        call_id: callId,
        seq,
        intent,
        confidence,
        created_at: new Date().toISOString(),
      });

      if (intentError) {
        console.error('[ingest-transcript-core] Failed to store intent:', intentError);
      } else {
        console.info('[ingest-transcript-core] Intent stored in database');
      }
    } catch (intentDbErr) {
      console.error('[ingest-transcript-core] Intent DB error:', intentDbErr);
    }

    // Fetch relevant KB articles based on intent
    if (intent && intent !== 'unknown') {
      try {
        console.info('[ingest-transcript-core] Fetching KB articles for intent:', intent);

        const config = await getEffectiveConfig({ tenantId });
        const kbAdapter = await getKbAdapter(tenantId);
        const searchTerms = expandIntentToSearchTerms(intent, text);
        
        console.info('[ingest-transcript-core] Expanded search terms:', searchTerms);

        const allArticles: typeof articles = [];
        const seenIds = new Set<string>();

        // Strategy 1: Search with full intent
        const fullIntentResults = await kbAdapter.search(intent, {
          tenantId,
          max: config.kb.maxArticles,
          context: [text],
        });
        
        for (const article of fullIntentResults) {
          if (!seenIds.has(article.id)) {
            allArticles.push(article);
            seenIds.add(article.id);
          }
        }

        // Strategy 2: Search with expanded terms (PARALLELIZED)
        // CRITICAL FIX: Run searches in parallel, but process results sequentially to maintain deduplication
        const searchPromises = searchTerms
          .filter(term => term.length >= 3) // Filter short terms
          .map(term => 
            kbAdapter.search(term, {
              tenantId,
              max: Math.floor(config.kb.maxArticles / searchTerms.length) || 3,
              context: [text],
            }).catch(err => {
              // CRITICAL FIX: Handle individual search failures gracefully
              console.warn('[ingest-transcript-core] KB search failed for term', {
                term,
                error: err?.message || String(err),
              });
              return []; // Return empty array on error
            })
          );

        // CRITICAL FIX: Wait for all searches to complete (parallel execution)
        const searchResults = await Promise.all(searchPromises);

        // CRITICAL FIX: Process results sequentially to maintain deduplication logic
        for (const termResults of searchResults) {
          if (!Array.isArray(termResults)) {
            // Skip invalid results
            continue;
          }

          for (const article of termResults) {
            // CRITICAL FIX: Maintain existing deduplication logic
            if (!seenIds.has(article.id) && allArticles.length < config.kb.maxArticles) {
              allArticles.push(article);
              seenIds.add(article.id);
            }
          }
        }

        articles = allArticles.slice(0, config.kb.maxArticles);

        console.info('[ingest-transcript-core] Found KB articles:', {
          count: articles.length,
          provider: articles[0]?.source || 'none',
          maxArticles: config.kb.maxArticles,
          searchTerms,
        });
      } catch (kbErr) {
        console.error('[ingest-transcript-core] KB fetch error:', kbErr);
        // Continue without articles
      }
    } else {
      // CRITICAL FIX: Even if intent is unknown, try to surface KB articles using transcript text
      if (!returnArticles) {
        await surfaceKBFromText(callId, text, seq, tenantId);
      } else {
        // In synchronous mode, fetch articles and add to result
        const textBasedArticles = await surfaceKBFromText(callId, text, seq, tenantId, true);
        articles = [...articles, ...textBasedArticles];
      }
    }

    // Broadcast intent update to real-time listeners
    try {
      const intentUpdatePayload = {
        type: 'intent_update' as const,
        callId,
        seq,
        intent,
        confidence,
        articles,
      };
      
      console.info('[ingest-transcript-core] 📤 Broadcasting intent_update', {
        callId,
        seq,
        intent,
        confidence,
        articlesCount: articles.length,
        timestamp: new Date().toISOString(),
        note: 'UI should be connected with this exact callId to receive this event',
      });
      
      broadcastEvent(intentUpdatePayload);
      
      console.info('[ingest-transcript-core] ✅ Broadcast intent_update', {
        callId,
        seq,
        intent,
        confidence,
        articlesCount: articles.length,
        timestamp: new Date().toISOString(),
      });
    } catch (broadcastErr) {
      console.error('[ingest-transcript-core] ❌ Failed to broadcast intent_update:', {
        error: broadcastErr,
        callId,
        seq,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (intentErr) {
    console.error('[ingest-transcript-core] Intent detection error:', intentErr);
    // Fallback: try to surface KB from text even if intent detection fails
    if (!returnArticles) {
      await surfaceKBFromText(callId, text, seq, tenantId).catch(() => {
        // Ignore errors in fallback
      });
    }
  }

  // Return result if synchronous mode
  if (returnArticles) {
    return { intent, confidence, articles };
  }
  
  // Otherwise return empty (async mode)
  return { intent: 'unknown', confidence: 0.0, articles: [] };
}

/**
 * CRITICAL FIX: Surface KB articles even when intent is unknown
 * Uses transcript text to search for relevant articles
 */
async function surfaceKBFromText(
  callId: string,
  text: string,
  seq: number,
  tenantId: string,
  returnArticles: boolean = false
): Promise<KBArticle[]> {
  try {
    console.info('[ingest-transcript-core] Fetching KB articles from transcript text (intent unknown)');
    
    const config = await getEffectiveConfig({ tenantId });
    const kbAdapter = await getKbAdapter(tenantId);
    
    // Extract keywords from transcript (top keywords by length and relevance)
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3) // Filter short words
      .filter(word => !['that', 'this', 'with', 'from', 'have', 'been', 'will', 'would'].includes(word)) // Filter common words
      .slice(0, 10); // Top 10 keywords
    
    if (words.length === 0) {
      console.debug('[ingest-transcript-core] No keywords extracted from text');
      return []; // Return empty array instead of undefined
    }
    
    const searchQuery = words.join(' ');
    console.info('[ingest-transcript-core] Searching KB with keywords:', { searchQuery, keywords: words });
    
    const articles = await kbAdapter.search(searchQuery, {
      tenantId,
      max: config.kb.maxArticles,
      context: [text],
    });
    
    if (articles.length > 0) {
      console.info('[ingest-transcript-core] Found KB articles from text search:', {
        count: articles.length,
        provider: articles[0]?.source || 'none',
      });
      
      // Broadcast KB articles even without intent
      const intentUpdatePayload = {
        type: 'intent_update' as const,
        callId,
        seq,
        intent: 'unknown',
        confidence: 0,
        articles,
      };
      
      broadcastEvent(intentUpdatePayload);
      
      console.info('[ingest-transcript-core] ✅ Broadcast KB articles (intent unknown)', {
        callId,
        seq,
        articlesCount: articles.length,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.debug('[ingest-transcript-core] No KB articles found for text search');
    }
    
    // Return articles if synchronous mode
    if (returnArticles) {
      return articles;
    }
  } catch (err) {
    console.error('[ingest-transcript-core] KB text search error:', err);
    // Don't throw - this is a best-effort operation
  }
  
  // Return empty array if error or async mode
  return [];
}


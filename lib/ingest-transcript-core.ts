/**
 * Core Ingest Transcript Logic
 * Shared function that can be called directly (by TranscriptConsumer) or via HTTP (by external clients)
 */

import { supabase } from '@/lib/supabase';
import { detectIntent } from '@/lib/intent';
import { broadcastEvent } from '@/lib/realtime';
import { getKbAdapter, type KBArticle } from '@/lib/kb-adapter';
import { getEffectiveConfig } from '@/lib/config';

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
    // Validate required fields
    if (!params.callId || params.seq === undefined || !params.ts || !params.text) {
      return {
        ok: false,
        error: 'Missing required fields: callId, seq, ts, text',
      };
    }

    const tenantId = params.tenantId || 'default';

    console.info('[ingest-transcript-core] Processing transcript chunk', {
      callId: params.callId,
      seq: params.seq,
      ts: params.ts,
      textLength: params.text.length,
      textPreview: params.text.substring(0, 50),
      tenantId,
      timestamp: new Date().toISOString(),
    });

    // Insert into Supabase ingest_events table
    try {
      const { data, error } = await (supabase as any)
        .from('ingest_events')
        .upsert({
          call_id: params.callId,
          seq: params.seq,
          ts: params.ts,
          text: params.text,
          created_at: new Date().toISOString(),
        }, {
          onConflict: 'call_id,seq',
          ignoreDuplicates: false,
        })
        .select();

      if (error) {
        if (error.code === '23505') {
          console.debug('[ingest-transcript-core] Duplicate transcript chunk (already exists)', {
            callId: params.callId,
            seq: params.seq,
          });
        } else {
          console.error('[ingest-transcript-core] Supabase insert error:', error);
        }
        console.warn('[ingest-transcript-core] Continuing despite Supabase error');
      } else {
        console.info('[ingest-transcript-core] Stored in Supabase:', data);
      }
    } catch (supabaseErr) {
      console.error('[ingest-transcript-core] Supabase error:', supabaseErr);
      // Continue processing even if Supabase fails
    }

    // Broadcast transcript line to real-time listeners
    try {
      const broadcastPayload = {
        type: 'transcript_line' as const,
        callId: params.callId,
        seq: params.seq,
        ts: params.ts,
        text: params.text,
        speaker: 'customer', // Default until we implement speaker diarization
      };
      
      console.info('[ingest-transcript-core] 📤 Broadcasting transcript_line', {
        callId: params.callId,
        seq: params.seq,
        textLength: params.text.length,
        textPreview: params.text.substring(0, 50),
        speaker: 'customer',
        timestamp: new Date().toISOString(),
        note: 'UI should be connected with this exact callId to receive this event',
      });
      
      broadcastEvent(broadcastPayload);
      console.info('[ingest-transcript-core] ✅ Broadcast transcript_line', {
        callId: params.callId,
        seq: params.seq,
        textLength: params.text.length,
        textPreview: params.text.substring(0, 50),
        timestamp: new Date().toISOString(),
      });
    } catch (broadcastErr) {
      console.error('[ingest-transcript-core] ❌ Failed to broadcast transcript_line:', {
        error: broadcastErr,
        callId: params.callId,
        seq: params.seq,
        timestamp: new Date().toISOString(),
      });
      // Don't fail the request
    }

    // Intent detection and KB article recommendations
    let intent = 'unknown';
    let confidence = 0.0;
    let articles: KBArticle[] = [];

    const MIN_TEXT_LENGTH_FOR_INTENT = 10;
    const shouldDetectIntent = params.text.trim().length >= MIN_TEXT_LENGTH_FOR_INTENT;

    try {
      if (shouldDetectIntent) {
        console.info('[ingest-transcript-core] Detecting intent for seq:', params.seq, {
          textLength: params.text.length,
          textPreview: params.text.substring(0, 100),
        });
        const intentResult = await detectIntent(params.text);
        intent = intentResult.intent;
        confidence = intentResult.confidence;
      } else {
        console.debug('[ingest-transcript-core] Skipping intent detection (text too short)', {
          seq: params.seq,
          textLength: params.text.length,
          text: params.text,
          minLength: MIN_TEXT_LENGTH_FOR_INTENT,
        });
      }

      console.info('[ingest-transcript-core] Intent detected:', { 
        intent, 
        confidence,
        wasSuccessful: intent !== 'unknown',
      });

      // Store intent in database
      try {
        const { error: intentError } = await (supabase as any).from('intents').insert({
          call_id: params.callId,
          seq: params.seq,
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
          const searchTerms = expandIntentToSearchTerms(intent, params.text);
          
          console.info('[ingest-transcript-core] Expanded search terms:', searchTerms);

          const allArticles: typeof articles = [];
          const seenIds = new Set<string>();

          // Strategy 1: Search with full intent
          const fullIntentResults = await kbAdapter.search(intent, {
            tenantId,
            max: config.kb.maxArticles,
            context: [params.text],
          });
          
          for (const article of fullIntentResults) {
            if (!seenIds.has(article.id)) {
              allArticles.push(article);
              seenIds.add(article.id);
            }
          }

          // Strategy 2: Search with expanded terms
          for (const term of searchTerms) {
            if (term.length < 3) continue;
            
            const termResults = await kbAdapter.search(term, {
              tenantId,
              max: Math.floor(config.kb.maxArticles / searchTerms.length) || 3,
              context: [params.text],
            });

            for (const article of termResults) {
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
      }

      // Broadcast intent update to real-time listeners
      try {
        const intentUpdatePayload = {
          type: 'intent_update' as const,
          callId: params.callId,
          seq: params.seq,
          intent,
          confidence,
          articles,
        };
        
        console.info('[ingest-transcript-core] 📤 Broadcasting intent_update', {
          callId: params.callId,
          seq: params.seq,
          intent,
          confidence,
          articlesCount: articles.length,
          timestamp: new Date().toISOString(),
          note: 'UI should be connected with this exact callId to receive this event',
        });
        
        broadcastEvent(intentUpdatePayload);
        
        console.info('[ingest-transcript-core] ✅ Broadcast intent_update', {
          callId: params.callId,
          seq: params.seq,
          intent,
          confidence,
          articlesCount: articles.length,
          timestamp: new Date().toISOString(),
        });
      } catch (broadcastErr) {
        console.error('[ingest-transcript-core] ❌ Failed to broadcast intent_update:', {
          error: broadcastErr,
          callId: params.callId,
          seq: params.seq,
          timestamp: new Date().toISOString(),
        });
        // Don't fail the request
      }
    } catch (intentErr) {
      console.error('[ingest-transcript-core] Intent detection error:', intentErr);
      // Fallback to unknown intent
      intent = 'unknown';
      confidence = 0.0;
    }

    return {
      ok: true,
      intent,
      confidence,
      articles,
    };
  } catch (err: any) {
    console.error('[ingest-transcript-core] Error:', err);
    return {
      ok: false,
      error: err.message || String(err),
    };
  }
}


/**
 * Ingest Transcript API - Receives transcript chunks from the orchestrator.
 * Validates, logs, stores chunks, detects intent, and fetches KB articles.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { detectIntent } from '@/lib/intent';
import { broadcastEvent } from '@/lib/realtime';
import { getKbAdapter, type KBArticle } from '@/lib/kb-adapter';
import { getEffectiveConfig } from '@/lib/config';

/**
 * Expand intent label into multiple search terms for better KB matching
 * @param intent - Normalized intent string (e.g., "credit_card_fraud")
 * @param originalText - Original transcript text for context
 * @returns Array of search terms
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
    // Don't add generic "card" or "account" to avoid matching debit/salary accounts
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
    // Check for specific account types mentioned
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
    // Add generic terms for other intents
    const genericTerms = ['fraud', 'transaction', 'payment', 'billing', 'charge', 'dispute', 'refund'];
    for (const term of genericTerms) {
      if (textLower.includes(term)) {
        terms.add(term);
      }
    }
  }
  
  // Map specific intent patterns to keywords (more precise)
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
  
  // Add mapped terms based on intent keywords (more specific matching)
  for (const [key, values] of Object.entries(intentMappings)) {
    if (intent.includes(key)) {
      values.forEach(v => terms.add(v));
    }
  }
  
  return Array.from(terms);
}

interface IngestRequest {
  callId: string;
  seq: number;
  ts: string;
  text: string;
}

export async function POST(req: Request) {
  try {
    const body: IngestRequest = await req.json();

    // Validate required fields
    if (!body.callId || body.seq === undefined || !body.ts || !body.text) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: callId, seq, ts, text' },
        { status: 400 }
      );
    }

    // Extract tenantId from header or default to 'default'
    const tenantId = req.headers.get('x-tenant-id') || 'default';

    console.info('[ingest-transcript] Received chunk', {
      callId: body.callId,
      seq: body.seq,
      ts: body.ts,
      textLength: body.text.length,
      tenantId,
    });

    // Insert into Supabase ingest_events table
    try {
      const { data, error } = await (supabase as any).from('ingest_events').insert({
        call_id: body.callId,
        seq: body.seq,
        ts: body.ts,
        text: body.text,
        created_at: new Date().toISOString(),
      }).select();

      if (error) {
        console.error('[ingest-transcript] Supabase insert error:', error);
        // Don't fail the request, just log it
        console.warn('[ingest-transcript] Continuing despite Supabase error');
      } else {
        console.info('[ingest-transcript] Stored in Supabase:', data);
      }
    } catch (supabaseErr) {
      console.error('[ingest-transcript] Supabase error:', supabaseErr);
      // Continue processing even if Supabase fails
    }

    // Phase 3: Broadcast transcript line to real-time listeners
    try {
      const broadcastPayload = {
        type: 'transcript_line' as const,
        callId: body.callId,
        seq: body.seq,
        ts: body.ts,
        text: body.text,
      };
      broadcastEvent(broadcastPayload);
      console.info('[realtime] ✅ Broadcast transcript_line', {
        callId: body.callId,
        seq: body.seq,
        textLength: body.text.length,
        textPreview: body.text.substring(0, 50),
        timestamp: new Date().toISOString(),
      });
    } catch (broadcastErr) {
      console.error('[realtime] ❌ Failed to broadcast transcript_line:', {
        error: broadcastErr,
        callId: body.callId,
        seq: body.seq,
        timestamp: new Date().toISOString(),
      });
      // Don't fail the request
    }

    // Phase 2: Intent detection and KB article recommendations
    let intent = 'unknown';
    let confidence = 0.0;
    let articles: KBArticle[] = [];

    try {
      // Detect intent from the transcript text
      console.info('[ingest-transcript] Detecting intent for seq:', body.seq, {
        textLength: body.text.length,
        textPreview: body.text.substring(0, 100),
      });
      const intentResult = await detectIntent(body.text);
      intent = intentResult.intent;
      confidence = intentResult.confidence;

      console.info('[ingest-transcript] Intent detected:', { 
        intent, 
        confidence,
        wasSuccessful: intent !== 'unknown',
      });

      // Store intent in database
      try {
        const { error: intentError } = await (supabase as any).from('intents').insert({
          call_id: body.callId,
          seq: body.seq,
          intent,
          confidence,
          created_at: new Date().toISOString(),
        });

        if (intentError) {
          console.error('[ingest-transcript] Failed to store intent:', intentError);
        } else {
          console.info('[ingest-transcript] Intent stored in database');
        }
      } catch (intentDbErr) {
        console.error('[ingest-transcript] Intent DB error:', intentDbErr);
      }

      // Fetch relevant KB articles based on intent using adapter pattern
      if (intent && intent !== 'unknown') {
        try {
          console.info('[ingest-transcript] Fetching KB articles for intent:', intent);

          // Get effective config for tenant
          const config = await getEffectiveConfig({ tenantId });

          // Get appropriate KB adapter for tenant
          const kbAdapter = await getKbAdapter(tenantId);

          // Expand intent into search terms for better matching
          // Split normalized intent by underscores and use individual words
          const searchTerms = expandIntentToSearchTerms(intent, body.text);
          
          console.info('[ingest-transcript] Expanded search terms:', searchTerms);

          // Try multiple search strategies and combine results
          const allArticles: typeof articles = [];
          const seenIds = new Set<string>();

          // Strategy 1: Search with full intent
          const fullIntentResults = await kbAdapter.search(intent, {
            tenantId,
            max: config.kb.maxArticles,
            context: [body.text],
          });
          
          for (const article of fullIntentResults) {
            if (!seenIds.has(article.id)) {
              allArticles.push(article);
              seenIds.add(article.id);
            }
          }

          // Strategy 2: Search with expanded terms (individual words)
          for (const term of searchTerms) {
            if (term.length < 3) continue; // Skip very short terms
            
            const termResults = await kbAdapter.search(term, {
              tenantId,
              max: Math.floor(config.kb.maxArticles / searchTerms.length) || 3,
              context: [body.text],
            });

            for (const article of termResults) {
              if (!seenIds.has(article.id) && allArticles.length < config.kb.maxArticles) {
                allArticles.push(article);
                seenIds.add(article.id);
              }
            }
          }

          articles = allArticles.slice(0, config.kb.maxArticles);

          console.info('[ingest-transcript] Found KB articles:', {
            count: articles.length,
            provider: articles[0]?.source || 'none',
            maxArticles: config.kb.maxArticles,
            searchTerms,
          });
        } catch (kbErr) {
          console.error('[ingest-transcript] KB fetch error:', kbErr);
          // Continue without articles
        }
      }

      // Phase 3: Broadcast intent update to real-time listeners
      try {
        broadcastEvent({
          type: 'intent_update',
          callId: body.callId,
          seq: body.seq,
          intent,
          confidence,
          articles,
        });
        console.info('[realtime] Broadcast intent_update', {
          callId: body.callId,
          seq: body.seq,
          intent,
          confidence,
          articlesCount: articles.length,
        });
      } catch (broadcastErr) {
        console.error('[realtime] Failed to broadcast intent_update:', broadcastErr);
        // Don't fail the request
      }
    } catch (intentErr) {
      console.error('[ingest-transcript] Intent detection error:', intentErr);
      // Fallback to unknown intent
      intent = 'unknown';
      confidence = 0.0;
    }

    return NextResponse.json({
      ok: true,
      intent,
      confidence,
      articles,
    });
  } catch (err: any) {
    console.error('[ingest-transcript] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

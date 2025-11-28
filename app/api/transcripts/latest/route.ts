/**
 * Get Latest Transcripts API
 * GET /api/transcripts/latest?callId=...
 * 
 * Returns the latest transcripts, intent, and KB articles for a callId.
 * Used as a polling fallback when SSE connection fails.
 * 
 * OPTION 2 IMPLEMENTATION: Includes intent and KB articles in polling response
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getKbAdapter, type KBArticle } from '@/lib/kb-adapter';
import { getEffectiveConfig } from '@/lib/config';
import { getTranscriptsFromCache } from '@/lib/ingest-transcript-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface TranscriptUtterance {
  id: string;
  text: string;
  speaker: 'agent' | 'customer';
  timestamp: string;
  seq?: number;
  confidence?: number;
}

/**
 * Fetch latest intent for a callId from database
 * Uses exact table name: 'intents' (from migration 002_create_intents.sql)
 */
async function getLatestIntent(callId: string): Promise<{ intent: string; confidence: number; seq: number } | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('intents') // Exact table name from migration 002_create_intents.sql
      .select('intent, confidence, seq')
      .eq('call_id', callId)
      .order('seq', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[transcripts/latest] Error fetching intent from intents table:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const latest = data[0];
    return {
      intent: latest.intent || 'unknown',
      confidence: latest.confidence || 0,
      seq: latest.seq || 0,
    };
  } catch (err: any) {
    console.error('[transcripts/latest] Error fetching intent:', err);
    return null;
  }
}

/**
 * Fetch KB articles based on intent or transcript text
 */
async function getKBArticlesForCall(
  callId: string,
  intent: string | null,
  transcripts: TranscriptUtterance[],
  tenantId: string = 'default'
): Promise<KBArticle[]> {
  try {
    const config = await getEffectiveConfig({ tenantId });
    const kbAdapter = await getKbAdapter(tenantId);

    // Build search query from intent or latest transcript text
    let searchQuery = '';
    
    if (intent && intent !== 'unknown') {
      // Use intent as primary search term
      searchQuery = intent.replace(/_/g, ' '); // Replace underscores with spaces
    } else if (transcripts.length > 0) {
      // Use latest transcript text to extract keywords
      const latestTranscript = transcripts[transcripts.length - 1];
      const text = latestTranscript.text || '';
      
      // Extract keywords (similar to surfaceKBFromText logic)
      const words = text
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .filter(word => !['that', 'this', 'with', 'from', 'have', 'been', 'will', 'would'].includes(word))
        .slice(0, 10);
      
      if (words.length > 0) {
        searchQuery = words.join(' ');
      }
    }

    if (!searchQuery || searchQuery.trim().length === 0) {
      return []; // No search query available
    }

    // Combine all transcript text for context
    const contextText = transcripts
      .map(t => t.text)
      .filter(Boolean)
      .join(' ')
      .slice(0, 1000); // Limit context length

    // Search for KB articles
    const articles = await kbAdapter.search(searchQuery, {
      tenantId,
      max: config.kb.maxArticles || 10,
      context: contextText ? [contextText] : [],
    });

    console.info('[transcripts/latest] Found KB articles from kb_articles table', {
      callId,
      searchQuery,
      articlesCount: articles.length,
      intent,
      table: 'kb_articles', // Exact table name used by dbAdapter
    });

    return articles;
  } catch (err: any) {
    console.error('[transcripts/latest] Error fetching KB articles from kb_articles table:', err);
    return []; // Return empty array on error
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');
    const tenantId = url.searchParams.get('tenantId') || 'default';

    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing callId parameter' },
        { status: 400 }
      );
    }

    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[transcripts/latest] Missing Supabase environment variables', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
      });
      return NextResponse.json({
        ok: true,
        callId,
        transcripts: [],
        count: 0,
        intent: 'unknown',
        confidence: 0,
        articles: [],
        warning: 'Database configuration missing',
      });
    }

    console.log('[transcripts/latest] Fetching transcripts for callId:', callId);

    // OPTIMIZATION: Fetch transcripts from in-memory cache (not Supabase)
    // Transcripts are cached on the server and broadcast via SSE
    // This is much faster than DB queries and reduces Supabase load
    const cachedTranscripts = getTranscriptsFromCache(callId);
    
    console.info('[transcripts/latest] ⚡ Retrieved transcripts from in-memory cache', {
      callId,
      count: cachedTranscripts.length,
      note: 'Instant access, no DB query needed',
    });

    // FRESHNESS CHECK: Don't return stale cached transcripts (older than 1 hour)
    if (cachedTranscripts.length > 0) {
      const latestTimestamp = cachedTranscripts[cachedTranscripts.length - 1].ts;
      const latestTime = new Date(latestTimestamp).getTime();
      const now = Date.now();
      const ageMinutes = (now - latestTime) / (1000 * 60);
      const MAX_AGE_MINUTES = 60; // 1 hour
      
      if (ageMinutes > MAX_AGE_MINUTES) {
        console.warn('[transcripts/latest] ⚠️ Cached transcripts are stale, returning empty', {
          callId,
          latestTimestamp,
          ageMinutes: Math.round(ageMinutes),
          maxAgeMinutes: MAX_AGE_MINUTES,
          note: 'Transcripts older than 1 hour are considered stale',
        });
        
        return NextResponse.json({
          ok: true,
          callId,
          transcripts: [],
          count: 0,
          intent: 'unknown',
          confidence: 0,
          articles: [],
          stale: true,
          ageMinutes: Math.round(ageMinutes),
        });
      }
    }

    // Map cache results to TranscriptUtterance format
    const transcripts: TranscriptUtterance[] = cachedTranscripts.map((t) => ({
      id: `${callId}-${t.seq}`,
      text: t.text || '',
      speaker: t.speaker,
      timestamp: t.ts,
      seq: t.seq,
      confidence: 1.0,
    }));

    // OPTION 2: Fetch intent first, then KB articles based on intent (if available)
    const intentData = await getLatestIntent(callId).catch(() => null);
    
    // Fetch KB articles using intent (if available) or transcript text
    const finalKBArticles = await getKBArticlesForCall(
      callId,
      intentData?.intent || null,
      transcripts,
      tenantId
    ).catch(() => []);

    console.info('[transcripts/latest] ✅ Fetched transcripts with intent/KB', {
      callId,
      transcriptCount: transcripts.length,
      intent: intentData?.intent || 'unknown',
      confidence: intentData?.confidence || 0,
      articlesCount: finalKBArticles.length,
    });

    // Map KB articles to frontend-compatible format
    const mappedArticles = finalKBArticles.map(article => ({
      id: article.id,
      title: article.title,
      snippet: article.snippet || '',
      url: article.url,
      confidence: article.confidence,
      relevance: article.confidence, // Use confidence as relevance
      intent: intentData?.intent || 'unknown',
      intentConfidence: intentData?.confidence || 0,
      tags: article.tags,
      source: article.source,
    }));

    return NextResponse.json({
      ok: true,
      callId,
      transcripts,
      count: transcripts.length,
      // OPTION 2: Include intent and KB articles in response
      intent: intentData?.intent || 'unknown',
      confidence: intentData?.confidence || 0,
      articles: mappedArticles,
    });
  } catch (error: any) {
    console.error('[transcripts/latest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


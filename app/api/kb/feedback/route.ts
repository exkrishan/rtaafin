/**
 * POST /api/kb/feedback
 *
 * Handle KB article feedback (like/dislike)
 * Optional endpoint - failures are non-critical
 *
 * Body:
 * {
 *   "callId": string (optional),
 *   "tenantId": string (optional),
 *   "articleId": string,
 *   "articleTitle": string,
 *   "action": "like" | "dislike"
 * }
 */

import { NextResponse } from 'next/server';
import { emitTelemetry } from '@/lib/telemetry';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const callId = body?.callId ? String(body.callId).trim() : undefined;
    const tenantId = body?.tenantId ? String(body.tenantId).trim() : 'default';
    const articleId = String(body?.articleId || '').trim();
    const articleTitle = String(body?.articleTitle || '').trim();
    const action = body?.action === 'like' || body?.action === 'dislike' ? body.action : null;

    if (!articleId || !action) {
      return NextResponse.json(
        {
          ok: false,
          error: 'articleId and action (like/dislike) are required',
        },
        { status: 400 }
      );
    }

    // Emit telemetry for feedback
    try {
      await emitTelemetry('kb_article_feedback', {
        call_id: callId,
        tenant_id: tenantId,
        article_id: articleId,
        article_title: articleTitle,
        action,
      });
    } catch (telemetryError) {
      // Telemetry failure shouldn't fail the request
      console.warn('[api][kb][feedback] Telemetry failed', telemetryError);
    }

    // TODO: Optionally persist to kb_feedback table if it exists
    // For now, we just emit telemetry

    return NextResponse.json({
      ok: true,
      message: 'Feedback recorded',
    });
  } catch (err: any) {
    console.error('[api][kb][feedback] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Failed to record feedback',
      },
      { status: 500 }
    );
  }
}


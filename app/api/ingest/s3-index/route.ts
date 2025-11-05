/**
 * S3 Index API - Returns manifest of available transcript chunks.
 * In dev mode: lists local files from ./data/${callId}/
 * In prod mode: generates presigned URLs from S3
 */

import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import { join } from 'path';

interface ManifestEntry {
  url: string;
  seq: number;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');

    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing callId parameter' },
        { status: 400 }
      );
    }

    console.info(`[s3-index] Fetching manifest for callId=${callId}`);

    // Development mode: read from local filesystem
    if (process.env.NODE_ENV === 'development') {
      const manifest = await getDevManifest(callId);
      return NextResponse.json({ ok: true, manifest });
    }

    // Production mode: generate presigned URLs from S3
    const s3Bucket = process.env.S3_BUCKET;
    const s3IngestPrefix = process.env.S3_INGEST_PREFIX;
    const s3Region = process.env.S3_REGION;

    if (!s3Bucket || !s3IngestPrefix || !s3Region) {
      console.warn('[s3-index] S3 configuration missing in production');
      return NextResponse.json(
        {
          ok: false,
          error: 'S3 configuration not available. Set S3_BUCKET, S3_INGEST_PREFIX, S3_REGION',
          manifest: [],
        },
        { status: 503 }
      );
    }

    // TODO: Implement S3 presigned URL generation
    // For now, return placeholder
    console.warn('[s3-index] S3 presigned URL generation not yet implemented');
    return NextResponse.json({
      ok: false,
      error: 'S3 presigned URL generation not yet implemented',
      manifest: [],
    });
  } catch (err: any) {
    console.error('[s3-index] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * Get manifest from local filesystem in development mode.
 */
async function getDevManifest(callId: string): Promise<ManifestEntry[]> {
  const dataDir = join(process.cwd(), 'data', callId);

  try {
    const files = await readdir(dataDir);

    // Filter chunk files and extract seq numbers
    const manifest: ManifestEntry[] = files
      .filter((f) => /^chunk-\d+\.json$/.test(f))
      .map((f) => {
        const match = f.match(/^chunk-(\d+)\.json$/);
        const seq = parseInt(match![1], 10);
        return {
          url: `/data/${callId}/${f}`,
          seq,
        };
      })
      .sort((a, b) => a.seq - b.seq);

    console.info(`[s3-index] Found ${manifest.length} chunks in ${dataDir}`);
    return manifest;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.warn(`[s3-index] Directory not found: ${dataDir}`);
      return [];
    }
    throw err;
  }
}

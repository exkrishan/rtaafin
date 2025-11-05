import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    let host = null;
    try {
      if (url) {
        const u = new URL(url);
        host = u.host;
      }
    } catch {
      host = "invalid-url";
    }

    return NextResponse.json({
      ok: true,
      envLoaded: !!url,
      supabaseHost: host,
      hasServiceKey,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

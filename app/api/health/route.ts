// app/api/health/route.ts
export async function GET() {
  return new Response(JSON.stringify({ status: "ok", service: "frontend" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}


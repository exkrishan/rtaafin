// app/api/health/route.ts
export async function GET() {
  // Determine service name from environment or default to 'frontend'
  const serviceName = process.env.SERVICE_NAME || process.env.RENDER_SERVICE_NAME || 'frontend';
  
  return new Response(JSON.stringify({ status: "ok", service: serviceName }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}


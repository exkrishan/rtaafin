import { NextResponse } from 'next/server';

/**
 * Health check endpoint for Render and other deployment platforms
 * 
 * This endpoint is used by Render to verify the service is running.
 * Returns 200 OK with a simple JSON response.
 */
export async function GET() {
  try {
    return NextResponse.json(
      {
        status: 'ok',
        service: 'rtaa-frontend',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        service: 'rtaa-frontend',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


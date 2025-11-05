/**
 * Debug endpoint to check intent detection configuration
 * GET /api/debug/intent
 */

import { NextResponse } from 'next/server';
import { detectIntent } from '@/lib/intent';

export async function GET(req: Request) {
  const testText = "Customer: Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday.";

  const envInfo = {
    hasLLMKey: !!process.env.LLM_API_KEY,
    llmKeyPreview: process.env.LLM_API_KEY ? `${process.env.LLM_API_KEY.substring(0, 20)}...` : 'missing',
    provider: process.env.LLM_PROVIDER || 'openai',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash (default)',
  };

  console.log('[debug][intent] Environment check:', envInfo);

  try {
    const result = await detectIntent(testText);
    
    return NextResponse.json({
      ok: true,
      env: envInfo,
      testText,
      result,
      wasSuccessful: result.intent !== 'unknown',
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      env: envInfo,
      testText,
      error: err.message,
      stack: err.stack,
    }, { status: 500 });
  }
}

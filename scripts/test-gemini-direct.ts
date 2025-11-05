/**
 * Direct test of Gemini API for intent detection
 * This bypasses the server and tests the API directly
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const apiKey = process.env.LLM_API_KEY;
const provider = process.env.LLM_PROVIDER || 'openai';

async function testGeminiDirect() {
  console.log('🔍 Testing Gemini API Directly\n');
  console.log('='.repeat(60));
  
  if (!apiKey) {
    console.error('❌ LLM_API_KEY not found in environment');
    console.log('\nMake sure .env.local has:');
    console.log('LLM_API_KEY=your-key');
    console.log('LLM_PROVIDER=gemini');
    process.exit(1);
  }

  console.log(`✅ LLM_API_KEY found: ${apiKey.substring(0, 20)}...`);
  console.log(`✅ Provider: ${provider}\n`);

  if (provider !== 'gemini' && provider !== 'google') {
    console.log('⚠️  Provider is not gemini, skipping Gemini test');
    return;
  }

  const testText = "Customer: Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday.";
  
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
  
  const prompt = `You are an intent classifier for customer support calls. Given the transcript snippet below, output a concise 3-5 word intent label and a confidence score (0-1).

Current:
"${testText}"

Respond ONLY with valid JSON in this exact format:
{"intent": "intent_label", "confidence": 0.0}

Common intents: reset_password, update_billing, plan_upgrade, account_inquiry, technical_support, cancel_service, payment_issue`;

  console.log('📤 Sending request to Gemini API...');
  console.log(`   Model: ${model}`);
  console.log(`   URL: ${url.substring(0, 80)}...`);
  console.log(`   Text: "${testText.substring(0, 60)}..."\n`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt,
          }],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200, // Sufficient for gemini-1.5-flash
        },
      }),
    });

    console.log(`📥 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('\n❌ Gemini API Error:');
      console.error(JSON.stringify(JSON.parse(errorText), null, 2));
      return;
    }

    const data = await response.json();
    console.log('\n✅ Response received!');
    console.log('\n📊 Full Response:');
    console.log(JSON.stringify(data, null, 2));

    const candidate = data.candidates?.[0];
    console.log('\n📋 Candidate Structure:');
    console.log(JSON.stringify(candidate, null, 2));
    
    // Try different ways to extract content
    let content = candidate?.content?.parts?.[0]?.text;
    
    if (!content && candidate?.content) {
      // Maybe content is directly in content object?
      console.log('\n⚠️  Trying alternative content extraction...');
      console.log('Content object:', JSON.stringify(candidate.content, null, 2));
      
      // Try other possible structures
      if (typeof candidate.content === 'string') {
        content = candidate.content;
      } else if (Array.isArray(candidate.content)) {
        content = candidate.content[0]?.text || candidate.content[0];
      }
    }
    
    if (!content) {
      console.error('\n❌ No content in response');
      console.log('Response structure:', Object.keys(data));
      console.log('Candidate structure:', candidate ? Object.keys(candidate) : 'No candidate');
      if (candidate?.content) {
        console.log('Content structure:', Object.keys(candidate.content));
      }
      return;
    }

    console.log('\n📝 Extracted Content:');
    console.log(content);
    console.log('');

    // Try to parse JSON - handle markdown code blocks
    let cleanedContent = content.trim();
    cleanedContent = cleanedContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    cleanedContent = cleanedContent.trim();
    
    try {
      const result = JSON.parse(cleanedContent);
      console.log('✅ JSON Parsed Successfully:');
      console.log(`   Intent: "${result.intent}"`);
      console.log(`   Confidence: ${result.confidence}`);
    } catch (parseErr: any) {
      console.error('❌ Failed to parse JSON:');
      console.error(`   Error: ${parseErr.message}`);
      console.log('\n   Original content:');
      console.log(`   "${content}"`);
      console.log('\n   Cleaned content:');
      console.log(`   "${cleanedContent}"`);
    }

  } catch (err: any) {
    console.error('\n❌ Request failed:');
    console.error(`   Error: ${err.message}`);
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      console.error('   ⚠️  Network error - check internet connection');
    }
  }
}

testGeminiDirect().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


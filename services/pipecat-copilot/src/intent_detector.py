"""Intent detection service using LLM APIs"""

import json
import logging
from typing import Optional, Dict, Any
import httpx
from openai import OpenAI
import google.generativeai as genai

from .config import settings

logger = logging.getLogger(__name__)


class IntentResult:
    """Intent detection result"""

    def __init__(self, intent: str, confidence: float):
        self.intent = intent
        self.confidence = confidence

    def to_dict(self) -> Dict[str, Any]:
        return {"intent": self.intent, "confidence": self.confidence}


class IntentDetector:
    """Detects customer intent from transcript text"""

    def __init__(self):
        self.provider = settings.llm_provider.lower()
        self.api_key = settings.get_llm_api_key()

        if not self.api_key:
            raise ValueError(
                f"LLM API key is required for provider: {self.provider}"
            )

        if self.provider == "gemini" or self.provider == "google":
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel("gemini-2.0-flash")
        elif self.provider == "openai":
            self.client = OpenAI(api_key=self.api_key)
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

        logger.info(f"[intent] Initialized intent detector with provider: {self.provider}")

    def _build_prompt(self, text: str, context: Optional[list] = None) -> str:
        """Build intent detection prompt"""
        context_text = ""
        if context and len(context) > 0:
            context_text = f"Previous context:\n{chr(10).join(context)}\n\nCurrent:"

        prompt = f"""You are an intent classifier for customer support calls. Analyze the transcript and identify the PRIMARY intent. Be specific - distinguish between different card types and account types.

{context_text}
"{text}"

CRITICAL RULES - READ CAREFULLY:
1. If the text explicitly mentions "credit card" or "creditcard", use credit_card intents:
   - credit_card_block (for blocking/lost/stolen credit cards)
   - credit_card_fraud (for fraud/unauthorized charges on credit cards)
   - credit_card_replacement (for replacing credit cards)
   - credit_card (for general credit card issues)

2. If the text explicitly mentions "debit card" or "debitcard", use debit_card intents:
   - debit_card_block (for blocking debit cards)
   - debit_card_fraud (for fraud on debit cards)
   - debit_card (for general debit card issues)

3. NEVER confuse credit card with debit card:
   - "I need to block my credit card" → credit_card_block (NOT debit_card_block)
   - "My credit card was stolen" → credit_card_block or credit_card_fraud (NOT debit_card)
   - "My debit card is not working" → debit_card_block (NOT credit_card)

4. Account issues (only if specifically about accounts, not cards):
   - account_balance (checking balance)
   - account_inquiry (general account questions)
   - savings_account (only if "savings account" is mentioned)
   - salary_account (only if "salary account" is mentioned)

5. Fraud detection:
   - If fraud + credit card → credit_card_fraud
   - If fraud + debit card → debit_card_fraud
   - If fraud + no card type → fraudulent_transaction

EXAMPLES:
- "I need to block my credit card" → {{"intent": "credit_card_block", "confidence": 0.95}}
- "My credit card was stolen" → {{"intent": "credit_card_block", "confidence": 0.9}}
- "My debit card is not working" → {{"intent": "debit_card_block", "confidence": 0.9}}
- "I want to check my account balance" → {{"intent": "account_balance", "confidence": 0.95}}

Respond ONLY with valid JSON in this exact format:
{{"intent": "intent_label", "confidence": 0.0}}

Use specific intents: credit_card_block, credit_card_fraud, credit_card_replacement, debit_card_block, debit_card_fraud, account_balance, etc."""

        return prompt

    def _normalize_intent(self, intent: str) -> str:
        """Normalize intent string for consistency"""
        # Convert to lowercase and replace spaces with underscores
        normalized = intent.lower().strip().replace(" ", "_")
        
        # Common intent mappings
        intent_map = {
            "creditcard": "credit_card",
            "debitcard": "debit_card",
            "credit_card_blocking": "credit_card_block",
            "debit_card_blocking": "debit_card_block",
            "card_block": "credit_card_block",  # Default to credit card if ambiguous
        }
        
        return intent_map.get(normalized, normalized)

    async def detect_intent(
        self, text: str, context: Optional[list] = None
    ) -> IntentResult:
        """
        Detect intent from transcript text
        
        Args:
            text: Transcript text to analyze
            context: Optional previous transcript chunks for context
            
        Returns:
            IntentResult with intent label and confidence
        """
        # Skip very short text
        MIN_TEXT_LENGTH = 10
        if len(text.strip()) < MIN_TEXT_LENGTH:
            logger.debug(f"[intent] Text too short for intent detection: {len(text)} chars")
            return IntentResult("unknown", 0.0)

        prompt = self._build_prompt(text, context)

        logger.info(
            f"[intent] Starting detection: text_length={len(text)}, "
            f"provider={self.provider}, text_preview={text[:100]}"
        )

        try:
            if self.provider == "gemini" or self.provider == "google":
                response = await self._detect_with_gemini(prompt)
            elif self.provider == "openai":
                response = await self._detect_with_openai(prompt)
            else:
                raise ValueError(f"Unsupported provider: {self.provider}")

            # Parse JSON response
            result = json.loads(response.strip())
            intent = self._normalize_intent(result.get("intent", "unknown"))
            confidence = max(0.0, min(1.0, float(result.get("confidence", 0.0))))

            logger.info(
                f"[intent] Detected intent: {intent}, confidence: {confidence}"
            )

            return IntentResult(intent, confidence)

        except json.JSONDecodeError as e:
            logger.error(f"[intent] Error parsing JSON response: {e}, response: {response[:200]}")
            return IntentResult("unknown", 0.0)
        except Exception as e:
            logger.error(f"[intent] Error detecting intent: {e}")
            return IntentResult("unknown", 0.0)

    async def _detect_with_gemini(self, prompt: str) -> str:
        """Detect intent using Google Gemini"""
        full_prompt = (
            "You are a customer support intent classifier. "
            "Always respond with valid JSON containing 'intent' and 'confidence' fields.\n\n"
            + prompt
        )

        # Gemini API is synchronous, but we wrap it in async for consistency
        import asyncio
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.model.generate_content(
                full_prompt,
                generation_config={
                    "temperature": 0.3,
                    "max_output_tokens": 200,
                },
            ),
        )

        return response.text

    async def _detect_with_openai(self, prompt: str) -> str:
        """Detect intent using OpenAI"""
        # OpenAI client is synchronous, but we wrap it in async for consistency
        import asyncio
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.chat.completions.create(
                model="gpt-4o-mini",  # Use cost-effective model
                messages=[
                    {
                        "role": "system",
                        "content": "You are a customer support intent classifier. Always respond with valid JSON containing 'intent' and 'confidence' fields.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=200,
            ),
        )

        return response.choices[0].message.content or ""


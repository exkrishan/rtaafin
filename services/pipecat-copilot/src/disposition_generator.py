"""Disposition generator for call summaries and recommendations"""

import json
import logging
from typing import List, Dict, Any, Optional
from openai import OpenAI
import google.generativeai as genai

from .config import settings

logger = logging.getLogger(__name__)


class DispositionRecommendation:
    """Disposition recommendation"""

    def __init__(
        self,
        label: str,
        score: float,
        sub_disposition: Optional[str] = None,
    ):
        self.label = label
        self.score = score
        self.sub_disposition = sub_disposition

    def to_dict(self) -> Dict[str, Any]:
        return {
            "label": self.label,
            "score": self.score,
            "subDisposition": self.sub_disposition,
        }


class DispositionSummary:
    """Complete disposition summary"""

    def __init__(
        self,
        issue: str,
        resolution: str,
        next_steps: str,
        dispositions: List[DispositionRecommendation],
        confidence: float,
    ):
        self.issue = issue
        self.resolution = resolution
        self.next_steps = next_steps
        self.dispositions = dispositions
        self.confidence = confidence

    def to_dict(self) -> Dict[str, Any]:
        return {
            "issue": self.issue,
            "resolution": self.resolution,
            "next_steps": self.next_steps,
            "dispositions": [d.to_dict() for d in self.dispositions],
            "confidence": self.confidence,
        }

    def get_auto_notes(self) -> str:
        """Generate auto-notes from summary sections"""
        sections = [self.issue, self.resolution, self.next_steps]
        notes = "\n\n".join(s for s in sections if s and s.strip())
        return notes or "No notes generated."


class DispositionGenerator:
    """Generates disposition summaries and recommendations from call transcripts"""

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

        logger.info(
            f"[disposition] Initialized disposition generator with provider: {self.provider}"
        )

    def _build_prompt(self, transcript: str) -> str:
        """Build prompt for disposition generation"""
        prompt = f"""You are a customer support call analyst. Analyze the following call transcript and generate a comprehensive summary with disposition recommendations.

Call Transcript:
{transcript}

Generate a JSON response with the following structure:
{{
  "issue": "Brief description of the customer's issue or concern",
  "resolution": "How the issue was resolved or what action was taken",
  "next_steps": "Recommended next steps or follow-up actions",
  "dispositions": [
    {{
      "label": "Primary disposition code (e.g., credit_card_block, account_balance)",
      "score": 0.95,
      "subDisposition": "Optional sub-disposition if applicable"
    }}
  ],
  "confidence": 0.9
}}

CRITICAL RULES:
1. Be specific with disposition labels - use the same intent taxonomy:
   - credit_card_block, credit_card_fraud, credit_card_replacement, credit_card
   - debit_card_block, debit_card_fraud, debit_card
   - account_balance, account_inquiry, savings_account, salary_account
   - fraudulent_transaction

2. Include sub-dispositions when relevant (e.g., "card_lost", "card_stolen")

3. Provide clear, actionable summaries in issue, resolution, and next_steps

4. Confidence should reflect how certain you are about the disposition (0.0-1.0)

5. If multiple dispositions are relevant, include them all with appropriate scores

Respond ONLY with valid JSON. Do not include any text outside the JSON object."""

        return prompt

    async def generate_disposition(
        self, transcript: str, call_id: str
    ) -> DispositionSummary:
        """
        Generate disposition summary from full transcript

        Args:
            transcript: Complete call transcript
            call_id: Call identifier

        Returns:
            DispositionSummary with issue, resolution, next_steps, and dispositions
        """
        if not transcript or len(transcript.strip()) < 10:
            logger.warning(
                f"[disposition] Transcript too short for disposition generation: {len(transcript)} chars"
            )
            return self._create_fallback_summary()

        logger.info(
            f"[disposition] Generating disposition for call: {call_id}, "
            f"transcript_length: {len(transcript)}"
        )

        prompt = self._build_prompt(transcript)

        try:
            if self.provider == "gemini" or self.provider == "google":
                response_text = await self._generate_with_gemini(prompt)
            elif self.provider == "openai":
                response_text = await self._generate_with_openai(prompt)
            else:
                raise ValueError(f"Unsupported provider: {self.provider}")

            # Parse JSON response
            response_data = json.loads(response_text.strip())

            # Extract dispositions
            dispositions = []
            for disp_data in response_data.get("dispositions", []):
                disposition = DispositionRecommendation(
                    label=disp_data.get("label", "unknown"),
                    score=float(disp_data.get("score", 0.5)),
                    sub_disposition=disp_data.get("subDisposition"),
                )
                dispositions.append(disposition)

            # If no dispositions, add a default one
            if not dispositions:
                dispositions.append(
                    DispositionRecommendation(label="general_inquiry", score=0.5)
                )

            summary = DispositionSummary(
                issue=response_data.get("issue", "Issue not identified."),
                resolution=response_data.get("resolution", "Resolution not specified."),
                next_steps=response_data.get("next_steps", "No next steps specified."),
                dispositions=dispositions,
                confidence=float(response_data.get("confidence", 0.5)),
            )

            logger.info(
                f"[disposition] Generated disposition: {len(dispositions)} recommendations, "
                f"confidence: {summary.confidence}"
            )

            return summary

        except json.JSONDecodeError as e:
            logger.error(f"[disposition] Error parsing JSON response: {e}")
            logger.debug(f"[disposition] Response text: {response_text[:500]}")
            return self._create_fallback_summary()
        except Exception as e:
            logger.error(f"[disposition] Error generating disposition: {e}")
            return self._create_fallback_summary()

    async def _generate_with_gemini(self, prompt: str) -> str:
        """Generate disposition using Google Gemini"""
        full_prompt = (
            "You are a customer support call analyst. "
            "Always respond with valid JSON containing 'issue', 'resolution', 'next_steps', "
            "'dispositions', and 'confidence' fields.\n\n"
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
                    "max_output_tokens": 2000,  # More tokens for summaries
                },
            ),
        )

        return response.text

    async def _generate_with_openai(self, prompt: str) -> str:
        """Generate disposition using OpenAI"""
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
                        "content": (
                            "You are a customer support call analyst. "
                            "Always respond with valid JSON containing 'issue', 'resolution', "
                            "'next_steps', 'dispositions', and 'confidence' fields."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=2000,  # More tokens for summaries
            ),
        )

        return response.choices[0].message.content or ""

    def _create_fallback_summary(self) -> DispositionSummary:
        """Create a fallback summary when generation fails"""
        logger.warning("[disposition] Using fallback summary")
        return DispositionSummary(
            issue="Unable to analyze transcript.",
            resolution="Please review the call transcript manually.",
            next_steps="Review call details and assign appropriate disposition.",
            dispositions=[
                DispositionRecommendation(label="general_inquiry", score=0.1)
            ],
            confidence=0.1,
        )


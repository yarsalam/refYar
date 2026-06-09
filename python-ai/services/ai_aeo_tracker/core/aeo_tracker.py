import asyncio
import logging
import os
from typing import Dict, List

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class AEOVisibilityTracker:
    async def check_mentions(self, brand: str, prompts: List[str]) -> List[Dict]:
        tasks = [self._check_single(brand, p) for p in prompts]
        return await asyncio.gather(*tasks)

    async def _check_single(self, brand: str, prompt: str) -> Dict:
        try:
            response = await client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[{"role": "user", "content": prompt.format(brand=brand)}],
                temperature=0.0,
                max_tokens=500,
            )
            text: str = response.choices[0].message.content or ""
            mentioned = brand.lower() in text.lower()
            return {
                "prompt": prompt,
                "mentioned": mentioned,
                "sentiment": self._analyze_sentiment(text),
                "response_preview": text[:200],
            }
        except Exception as exc:
            logger.error("AEO check failed: %s", exc)
            return {
                "prompt": prompt,
                "mentioned": False,
                "sentiment": "unknown",
                "error": str(exc),
            }

    @staticmethod
    def _analyze_sentiment(text: str) -> str:
        text_lower = text.lower()
        pos = sum(
            1
            for w in ["good", "great", "excellent", "recommend", "best", "trusted"]
            if w in text_lower
        )
        neg = sum(
            1 for w in ["bad", "poor", "avoid", "scam", "worst"] if w in text_lower
        )
        if pos > neg:
            return "positive"
        if neg > pos:
            return "negative"
        return "neutral"

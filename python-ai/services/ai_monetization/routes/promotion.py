import json
import logging
import os
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import redis.asyncio as aioredis
import xgboost as xgb
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.feature_builder import FeatureBuilder
from core.model_loader import ModelLoader

logger = logging.getLogger(__name__)
router = APIRouter()

model_loader = ModelLoader()
redis_client = aioredis.from_url(
    os.getenv("REDIS_URL", "redis://redis:6379/0"), decode_responses=True
)

FEEDBACK_KEY = "monetization:feedback"
MIN_RETRAIN_SAMPLES = 100
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models") + "/promotion_model_v1.pkl"


class PromotionRequest(BaseModel):
    user_id: int
    features: Dict[str, float]
    candidates: List[str]
    context: Optional[Dict[str, Any]] = {}


class FeedbackItem(BaseModel):
    user_id: int
    variant: str
    features: Dict[str, float]
    label: int  # 1 = conversion


class PromotionResponse(BaseModel):
    variant: str
    score: float
    all_scores: List[Dict[str, float]]


# ── predict ────────────────────────────────────────────────────────────────────


@router.post("/predict-promotion", response_model=PromotionResponse)
async def predict_promotion(request: PromotionRequest):
    try:
        feature_vectors = np.array(
            [
                FeatureBuilder.build_features(request.features, v)
                for v in request.candidates
            ]
        )

        probas = model_loader.predict_proba(feature_vectors)
        scores = probas[:, 1]

        results = sorted(
            [
                {"variant": v, "score": float(s)}
                for v, s in zip(request.candidates, scores)
            ],
            key=lambda x: x["score"],
            reverse=True,
        )

        logger.info(
            "User %d: best=%s score=%.3f",
            request.user_id,
            results[0]["variant"],
            results[0]["score"],
        )
        return PromotionResponse(
            variant=results[0]["variant"],
            score=results[0]["score"],
            all_scores=results,
        )
    except Exception as exc:
        logger.error("predict_promotion failed: %s", exc)
        raise HTTPException(500, str(exc))


# ── feedback ───────────────────────────────────────────────────────────────────


@router.post("/feedback")
async def collect_feedback(feedback: FeedbackItem):
    await redis_client.lpush(FEEDBACK_KEY, feedback.json())
    count = await redis_client.llen(FEEDBACK_KEY)
    return {"status": "collected", "total_samples": count}


@router.get("/feedback/count")
async def get_feedback_count():
    count = await redis_client.llen(FEEDBACK_KEY)
    return {"total": count}


# ── retrain ────────────────────────────────────────────────────────────────────


@router.post("/retrain-from-feedback")
async def retrain_from_feedback():
    # خواندن همه feedbackها از Redis
    raw_items = []
    while True:
        item = await redis_client.rpop(FEEDBACK_KEY)
        if not item:
            break
        raw_items.append(json.loads(item))

    if len(raw_items) < MIN_RETRAIN_SAMPLES:
        raise HTTPException(
            400,
            f"Not enough data: {len(raw_items)} < {MIN_RETRAIN_SAMPLES}",
        )

    X = np.array(
        [FeatureBuilder.build_features(f["features"], f["variant"]) for f in raw_items]
    )
    y = np.array([f["label"] for f in raw_items])

    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric="logloss",
    )
    model.fit(X, y)

    # atomic write
    tmp_path = MODEL_PATH + ".tmp"
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, tmp_path)
    os.replace(tmp_path, MODEL_PATH)

    # بارگذاری مجدد در singleton
    model_loader._model = model

    logger.info("Model retrained with %d samples", len(y))
    return {"status": "retrained", "samples": len(y)}

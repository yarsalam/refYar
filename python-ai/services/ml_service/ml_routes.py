import datetime
import hashlib
import json
import logging
import os
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Body, HTTPException
from pydantic import BaseModel
from sklearn.metrics.pairwise import cosine_similarity

from core.embedding_client import EmbeddingClient
from core.redis_client import redis_client

logger = logging.getLogger(__name__)
router = APIRouter()

DATA_DIR = os.getenv("ML_DATA_DIR", "/tmp/ml_data")
os.makedirs(DATA_DIR, exist_ok=True)

embedding_client = EmbeddingClient()

# ── schemas ────────────────────────────────────────────────────────────────────


class TextIn(BaseModel):
    text: str


class CompareIn(BaseModel):
    text1: str
    text2: str


class SimpleCompareIn(BaseModel):
    a: List[float]
    b: List[float]


class PredictIn(BaseModel):
    userA: int
    userB: int


class RecommendIn(BaseModel):
    user_id: int
    candidates: List[int]
    weights: Optional[Dict[str, float]] = None


# ── endpoints ─────────────────────────────────────────────────────────────────


@router.post("/embed")
async def embed(payload: TextIn, user_id: Optional[int] = None):
    emb = await embedding_client.get_embedding(payload.text)
    if emb is None:
        raise HTTPException(503, "سرویس Embedding در دسترس نیست")
    if user_id is not None:
        await redis_client.set(f"embeddings:{user_id}", json.dumps(emb), ex=86400 * 7)
    return {
        "embedding": emb,
        "model": "paraphrase-multilingual-MiniLM-L12-v2",
        "version": "v3",
    }


@router.post("/compare")
async def compare(payload: CompareIn):
    emb1 = await embedding_client.get_embedding(payload.text1)
    emb2 = await embedding_client.get_embedding(payload.text2)
    if emb1 is None or emb2 is None:
        raise HTTPException(503, "سرویس Embedding در دسترس نیست")
    score = await embedding_client.compute_similarity(emb1, emb2)
    return {"score": round(score, 4)}


@router.post("/compare-simple")
async def compare_simple(payload: SimpleCompareIn):
    a = np.array(payload.a, dtype=np.float32)
    b = np.array(payload.b, dtype=np.float32)
    if len(a) != len(b):
        raise HTTPException(400, "Vectors must have same dimension")
    if not (np.all(np.isfinite(a)) and np.all(np.isfinite(b))):
        raise HTTPException(400, "Vectors contain invalid values")
    sim = float(cosine_similarity([a], [b])[0][0])
    return {"similarity": round(sim, 4)}


@router.post("/predict")
async def predict(payload: PredictIn):
    raw_a = await redis_client.get(f"embeddings:{payload.userA}")
    raw_b = await redis_client.get(f"embeddings:{payload.userB}")
    if not raw_a or not raw_b:
        raise HTTPException(404, "embedding not found — call /embed first")

    a = np.array(json.loads(raw_a), dtype=np.float32)
    b = np.array(json.loads(raw_b), dtype=np.float32)

    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return {"score": 0.0}

    score = float(np.dot(a, b) / (norm_a * norm_b))
    return {"score": round(score, 4)}


@router.post("/recommend")
async def recommend(payload: RecommendIn):
    raw_user = await redis_client.get(f"embeddings:{payload.user_id}")
    if not raw_user:
        raise HTTPException(404, "user embedding not found")

    user_emb = np.array(json.loads(raw_user), dtype=np.float32)
    user_norm = np.linalg.norm(user_emb)
    if user_norm == 0:
        raise HTTPException(400, "user embedding is zero vector")

    results = []
    for cid in payload.candidates:
        raw = await redis_client.get(f"embeddings:{cid}")
        if not raw:
            continue
        c_emb = np.array(json.loads(raw), dtype=np.float32)
        c_norm = np.linalg.norm(c_emb)
        if c_norm == 0:
            continue
        score = float(np.dot(user_emb, c_emb) / (user_norm * c_norm))
        results.append({"candidate": cid, "score": round(score, 4)})

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"recommendations": results}


@router.post("/train")
def train(
    background_tasks: BackgroundTasks,
    payload: dict = Body(...),
    mode: str = "partial",
):
    events = payload.get("events")
    if not isinstance(events, list) or not events:
        raise HTTPException(400, "events array required and cannot be empty")

    job_name = (
        payload.get("job_name") or f"job_{int(datetime.datetime.utcnow().timestamp())}"
    )
    ts = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
    save_path = os.path.join(DATA_DIR, f"{job_name}_{ts}.json")

    try:
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        logger.exception("Failed to save payload")
        raise HTTPException(500, str(exc))

    background_tasks.add_task(_background_train, save_path, job_name, mode)
    logger.info("Accepted training job %s (mode=%s)", job_name, mode)
    return {"status": "accepted", "job_name": job_name, "mode": mode}


@router.get("/health")
def health():
    return {"status": "ok"}


# ── background training ────────────────────────────────────────────────────────


def _background_train(json_path: str, job_name: str, mode: str) -> None:
    try:
        logger.info("[TRAIN] Started job=%s mode=%s", job_name, mode)
        with open(json_path, "r", encoding="utf-8") as f:
            payload = json.load(f)

        events = payload.get("events", [])
        df = pd.json_normalize(events)
        if df.empty:
            logger.warning("[TRAIN] No events in %s", json_path)
            return

        df["label"] = df["action"].apply(
            lambda a: (
                1
                if isinstance(a, str)
                and any(x in a.lower() for x in ["like", "superlike", "message"])
                else 0
            )
        )

        def _hash32(x: str) -> int:
            return int(hashlib.sha256(str(x).encode()).hexdigest()[:8], 16)

        df["user_hash"] = df["userId"].apply(_hash32)
        df["target_hash"] = df["targetId"].apply(_hash32)
        df["createdAt"] = pd.to_datetime(df["createdAt"], errors="coerce")
        df["hour"] = df["createdAt"].dt.hour.fillna(0).astype(int)
        df["dow"] = df["createdAt"].dt.dayofweek.fillna(0).astype(int)

        X = df[["user_hash", "target_hash", "hour", "dow"]].fillna(0)
        y = df["label"]

        model_path = os.path.join(DATA_DIR, f"{job_name}.xgb")

        try:
            import xgboost as xgb

            dtrain = xgb.DMatrix(X, label=y)
            params = {"objective": "binary:logistic", "eval_metric": "auc"}
            bst = xgb.train(params, dtrain, num_boost_round=50)
            bst.save_model(model_path)
            logger.info("[TRAIN] Finished job=%s — saved to %s", job_name, model_path)
        except Exception as exc:
            logger.exception("[TRAIN] XGBoost failed, saving fallback stats")
            stats = {"conversion_rate": float(y.mean()), "n_events": int(len(y))}
            with open(os.path.join(DATA_DIR, f"{job_name}_stats.json"), "w") as sf:
                json.dump(stats, sf)

    except Exception as exc:
        logger.exception("[TRAIN] Unexpected error: %s", exc)

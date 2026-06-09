import hashlib
import logging
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from ml_routes import router as ml_router

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ML Match Service started")
    yield
    logger.info("ML Match Service stopped")


app = FastAPI(title="ML Match Service", version="1.0.0", lifespan=lifespan)
app.include_router(ml_router, prefix="/api", tags=["ml"])

# ── schemas ────────────────────────────────────────────────────────────────────


class RecommendReq(BaseModel):
    user_id: int
    candidates: List[int]
    weights: Optional[Dict[str, float]] = None


class PredictReq(BaseModel):
    user_a: int
    user_b: int


# ── deterministic scorer (dev/fallback) ───────────────────────────────────────


def _det_score(user_id: int, candidate_id: int) -> float:
    h = hashlib.sha256(f"{user_id}-{candidate_id}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


# ── endpoints ─────────────────────────────────────────────────────────────────


@app.post("/api/recommend")
def recommend(req: RecommendReq):
    if not req.candidates:
        raise HTTPException(400, "candidates required")

    weights = req.weights or {"profile": 0.5, "behavior": 0.4, "social": 0.1}
    results = []

    for cid in req.candidates:
        base = _det_score(req.user_id, cid)
        profile = base
        behavior = min(1.0, base * 0.9 + 0.05)
        social = max(0.0, base * 0.3)
        score = (
            weights.get("profile", 0) * profile
            + weights.get("behavior", 0) * behavior
            + weights.get("social", 0) * social
        )
        results.append(
            {
                "user_id": cid,
                "score": round(score, 4),
                "components": {
                    "profile": round(profile, 4),
                    "behavior": round(behavior, 4),
                    "social": round(social, 4),
                },
            }
        )

    results.sort(key=lambda r: r["score"], reverse=True)
    return {"results": results}


@app.post("/api/predict")
def predict(req: PredictReq):
    score = _det_score(req.user_a, req.user_b)
    return {
        "score": round(score, 4),
        "meta": {"user_a": req.user_a, "user_b": req.user_b},
        "components": {
            "profile": round(score, 4),
            "behavior": round(min(1.0, score * 0.9 + 0.05), 4),
            "social": round(max(0.0, score * 0.3), 4),
        },
    }


@app.get("/health")
def health():
    return {"status": "healthy", "service": "ml_match_service"}


@app.get("/")
def root():
    return {"status": "running", "service": "ml_match_service"}

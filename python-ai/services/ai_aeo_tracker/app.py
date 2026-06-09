from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

from core.aeo_tracker import AEOVisibilityTracker

app = FastAPI(title="AEO Visibility Tracker", version="1.0.0")
tracker = AEOVisibilityTracker()


class MentionRequest(BaseModel):
    brand: str
    prompts: List[str]


@app.post("/check-mentions")
async def check_mentions(req: MentionRequest):
    try:
        results = await tracker.check_mentions(req.brand, req.prompts)
        return {"brand": req.brand, "results": results}
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.get("/health")
async def health():
    return {"status": "ok"}

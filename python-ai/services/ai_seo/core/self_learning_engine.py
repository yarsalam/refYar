import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional

import redis
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split

from core.base_model import PersistentModelMixin

logger = logging.getLogger(__name__)

PATTERNS_REDIS_KEY = "seo:revenue_patterns"
HISTORY_REDIS_KEY = "seo:recommendation_history"
PATTERNS_TTL = 86400 * 90  # 90 روز

_PHASE_RECS = {
    "phase_1_learning": [
        {
            "activity": "بهبود Core Web Vitals",
            "cost": 0,
            "effort": "2 هفته",
            "expected_roi": 1.5,
            "rev_factor": 0.15,
        },
        {
            "activity": "تولید محتوای مبتنی بر هابی‌های کاربران",
            "cost": 0,
            "effort": "۱ هفته",
            "expected_roi": 2.5,
            "rev_factor": 0.25,
        },
        {
            "activity": "فعالیت در انجمن‌های رایگان",
            "cost": 0,
            "effort": "مداوم",
            "expected_roi": 1.2,
            "rev_factor": 0.1,
        },
    ],
    "phase_2_growth": [
        {
            "activity": "تبلیغ در کانال‌های تلگرامی",
            "cost": 200,
            "effort": "۱ هفته",
            "expected_roi": 4.0,
            "rev_flat": 800,
        },
        {
            "activity": "خرید بک‌لینک از سایت‌های خارجی",
            "cost": 150,
            "effort": "۲ هفته",
            "expected_roi": 3.0,
            "rev_flat": 450,
        },
        {
            "activity": "گوگل ادز (کشورهای همسایه)",
            "cost": 300,
            "effort": "مداوم",
            "expected_roi": 3.0,
            "rev_flat": 900,
        },
    ],
    "phase_3_scaling": [
        {
            "activity": "همکاری با اینفلوئنسرهای خارجی",
            "cost": 500,
            "effort": "۱ ماه",
            "expected_roi": 4.0,
            "rev_flat": 2000,
        },
        {
            "activity": "کمپین Reality-style دانشجویی",
            "cost": 1000,
            "effort": "۲ ماه",
            "expected_roi": 5.0,
            "rev_flat": 5000,
        },
        {
            "activity": "Super Match",
            "cost": 0,
            "effort": "۳ ماه",
            "expected_roi": 10.0,
            "rev_flat": 10000,
        },
    ],
}

_REVENUE_BASE = {
    "تبلیغ": 500,
    "بک‌لینک": 300,
    "گوگل": 800,
    "اینفلوئنسر": 1500,
    "کمپین": 2000,
    "Super Match": 5000,
}


class SelfLearningSEOEngine(PersistentModelMixin):
    def __init__(self):
        super().__init__("/app/models/seo_self_learning.pkl")
        if self.model is None:
            self.model = RandomForestRegressor(n_estimators=100, random_state=42)

        self.is_trained: bool = False

        try:
            self._redis = redis.Redis(
                host=os.getenv("REDIS_HOST", "redis"),
                port=int(os.getenv("REDIS_PORT", 6379)),
                decode_responses=True,
                socket_connect_timeout=2,
            )
            # بارگذاری patterns از Redis
            self._revenue_patterns = self._load_patterns()
            self._recommendation_history = self._load_history()
            logger.info(
                "Loaded %d patterns, %d history from Redis",
                len(self._revenue_patterns),
                len(self._recommendation_history),
            )
        except Exception as exc:
            logger.warning("Redis not available: %s", exc)
            self._redis = None
            self._revenue_patterns: List[Dict] = []
            self._recommendation_history: List[Dict] = []

    # ── Redis persistence ─────────────────────────────────────────────────────

    def _load_patterns(self) -> List[Dict]:
        try:
            raw = self._redis.get(PATTERNS_REDIS_KEY) if self._redis else None
            return json.loads(raw) if raw else []
        except Exception:
            return []

    def _load_history(self) -> List[Dict]:
        try:
            raw = self._redis.get(HISTORY_REDIS_KEY) if self._redis else None
            return json.loads(raw) if raw else []
        except Exception:
            return []

    def _save_patterns(self) -> None:
        if not self._redis:
            return
        try:
            self._redis.setex(
                PATTERNS_REDIS_KEY, PATTERNS_TTL, json.dumps(self._revenue_patterns)
            )
        except Exception as exc:
            logger.warning("Could not save patterns to Redis: %s", exc)

    def _save_history(self) -> None:
        if not self._redis:
            return
        try:
            self._redis.setex(
                HISTORY_REDIS_KEY,
                PATTERNS_TTL,
                json.dumps(self._recommendation_history[-500:]),
            )  # max 500
        except Exception as exc:
            logger.warning("Could not save history to Redis: %s", exc)

    # ── public API ─────────────────────────────────────────────────────────────

    def learn_from_data(self, all_data: Dict) -> Dict:
        try:
            for camp in all_data.get("campaigns", []):
                rev = camp.get("results", {}).get("revenue", 0)
                if rev > 0:
                    cost = camp.get("cost", 0)
                    self._revenue_patterns.append(
                        {
                            "activity": camp.get("type", "unknown"),
                            "cost": cost,
                            "revenue": rev,
                            "roi": rev / max(cost, 1),
                            "timestamp": camp.get(
                                "performedAt", datetime.now().isoformat()
                            ),
                        }
                    )

            self._save_patterns()

            if len(self._revenue_patterns) >= 100:
                self._train()

            return {
                "learned_patterns_count": len(self._revenue_patterns),
                "avg_roi": self._avg_roi(),
                "best_activity": self._best_activity(),
                "is_trained": self.is_trained,
            }
        except Exception as exc:
            logger.error("learn_from_data failed: %s", exc)
            return {"error": str(exc)}

    def teach_admin(self, current_state: Dict) -> Dict:
        try:
            analysis = self._analyze_state(current_state)
            recs = self._build_recommendations(analysis)
            recs.sort(key=lambda x: x.get("estimated_roi", 0), reverse=True)
            return {
                "current_phase": analysis["phase"],
                "top_3_recommendations": recs[:3],
                "estimated_monthly_revenue": sum(
                    r.get("estimated_revenue", 0) for r in recs[:3]
                ),
                "learning_progress": {
                    "patterns_learned": len(self._revenue_patterns),
                    "accuracy": self._accuracy(),
                },
            }
        except Exception as exc:
            logger.error("teach_admin failed: %s", exc)
            return {"error": str(exc)}

    def get_feedback(self, admin_action: Dict, actual_result: Dict) -> Dict:
        self._recommendation_history.append(
            {
                "recommendation": admin_action,
                "actual_result": actual_result,
                "was_successful": actual_result.get("revenue", 0)
                > admin_action.get("estimated_cost", 0),
            }
        )
        self._save_history()
        if len(self._recommendation_history) % 50 == 0:
            self._train()
        return {"new_accuracy": self._accuracy()}

    def get_phase_recommendations(self, phase: str) -> List[Dict]:
        recs = self._phase_based_recs(phase, monthly_revenue=0)
        if not self._redis:
            return recs
        weighted = []
        for rec in recs:
            try:
                w = float(self._redis.get(f"seo:rec:{phase}:{rec['activity']}") or 1.0)
            except Exception:
                w = 1.0
            rec["weight"] = w
            weighted.append(rec)
        return sorted(weighted, key=lambda x: x["weight"], reverse=True)

    # ── private ────────────────────────────────────────────────────────────────

    def _train(self) -> None:
        if len(self._revenue_patterns) < 100:
            return
        try:
            # بدون Leakage: X فقط cost و طول activity، y درآمد
            X = [
                [p["cost"], len(p.get("activity", ""))] for p in self._revenue_patterns
            ]
            y = [p["revenue"] for p in self._revenue_patterns]
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )
            self.model.fit(X_train, y_train)
            self.is_trained = True
            self.save()
            score = self.model.score(X_test, y_test)
            logger.info("SEO model trained, R²=%.3f", score)
        except Exception as exc:
            logger.error("SEO training failed: %s", exc)

    def _avg_roi(self) -> float:
        if not self._revenue_patterns:
            return 0.0
        return round(
            sum(p["roi"] for p in self._revenue_patterns) / len(self._revenue_patterns),
            3,
        )

    def _best_activity(self) -> Dict:
        if not self._revenue_patterns:
            return {"name": "none", "roi": 0}
        best = max(self._revenue_patterns, key=lambda p: p["roi"])
        return {"name": best["activity"], "roi": best["roi"]}

    def _accuracy(self) -> float:
        if not self._recommendation_history:
            return 0.0
        return round(
            sum(1 for r in self._recommendation_history if r["was_successful"])
            / len(self._recommendation_history),
            3,
        )

    def _analyze_state(self, state: Dict) -> Dict:
        rev = state.get("monthly_revenue", 0)
        users = state.get("user_count", 0)
        if rev < 1000 or users < 1000:
            phase = "phase_1_learning"
        elif rev < 10000 or users < 10000:
            phase = "phase_2_growth"
        else:
            phase = "phase_3_scaling"
        return {
            "phase": phase,
            "monthly_revenue": rev,
            "user_count": users,
            "avg_user_value": rev / max(users, 1),
        }

    def _build_recommendations(self, analysis: Dict) -> List[Dict]:
        recs = self._phase_based_recs(analysis["phase"], analysis["monthly_revenue"])
        for rec in recs:
            rec["estimated_revenue"] = self._predict_revenue(
                rec["activity"], analysis["user_count"], analysis["avg_user_value"]
            )
            rec["confidence"] = (
                "high"
                if self.is_trained and len(self._revenue_patterns) > 200
                else "medium" if len(self._revenue_patterns) > 50 else "low"
            )
        return recs

    def _phase_based_recs(self, phase: str, monthly_revenue: float) -> List[Dict]:
        raw = _PHASE_RECS.get(phase, [])
        result = []
        for r in raw:
            rec = dict(r)
            if "rev_factor" in rec:
                rec["estimated_revenue"] = monthly_revenue * rec.pop("rev_factor")
            elif "rev_flat" in rec:
                rec["estimated_revenue"] = rec.pop("rev_flat")
            else:
                rec["estimated_revenue"] = 0
            rec["estimated_roi"] = rec.get("expected_roi", 1.0)
            result.append(rec)
        return result

    def _predict_revenue(
        self, activity: str, user_count: int, avg_value: float
    ) -> float:
        if self.is_trained and len(self._revenue_patterns) >= 100:
            try:
                return float(self.model.predict([[0, len(activity)]])[0])
            except Exception:
                pass
        for key, value in _REVENUE_BASE.items():
            if key in activity:
                return float(value)
        return 100.0

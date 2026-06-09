import os
import time
import joblib
import logging
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score, precision_score, recall_score

class XGBMatchModel:
    def __init__(self, model_dir: str = "models_store/xgboost"):
        self.model_dir = model_dir
        os.makedirs(self.model_dir, exist_ok=True)
        self.model = None
        self.feature_columns = None

    def train_from_df(self, df: pd.DataFrame, label_col: str = "matched", params: dict = None):
        if label_col not in df.columns:
            raise ValueError(f"Label column '{label_col}' not found.")

        X = df.drop(columns=[label_col, "user1_id", "user2_id"], errors="ignore")
        y = df[label_col]
        self.feature_columns = X.columns.tolist()

        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

        default_params = dict(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            use_label_encoder=False,
            eval_metric="logloss"
        )
        if params:
            default_params.update(params)

        model = XGBClassifier(**default_params)
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], early_stopping_rounds=20, verbose=False)

        preds = model.predict(X_val)
        probs = model.predict_proba(X_val)[:, 1]

        metrics = {
            "accuracy": float(accuracy_score(y_val, preds)),
            "roc_auc": float(roc_auc_score(y_val, probs)),
            "precision": float(precision_score(y_val, preds)),
            "recall": float(recall_score(y_val, preds)),
        }

        version = int(time.time())
        save_path = os.path.join(self.model_dir, f"xgb_{version}.pkl")
        joblib.dump({"model": model, "feature_columns": self.feature_columns}, save_path)

        self.model = model
        logging.info(f"Trained and saved XGBoost model at {save_path}")
        return {"path": save_path, "version": version, "metrics": metrics}

    def load(self, path: str):
        data = joblib.load(path)
        self.model = data["model"]
        self.feature_columns = data.get("feature_columns")
        logging.info(f"Loaded XGBoost model from {path}")

    def predict(self, features: dict):
        if self.model is None:
            raise RuntimeError("Model not loaded.")
        X = pd.DataFrame([features])
        X = X.reindex(columns=self.feature_columns, fill_value=0)
        return float(self.model.predict_proba(X)[0][1])

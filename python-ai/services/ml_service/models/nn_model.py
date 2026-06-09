import logging
import os
import time

import joblib
import numpy as np

logger = logging.getLogger(__name__)


def build_mixed_model(emb_dim: int = 384, feature_dim: int = 20):
    try:
        import tensorflow as tf
        from tensorflow.keras import layers, Model

        user_input = layers.Input(shape=(emb_dim,), name="user_emb")
        target_input = layers.Input(shape=(emb_dim,), name="target_emb")
        feature_input = layers.Input(shape=(feature_dim,), name="features")

        merged_emb = layers.Concatenate()([user_input, target_input])
        emb_dense = layers.Dense(256, activation="relu")(merged_emb)  # تایپو برطرف شد

        combined = layers.Concatenate()([emb_dense, feature_input])
        x = layers.Dense(256, activation="relu")(combined)
        x = layers.Dropout(0.2)(x)
        x = layers.Dense(128, activation="relu")(x)
        output = layers.Dense(1, activation="sigmoid")(x)

        model = Model(inputs=[user_input, target_input, feature_input], outputs=output)
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
            loss="binary_crossentropy",
            metrics=[tf.keras.metrics.AUC(name="auc")],
        )
        return model
    except ImportError:
        logger.warning("TensorFlow not available")
        return None


class NNMatchModel:
    def __init__(
        self,
        model_dir: str = "models_store/nn",
        emb_dim: int = 384,
        feature_dim: int = 20,
    ):
        self.model_dir = model_dir
        os.makedirs(self.model_dir, exist_ok=True)
        self.emb_dim = emb_dim
        self.feature_dim = feature_dim
        self.model = build_mixed_model(emb_dim, feature_dim)

    def train(
        self,
        user_embs: np.ndarray,
        target_embs: np.ndarray,
        features: np.ndarray,
        labels: np.ndarray,
        epochs: int = 10,
        batch_size: int = 256,
    ) -> Dict:
        if self.model is None:
            raise RuntimeError("TensorFlow not available")

        try:
            import tensorflow as tf

            callbacks = [
                tf.keras.callbacks.EarlyStopping(
                    monitor="val_loss", patience=3, restore_best_weights=True
                )
            ]
            history = self.model.fit(
                [user_embs, target_embs, features],
                labels,
                epochs=epochs,
                batch_size=batch_size,
                validation_split=0.1,
                callbacks=callbacks,
                verbose=0,
            )
            version = int(time.time())
            save_folder = os.path.join(self.model_dir, f"nn_{version}")
            self.model.save(save_folder, include_optimizer=False)
            joblib.dump(
                {"emb_dim": self.emb_dim, "feature_dim": self.feature_dim},
                save_folder + ".meta.pkl",
            )
            logger.info("NN model saved: %s", save_folder)
            return {"path": save_folder, "version": version}
        except Exception as exc:
            logger.error("NN training failed: %s", exc)
            raise

    def predict(
        self, user_emb: np.ndarray, target_emb: np.ndarray, features: np.ndarray
    ) -> float:
        if self.model is None:
            raise RuntimeError("TensorFlow not available")
        u = np.asarray(user_emb, dtype=np.float32).reshape(1, -1)
        v = np.asarray(target_emb, dtype=np.float32).reshape(1, -1)
        f = np.asarray(features, dtype=np.float32).reshape(1, -1)
        return float(self.model.predict([u, v, f], verbose=0)[0][0])

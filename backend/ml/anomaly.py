"""
Isolation Forest + LSTM Autoencoder anomaly detection.
Combined score: 0.6 * IF + 0.4 * LSTM
"""
from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
import structlog

log = structlog.get_logger()

FEATURE_NAMES = [
    "p50_latency_ms", "p95_latency_ms", "p99_latency_ms",
    "error_rate_1m", "error_rate_5m", "error_rate_15m",
    "cpu_usage", "mem_usage", "req_per_second", "latency_stddev",
]


# ─── Isolation Forest ─────────────────────────────────────────────────────────

def train_isolation_forest(X_train: np.ndarray, service_id: str, run_mlflow: bool = True):
    """Train Isolation Forest and optionally log to MLflow."""
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    model = IsolationForest(
        n_estimators=200,
        contamination=0.05,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    raw_scores = model.score_samples(X_scaled)
    anomaly_rate = float((raw_scores < model.offset_).mean())
    mean_score = float(raw_scores.mean())
    p95_score = float(np.percentile(raw_scores, 95))

    run_id = None
    if run_mlflow:
        try:
            import mlflow
            with mlflow.start_run() as run:
                mlflow.log_params({
                    "n_estimators": 200,
                    "contamination": 0.05,
                    "features": str(FEATURE_NAMES),
                    "service_id": service_id,
                    "training_samples": len(X_train),
                })
                mlflow.log_metrics({
                    "anomaly_rate": anomaly_rate,
                    "mean_score": mean_score,
                    "p95_score": p95_score,
                })
                mlflow.sklearn.log_model(model, "model")
                mlflow.sklearn.log_model(scaler, "scaler")
                mlflow.set_tag("model_type", "isolation_forest")
                mlflow.set_tag("service_id", service_id)
                mlflow.set_tag("is_champion", "false")
                run_id = run.info.run_id
        except Exception as exc:
            log.warning("mlflow.log_failed", model="isolation_forest", error=str(exc))

    return model, scaler, {
        "anomaly_rate": anomaly_rate,
        "mean_score": mean_score,
        "p95_score": p95_score,
        "run_id": run_id,
    }


def score_isolation_forest(
    model, scaler, X: np.ndarray
) -> np.ndarray:
    """Score samples. Returns normalized [0,1] where 1=most anomalous."""
    X_scaled = scaler.transform(X)
    raw_scores = model.score_samples(X_scaled)
    min_s = raw_scores.min()
    max_s = raw_scores.max()
    if max_s == min_s:
        return np.zeros(len(raw_scores))
    normalized = 1 - (raw_scores - min_s) / (max_s - min_s)
    return np.clip(normalized, 0, 1)


# ─── LSTM Autoencoder ─────────────────────────────────────────────────────────

def build_lstm_autoencoder(input_shape: tuple = (60, 10)):
    """Build LSTM autoencoder model."""
    try:
        import tensorflow as tf
        from keras import layers, Model

        inputs = layers.Input(shape=input_shape)
        x = layers.LSTM(64, return_sequences=True)(inputs)
        x = layers.Dropout(0.2)(x)
        encoded = layers.LSTM(32, return_sequences=False)(x)
        x = layers.RepeatVector(input_shape[0])(encoded)
        x = layers.LSTM(32, return_sequences=True)(x)
        x = layers.Dropout(0.2)(x)
        x = layers.LSTM(64, return_sequences=True)(x)
        decoded = layers.TimeDistributed(layers.Dense(input_shape[1]))(x)

        autoencoder = Model(inputs, decoded)
        autoencoder.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss="mse",
        )
        return autoencoder
    except ImportError:
        log.warning("tensorflow.not_available", detail="LSTM AE disabled")
        return None


def train_lstm_autoencoder(X_train: np.ndarray, service_id: str,
                           run_mlflow: bool = True, timesteps: int = 60):
    """Train LSTM autoencoder on normal data."""
    if len(X_train) < timesteps * 2:
        log.warning("lstm.insufficient_data", samples=len(X_train), required=timesteps * 2)
        return None, None, {}

    autoencoder = build_lstm_autoencoder(input_shape=(timesteps, X_train.shape[1]))
    if autoencoder is None:
        return None, None, {}

    # Create sequences
    sequences = []
    for i in range(len(X_train) - timesteps):
        sequences.append(X_train[i:i + timesteps])
    X_seq = np.array(sequences)

    try:
        from keras.callbacks import EarlyStopping
        callbacks = [EarlyStopping(patience=10, restore_best_weights=True, monitor="val_loss")]
        autoencoder.fit(
            X_seq, X_seq,
            epochs=50,
            batch_size=32,
            validation_split=0.1,
            callbacks=callbacks,
            verbose=0,
        )
    except Exception as exc:
        log.warning("lstm.training_failed", error=str(exc))
        return None, None, {}

    # Compute reconstruction errors on training data
    X_reconstructed = autoencoder.predict(X_seq, verbose=0)
    train_errors = np.mean(np.abs(X_seq - X_reconstructed) ** 2, axis=(1, 2))
    threshold = float(np.percentile(train_errors, 95))
    mean_error = float(train_errors.mean())
    p95_error = float(np.percentile(train_errors, 95))

    run_id = None
    if run_mlflow:
        try:
            import mlflow
            with mlflow.start_run() as run:
                mlflow.log_params({
                    "model_type": "lstm_ae",
                    "service_id": service_id,
                    "timesteps": timesteps,
                    "epochs": 50,
                })
                mlflow.log_metrics({
                    "reconstruction_threshold": threshold,
                    "mean_train_error": mean_error,
                    "p95_train_error": p95_error,
                })
                mlflow.set_tag("model_type", "lstm_ae")
                mlflow.set_tag("service_id", service_id)
                mlflow.set_tag("is_champion", "false")
                run_id = run.info.run_id
        except Exception as exc:
            log.warning("mlflow.log_failed", model="lstm_ae", error=str(exc))

    return autoencoder, threshold, {
        "reconstruction_threshold": threshold,
        "mean_train_error": mean_error,
        "p95_train_error": p95_error,
        "run_id": run_id,
    }


def score_lstm_autoencoder(
    autoencoder, threshold: float, X: np.ndarray, timesteps: int = 60
) -> Optional[float]:
    """Score a single window. Returns [0,1] anomaly score."""
    if autoencoder is None or len(X) < timesteps:
        return None
    window = X[-timesteps:].reshape(1, timesteps, X.shape[1])
    try:
        reconstructed = autoencoder.predict(window, verbose=0)
        error = float(np.mean(np.abs(window - reconstructed) ** 2))
        score = float(np.clip(error / threshold if threshold > 0 else 0, 0, 1))
        return score
    except Exception:
        return None


# ─── Combined scoring ─────────────────────────────────────────────────────────

async def run_combined_detection(
    service_id: str,
    features_df: pd.DataFrame,
    if_model=None,
    if_scaler=None,
    lstm_model=None,
    lstm_threshold: float = 1.0,
    anomaly_threshold: float = 0.7,
) -> dict:
    """
    Run combined IF + LSTM detection.
    Returns anomaly dict if above threshold, empty dict otherwise.
    """
    try:
        from observability.metrics import (
            model_inference_duration, anomaly_detections_total
        )
    except ImportError:
        model_inference_duration = None
        anomaly_detections_total = None

    X = features_df[FEATURE_NAMES].fillna(0).values

    # IF score
    if_score = 0.5
    if if_model is not None and if_scaler is not None:
        with model_inference_duration.labels(
            model_type="isolation_forest", service_id=service_id
        ).time() if model_inference_duration else _null_ctx():
            scores = score_isolation_forest(if_model, if_scaler, X[-1:])
            if_score = float(scores[0])

    # LSTM score
    lstm_score = 0.5
    if lstm_model is not None:
        with model_inference_duration.labels(
            model_type="lstm_ae", service_id=service_id
        ).time() if model_inference_duration else _null_ctx():
            s = score_lstm_autoencoder(lstm_model, lstm_threshold, X)
            if s is not None:
                lstm_score = s

    final_score = 0.6 * if_score + 0.4 * lstm_score
    latest = features_df.iloc[-1].to_dict()
    # Sanitize NaN values for JSONB compatibility in Postgres
    feature_values = {}
    for k, v in latest.items():
        if k in FEATURE_NAMES:
            try:
                val = float(v)
                feature_values[k] = 0.0 if np.isnan(val) else val
            except (ValueError, TypeError):
                feature_values[k] = 0.0

    # ── SHAP explanation ───────────────────────────────────────────────────
    shap_explanation: list[dict] = []
    top_contributor: Optional[str] = None

    if if_model is not None and if_scaler is not None:
        try:
            import shap
            X_scaled = if_scaler.transform(X[-1:])
            explainer = shap.TreeExplainer(if_model)
            shap_values = explainer.shap_values(X_scaled)
            # shap_values shape: (1, n_features)
            sv = shap_values[0] if shap_values is not None else []
            explanation_list = []
            for i, feat in enumerate(FEATURE_NAMES):
                val = float(sv[i]) if i < len(sv) else 0.0
                explanation_list.append({
                    "feature": feat,
                    "value": feature_values.get(feat, 0.0),
                    "shap_value": val,
                    "direction": "positive" if val > 0 else "negative",
                })
            # Sort by absolute shap value descending
            explanation_list.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
            shap_explanation = explanation_list
            if explanation_list:
                top_contributor = explanation_list[0]["feature"]
        except Exception as shap_exc:
            log.debug("shap.explanation_failed", error=str(shap_exc))

    result = {
        "anomaly_id": str(uuid.uuid4()),
        "service_id": service_id,
        "anomaly_score": float(final_score),
        "if_score": float(if_score),
        "lstm_score": float(lstm_score),
        "anomaly_type": "combined",
        "metric_name": "multi",
        "features": {
            **feature_values,
            **({"shap_explanation": shap_explanation, "top_contributor": top_contributor}
               if shap_explanation else {}),
        },
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }

    return result


class _null_ctx:
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass


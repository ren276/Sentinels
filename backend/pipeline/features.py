"""
Feature engineering from raw metrics.
Computes rolling windows for ML model input.
"""
import json
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import structlog

log = structlog.get_logger()

FEATURE_NAMES = [
    "p50_latency_ms",
    "p95_latency_ms",
    "p99_latency_ms",
    "error_rate_1m",
    "error_rate_5m",
    "error_rate_15m",
    "cpu_usage",
    "mem_usage",
    "req_per_second",
    "latency_stddev",
]


def compute_rolling_features(
    df: pd.DataFrame,
    service_id: str,
) -> pd.DataFrame:
    """
    Compute rolling features from raw metric rows.
    Input: DataFrame with columns [timestamp, metric_name, value]
    Output: DataFrame with FEATURE_NAMES columns
    """
    if df.empty:
        return pd.DataFrame(columns=FEATURE_NAMES)

    # Ensure timestamps are datetime objects
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)

    # Pivot wide
    wide = df.pivot_table(
        index="timestamp",
        columns="metric_name",
        values="value",
        aggfunc="mean",
    ).sort_index()

    features = pd.DataFrame(index=wide.index)

    # Latency percentiles (rolling)
    latency_col = "p95_latency_ms" if "p95_latency_ms" in wide.columns else None
    if latency_col:
        rolling_latency = wide[latency_col].rolling("5min", min_periods=1)
        features["p95_latency_ms"] = rolling_latency.mean()
        features["p50_latency_ms"] = rolling_latency.quantile(0.5)
        features["p99_latency_ms"] = rolling_latency.quantile(0.99)
        features["latency_stddev"] = wide[latency_col].rolling("15min", min_periods=1).std().fillna(0)
    else:
        features["p95_latency_ms"] = 0.0
        features["p50_latency_ms"] = 0.0
        features["p99_latency_ms"] = 0.0
        features["latency_stddev"] = 0.0

    if "p50_latency_ms" in wide.columns:
        features["p50_latency_ms"] = wide["p50_latency_ms"].rolling("5min", min_periods=1).mean()

    # Error rates at multiple windows
    if "error_rate" in wide.columns:
        features["error_rate_1m"] = wide["error_rate"].rolling("1min", min_periods=1).mean()
        features["error_rate_5m"] = wide["error_rate"].rolling("5min", min_periods=1).mean()
        features["error_rate_15m"] = wide["error_rate"].rolling("15min", min_periods=1).mean()
    else:
        features["error_rate_1m"] = 0.0
        features["error_rate_5m"] = 0.0
        features["error_rate_15m"] = 0.0

    # Resource metrics
    for col in ["cpu_usage", "mem_usage", "req_per_second"]:
        if col in wide.columns:
            features[col] = wide[col].rolling("5min", min_periods=1).mean()
        else:
            features[col] = 0.0

    # Ensure all expected columns exist
    for col in FEATURE_NAMES:
        if col not in features.columns:
            features[col] = 0.0

    features = features[FEATURE_NAMES].fillna(0.0)
    return features


def get_feature_vector(df: pd.DataFrame, service_id: str) -> np.ndarray | None:
    """
    Get the latest feature vector for inference.
    Returns 1D array of shape (len(FEATURE_NAMES),).
    """
    features = compute_rolling_features(df, service_id)
    if features.empty:
        return None
    return features.iloc[-1].values.astype(np.float32)


def get_sequence_for_lstm(
    df: pd.DataFrame,
    service_id: str,
    sequence_len: int = 60,
) -> np.ndarray | None:
    """
    Build LSTM input sequence.
    Returns array of shape (1, sequence_len, n_features).
    """
    features = compute_rolling_features(df, service_id)
    if len(features) < 10:
        return None

    # Pad or trim to sequence_len
    arr = features.values.astype(np.float32)
    if len(arr) >= sequence_len:
        arr = arr[-sequence_len:]
    else:
        # Pad with first row
        pad = np.tile(arr[0], (sequence_len - len(arr), 1))
        arr = np.vstack([pad, arr])

    return arr.reshape(1, sequence_len, len(FEATURE_NAMES))


def write_features_to_redis(
    features: pd.DataFrame,
    service_id: str,
    redis: Any,
    ttl: int = 3600,
) -> None:
    """Cache computed features for fast inference."""
    if features.empty:
        return
    for timestamp, row in features.iterrows():
        key = f"features:{service_id}:{int(timestamp.timestamp())}"
        try:
            redis.setex(key, ttl, json.dumps(row.to_dict()))
        except Exception as e:
            log.warning("feature_cache.write_failed", error=str(e))

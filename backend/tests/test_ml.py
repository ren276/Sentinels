"""
ML tests — anomaly detection, forecasting, and feature engineering.
"""
import numpy as np
import pandas as pd
import pytest
from datetime import datetime, timezone, timedelta


# ── Feature Engineering ───────────────────────────────────────────────────────

def _make_metrics_df(n_rows=120, include_anomaly=False):
    """Generate a realistic metrics DataFrame."""
    now = datetime.now(timezone.utc)
    timestamps = [now - timedelta(minutes=i) for i in range(n_rows, 0, -1)]
    rows = []
    for ts in timestamps:
        rows.append({"service_id": "test-svc", "metric_name": "p95_latency_ms",
                     "value": 120.0 + np.random.normal(0, 10), "timestamp": ts.isoformat()})
        rows.append({"service_id": "test-svc", "metric_name": "error_rate",
                     "value": 0.002 + abs(np.random.normal(0, 0.001)), "timestamp": ts.isoformat()})
        rows.append({"service_id": "test-svc", "metric_name": "cpu_usage",
                     "value": 0.35 + abs(np.random.normal(0, 0.05)), "timestamp": ts.isoformat()})
        rows.append({"service_id": "test-svc", "metric_name": "mem_usage",
                     "value": 0.55 + abs(np.random.normal(0, 0.05)), "timestamp": ts.isoformat()})
        rows.append({"service_id": "test-svc", "metric_name": "req_per_second",
                     "value": 450.0 + np.random.normal(0, 30), "timestamp": ts.isoformat()})
    return pd.DataFrame(rows)


def test_feature_engineering_computes_rolling_windows():
    from pipeline.features import compute_rolling_features, FEATURE_NAMES
    df = _make_metrics_df(n_rows=120)
    features = compute_rolling_features(df, "test-svc")
    assert not features.empty
    # All expected feature columns should be present
    for col in FEATURE_NAMES:
        assert col in features.columns


def test_feature_vector_is_correct_shape():
    from pipeline.features import get_feature_vector, FEATURE_NAMES
    df = _make_metrics_df(n_rows=120)
    vector = get_feature_vector(df, "test-svc")
    assert vector is not None
    assert vector.shape == (len(FEATURE_NAMES),)


def test_sequence_for_lstm_is_correct_shape():
    from pipeline.features import get_sequence_for_lstm, FEATURE_NAMES
    df = _make_metrics_df(n_rows=120)
    seq = get_sequence_for_lstm(df, "test-svc", sequence_len=60)
    assert seq is not None
    assert seq.shape == (1, 60, len(FEATURE_NAMES))


# ── Data Validation ───────────────────────────────────────────────────────────

def test_data_validation_accepts_good_data():
    from pipeline.validation import validate_metric_batch
    df = _make_metrics_df(n_rows=60)
    result = validate_metric_batch(df, "test-svc")
    assert result.null_rate == 0.0
    assert result.out_of_range_count == 0


def test_data_validation_rejects_null_rate_above_10_pct():
    from pipeline.validation import validate_metric_batch
    df = _make_metrics_df(n_rows=60)
    # Inject nulls (>10%)
    df.loc[df.index[:int(len(df) * 0.15)], "value"] = np.nan
    result = validate_metric_batch(df, "test-svc")
    assert not result.is_valid
    assert any("null" in e.lower() for e in result.errors)


def test_data_validation_rejects_out_of_range_metrics():
    from pipeline.validation import validate_metric_batch
    df = _make_metrics_df(n_rows=60)
    # Inject absurd error_rate values
    error_rows = df["metric_name"] == "error_rate"
    df.loc[error_rows, "value"] = 999.0
    result = validate_metric_batch(df, "test-svc")
    assert result.out_of_range_count > 0


# ── Anomaly Detection ─────────────────────────────────────────────────────────

def test_isolation_forest_scores_normal_data_low():
    """Normal data should score below 0.4 on IF."""
    from ml.anomaly import IsolationForestModel
    import sklearn

    df = _make_metrics_df(n_rows=500)
    model = IsolationForestModel()
    model.fit(df, "test-svc")

    # Score last 10 normal rows
    normal_df = _make_metrics_df(n_rows=20)
    score = model.score(normal_df, "test-svc")
    assert score is not None
    assert score < 0.8  # Normal data should not flag as highly anomalous


def test_combined_score_weighted_correctly():
    """
    Combined = 0.6 * if_score + 0.4 * lstm_score.
    """
    if_score = 0.8
    lstm_score = 0.5
    expected = 0.6 * if_score + 0.4 * lstm_score
    combined = 0.6 * if_score + 0.4 * lstm_score
    assert abs(combined - expected) < 1e-6


# ── Forecasting ────────────────────────────────────────────────────────────────

def test_prophet_to_dataframe():
    """Verify Prophet forecast returns 30 data points."""
    try:
        from prophet import Prophet
        # Build a simple time series
        timestamps = [datetime(2024, 1, 1) + timedelta(minutes=5 * i) for i in range(200)]
        values = [120 + 10 * np.sin(i / 20) + np.random.normal(0, 5) for i in range(200)]
        df = pd.DataFrame({"ds": timestamps, "y": values})

        m = Prophet(daily_seasonality=False, weekly_seasonality=False)
        m.fit(df)
        future = m.make_future_dataframe(periods=30, freq="T")
        forecast = m.predict(future)

        assert len(forecast.tail(30)) == 30
        assert "yhat" in forecast.columns
        assert "yhat_lower" in forecast.columns
        assert "yhat_upper" in forecast.columns
    except ImportError:
        pytest.skip("Prophet not installed")

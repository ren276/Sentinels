"""
Prophet + ARIMA forecasting with champion/challenger comparison.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import Optional
import structlog

log = structlog.get_logger()


def compute_mae(actual: np.ndarray, predicted: np.ndarray) -> float:
    if len(actual) == 0 or len(predicted) == 0:
        return float("inf")
    n = min(len(actual), len(predicted))
    return float(np.mean(np.abs(actual[:n] - predicted[:n])))


def compute_rmse(actual: np.ndarray, predicted: np.ndarray) -> float:
    if len(actual) == 0 or len(predicted) == 0:
        return float("inf")
    n = min(len(actual), len(predicted))
    return float(np.sqrt(np.mean((actual[:n] - predicted[:n]) ** 2)))


# ─── Prophet ──────────────────────────────────────────────────────────────────

def train_prophet(
    df: pd.DataFrame,
    metric: str,
    service_id: str,
    run_mlflow: bool = True,
):
    """Train Prophet model. df must have columns: timestamp (or ds), metric column."""
    try:
        from prophet import Prophet
    except ImportError:
        log.warning("prophet.not_installed")
        return None, {}

    if metric not in df.columns and "metric_name" in df.columns:
        df = df[df["metric_name"] == metric].copy()
        df["y"] = df["value"]
        df["ds"] = pd.to_datetime(df["timestamp"])
    else:
        df = df.rename(columns={"timestamp": "ds", metric: "y"}).copy()
        df["ds"] = pd.to_datetime(df["ds"])

    df = df[["ds", "y"]].dropna().sort_values("ds")
    if len(df) < 10:
        log.warning("prophet.insufficient_data", rows=len(df))
        return None, {}

    # Split for holdout evaluation
    split = int(len(df) * 0.8)
    train_df = df.iloc[:split]
    test_df = df.iloc[split:]

    model = Prophet(
        changepoint_prior_scale=0.05,
        seasonality_prior_scale=10.0,
        holidays_prior_scale=10.0,
        daily_seasonality=True,
        weekly_seasonality=True,
        interval_width=0.95,
    )
    model.add_seasonality(name="hourly", period=1 / 24, fourier_order=8)
    model.fit(train_df)

    # Evaluate
    future = model.make_future_dataframe(periods=len(test_df), freq="min")
    forecast = model.predict(future)
    predicted = forecast["yhat"].values[-len(test_df):]
    mae = compute_mae(test_df["y"].values, predicted)
    rmse = compute_rmse(test_df["y"].values, predicted)

    # Retrain on full data
    model.fit(df)

    run_id = None
    if run_mlflow:
        try:
            import mlflow
            with mlflow.start_run() as run:
                mlflow.log_params({
                    "model_type": "prophet",
                    "service_id": service_id,
                    "metric": metric,
                    "changepoint_prior": 0.05,
                    "training_samples": len(df),
                })
                mlflow.log_metrics({"mae": mae, "rmse": rmse})
                mlflow.set_tag("model_type", "prophet")
                mlflow.set_tag("service_id", service_id)
                mlflow.set_tag("is_champion", "false")
                run_id = run.info.run_id
        except Exception as exc:
            log.warning("mlflow.log_failed", model="prophet", error=str(exc))

    return model, {"mae": mae, "rmse": rmse, "run_id": run_id}


def forecast_prophet(model, horizon_minutes: int = 30) -> pd.DataFrame:
    """Generate forecast dataframe with yhat, lower, upper."""
    if model is None:
        return pd.DataFrame()
    future = model.make_future_dataframe(periods=horizon_minutes, freq="min")
    forecast = model.predict(future)
    return forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(horizon_minutes)


# ─── ARIMA ────────────────────────────────────────────────────────────────────

def train_arima(
    series: pd.Series,
    service_id: str,
    metric: str,
    run_mlflow: bool = True,
):
    """Train ARIMA with grid search for optimal (p,d,q)."""
    try:
        from statsmodels.tsa.arima.model import ARIMA
        from statsmodels.tsa.stattools import adfuller
    except ImportError:
        log.warning("statsmodels.not_installed")
        return None, {}

    series = series.dropna()
    if len(series) < 20:
        return None, {}

    # Check stationarity
    try:
        adf_result = adfuller(series)
        d = 0 if adf_result[1] < 0.05 else 1
    except Exception:
        d = 1

    # Grid search for best p,q
    best_aic = float("inf")
    best_order = (1, d, 1)
    for p in range(0, 4):
        for q in range(0, 4):
            try:
                result = ARIMA(series, order=(p, d, q)).fit()
                if result.aic < best_aic:
                    best_aic = result.aic
                    best_order = (p, d, q)
            except Exception:
                continue

    # Split for evaluation
    split = int(len(series) * 0.8)
    train_series = series.iloc[:split]
    test_series = series.iloc[split:]

    final_model = ARIMA(train_series, order=best_order).fit()
    predicted = final_model.forecast(steps=len(test_series))
    mae = compute_mae(test_series.values, predicted.values)

    # Retrain on full
    final_model_full = ARIMA(series, order=best_order).fit()

    run_id = None
    if run_mlflow:
        try:
            import mlflow
            with mlflow.start_run() as run:
                mlflow.log_params({
                    "model_type": "arima",
                    "order": str(best_order),
                    "service_id": service_id,
                    "metric": metric,
                    "training_samples": len(series),
                })
                mlflow.log_metrics({"mae": mae, "aic": best_aic})
                mlflow.set_tag("model_type", "arima")
                mlflow.set_tag("service_id", service_id)
                mlflow.set_tag("is_champion", "false")
                run_id = run.info.run_id
        except Exception as exc:
            log.warning("mlflow.log_failed", model="arima", error=str(exc))

    return final_model_full, {"mae": mae, "aic": best_aic, "order": str(best_order), "run_id": run_id}


def forecast_arima(model, horizon_minutes: int = 30) -> pd.DataFrame:
    """Generate forecast from ARIMA model."""
    if model is None:
        return pd.DataFrame()
    try:
        pred = model.forecast(steps=horizon_minutes)
        conf = model.get_forecast(steps=horizon_minutes).conf_int()
        return pd.DataFrame({
            "yhat": pred.values,
            "yhat_lower": conf.iloc[:, 0].values,
            "yhat_upper": conf.iloc[:, 1].values,
        })
    except Exception:
        return pd.DataFrame()


# ─── Champion selection ───────────────────────────────────────────────────────

def select_champion_prophet_arima(
    prophet_metrics: dict,
    arima_metrics: dict,
) -> str:
    """Return 'prophet' or 'arima' based on lower MAE."""
    prophet_mae = prophet_metrics.get("mae", float("inf"))
    arima_mae = arima_metrics.get("mae", float("inf"))
    return "prophet" if prophet_mae <= arima_mae else "arima"

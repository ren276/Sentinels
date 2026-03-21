"""
Data quality validation before model inference.
Catches bad data before it corrupts ML model outputs.
"""
from datetime import datetime, timezone

import pandas as pd
import structlog
from pydantic import BaseModel

log = structlog.get_logger()

EXPECTED_RANGES = {
    "p95_latency_ms": (0, 30_000),
    "p50_latency_ms": (0, 15_000),
    "error_rate": (0, 1.0),
    "cpu_usage": (0, 1.0),
    "mem_usage": (0, 1.0),
    "req_per_second": (0, 1_000_000),
}


class MetricValidationResult(BaseModel):
    is_valid: bool
    errors: list[str]
    warnings: list[str]
    null_rate: float
    out_of_range_count: int


def validate_metric_batch(
    df: pd.DataFrame,
    service_id: str,
) -> MetricValidationResult:
    """
    Validate a batch of metrics before ML inference.
    Returns validation result with error list.
    """
    errors: list[str] = []
    warnings: list[str] = []
    out_of_range = 0

    if df.empty:
        return MetricValidationResult(
            is_valid=False,
            errors=["DataFrame is empty"],
            warnings=[],
            null_rate=1.0,
            out_of_range_count=0,
        )

    # Use "value" column if present, else flatten
    if "value" in df.columns:
        null_rate = float(df["value"].isna().mean())
        data_col = "value"
    else:
        null_rate = float(df.isna().values.mean())
        data_col = None

    # Null check
    if null_rate > 0.1:
        errors.append(f"High null rate: {null_rate:.1%} of values are null")
    elif null_rate > 0.05:
        warnings.append(f"Elevated null rate: {null_rate:.1%}")

    # Range check (only for long-form DataFrames)
    if "metric_name" in df.columns and "value" in df.columns:
        for metric, (min_val, max_val) in EXPECTED_RANGES.items():
            metric_data = df[df["metric_name"] == metric]["value"]
            if len(metric_data) == 0:
                continue
            violations = metric_data[
                (metric_data < min_val) | (metric_data > max_val)
            ]
            if len(violations) > 0:
                out_of_range += len(violations)
                warnings.append(
                    f"{metric}: {len(violations)} values out of "
                    f"range [{min_val}, {max_val}]"
                )

    # Duplicate timestamp check
    if "timestamp" in df.columns and "metric_name" in df.columns:
        subset = ["metric_name", "timestamp"]
        if "service_id" in df.columns:
            subset = ["service_id"] + subset
        dupes = df.duplicated(subset=subset).sum()
        if dupes > 0:
            warnings.append(f"{dupes} duplicate timestamps found")

    # Stale data check (no data in last 5 minutes)
    if "timestamp" in df.columns and len(df) > 0:
        try:
            latest = pd.to_datetime(df["timestamp"]).max()
            if latest.tzinfo is None:
                latest = latest.tz_localize("UTC")
            else:
                latest = latest.tz_convert("UTC")
            age_minutes = (
                datetime.now(timezone.utc) - latest.to_pydatetime()
            ).total_seconds() / 60
            if age_minutes > 15:
                errors.append(
                    f"Stale data: last metric {age_minutes:.0f} min ago"
                )
        except Exception:
            pass  # Timestamp parsing failed, not critical

    is_valid = len(errors) == 0

    if not is_valid:
        log.warning(
            "data.validation.failed",
            service_id=service_id,
            errors=errors,
            warnings=warnings,
        )

    # Track prometheus counter if available
    try:
        from observability.metrics import validation_failures_total
        if not is_valid:
            reason = errors[0][:50] if errors else "unknown"
            validation_failures_total.labels(
                service_id=service_id, reason=reason
            ).inc()
    except Exception:
        pass

    return MetricValidationResult(
        is_valid=is_valid,
        errors=errors,
        warnings=warnings,
        null_rate=null_rate,
        out_of_range_count=out_of_range,
    )

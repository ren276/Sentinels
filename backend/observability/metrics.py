"""
Prometheus metrics for Sentinel self-observability.
'Who monitors the monitor?' — we do.
"""
from prometheus_client import Counter, Histogram, Gauge
from prometheus_fastapi_instrumentator import Instrumentator

# ─── Custom metrics ───────────────────────────────────────────────────────────

anomaly_detections_total = Counter(
    "sentinel_anomaly_detections_total",
    "Total anomaly detections",
    ["service_id", "model_type", "severity"],
)

model_inference_duration = Histogram(
    "sentinel_model_inference_seconds",
    "Model inference latency",
    ["model_type", "service_id"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)

active_incidents_gauge = Gauge(
    "sentinel_active_incidents",
    "Current number of active incidents",
    ["severity"],
)

ws_connections_gauge = Gauge(
    "sentinel_websocket_connections",
    "Current WebSocket connections",
)

rca_generations_total = Counter(
    "sentinel_rca_generations_total",
    "Total RCA generation requests",
    ["status"],  # success | error | ollama_unavailable
)

ollama_response_duration = Histogram(
    "sentinel_ollama_response_seconds",
    "Ollama response time for RCA generation",
    buckets=[1, 5, 10, 30, 60, 120],
)

kafka_messages_total = Counter(
    "sentinel_kafka_messages_total",
    "Kafka messages processed",
    ["topic", "status"],
)

validation_failures_total = Counter(
    "sentinel_validation_failures_total",
    "Metric validation failures",
    ["service_id", "reason"],
)


def setup_prometheus(app) -> None:
    """Instrument the FastAPI app with Prometheus metrics."""
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")

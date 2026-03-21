# ADR 001: FastAPI for Backend Services

## Status
Accepted

## Context
Sentinel requires high-throughput metric ingestion and the ability to serve REST APIs while maintaining background WebSocket connections for streaming RCA data. Python is a hard requirement due to the Machine Learning ecosystem (scikit-learn, MLflow, TensorFlow, Prophet).

## Decision
We chose FastAPI over Flask or Django.
FastAPI features native `asyncio` support which allows non-blocking I/O for database and Redis calls. It also uses Pydantic for validation, which natively generates OpenAPI schemas.

## Consequences
- **Positive**: We can handle 10,000+ RPS on a small cluster, integrating natively with async Kafka drivers (`aiokafka`).
- **Negative**: Certain ML libraries (e.g., `scikit-learn` predict functions) are synchronous and block the event loop. We must wrap these calls in `run_in_executor(None, ml_task)` to prevent starvation of the WebSocket router.

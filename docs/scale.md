# Sentinel Scale Capacity & Reasoning

This document outlines the calculated system constraints, scaling techniques, and hardware requirements for Sentinel. It aims to answer technical questions in an architectural review context.

## 1. Metrics Ingestion Limits
- **Goal**: ~10,000 metrics per second reliably.
- **Bottleneck 1: HTTP API vs Kafka.** FastAPI handles ~2,000 req/sec on a single uvicorn worker. With 4 workers on a modern core, that reaches ~8,000 req/sec. However, raw database inserts block.
- **Solution**. We use Kafka as a buffer (`sentinel.metrics` topic). Telegraf/Prometheus sends telemetry straight to Kafka. Our background `collector.py` consumes batches of 500 metrics every second, doing bulk inserts via SQLAlchemy `insert().values()`.
- **Hardware Profile (Ingestion)**: 2 CPU cores, 4GB RAM per python consumer pod.

## 2. ML Anomaly Detection Latency
- **Goal**: Score new metric vectors in under 100ms.
- **Constraint**: `IsolationForest` inference in Python can be slow. LSTM autoencoder inference via `tensorflow` blocks the async event loop `uvloop`.
- **Solution**. We use `run_in_executor(None, ml_task)`. This offloads CPU-bound operations (ML predicting) to a separate ThreadPool / ProcessPool so that FastAPI can continue serving REST traffic without freezing.
- **Scale limitations:** Currently, feature windows are calculated dynamically. The backend must query the last 15 minutes of Redis data per score. **Next Iteration**: In-memory streaming feature store (e.g. Flink). 

## 3. Database Volume
- **Constraint**: 100 services * 4 metrics * 1 per min = 576,000 rows/day. 30 days = 17.2 million rows.
- **Solution**. `metrics` table utilizes an index on `(service_id, metric_name, timestamp)`. For production scale, it should be migrated to PostgreSQL TimescaleDB for chunk-based retention and continuous aggregates. 
- **APScheduler** job trims raw data older than `RETENTION_DAYS` (default 7 days) hourly.

## 4. Runbook / Alert Throttling
- **Problem**: Alert Fatigue resulting from cascading microservice failures.
- **Solution**: Multi-tier Redis locking (`redis.setnex`). High severity alerts set a lock key `alert:critical:{service_id}` for 15 minutes. Even if new anomalies stream in, they are grouped under the ongoing Incident instead of spamming emails.

## 5. Streaming Root Cause Analysis
- **Constraint**: Ollama running locally requires substantial VRAM (~2-3 GB for Llama 3.2 3B). 
- **Solution**: Sentinel treats LLMs as scarce resource locks. The backend holds an `asyncio.Lock()` around RCA tasks. It parses the Ollama streaming API (`requests.post(stream=True)`) reading chunk by chunk, and pushes those chunks down to the client via `FastAPI WebSocketManager`.

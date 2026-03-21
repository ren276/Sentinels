# Sentinel Implementation Plan

## Goal Description
Build "Sentinel" — a production-ready AI System Monitoring Platform from scratch. The project must be portfolio-quality and prioritize correctness, security, observability, scale reasoning, and excellent UI. It features an anomaly detection pipeline using Isolation Forest and LSTM Autoencoders, forecasting via Prophet and ARIMA, and root cause analysis powered by Ollama. 

## Proposed Changes

---
### Backend Framework & Configuration
Setting up the core FastAPI application, dependency injection, and application lifecycles.

#### [NEW] [config.py](file:///e:/Sentinels/backend/api/config.py)
Application configuration using `pydantic-settings`.
#### [NEW] [main.py](file:///e:/Sentinels/backend/api/main.py)
FastAPI application with 30+ endpoints, lifespan events, and the strict RCA background task pattern without `BackgroundTasks`.
#### [NEW] [database.py](file:///e:/Sentinels/backend/api/database.py)
Plain PostgreSQL schema definition and SQLAlchemy async helper functions.
#### [NEW] [security.py](file:///e:/Sentinels/backend/api/security.py)
Authentication, JWT generation, password hashing, and RBAC middleware.
#### [NEW] [websocket_manager.py](file:///e:/Sentinels/backend/api/websocket_manager.py)
WebSocket connection manager for real-time frontend updates.
#### [NEW] [scheduler.py](file:///e:/Sentinels/backend/api/scheduler.py)
APScheduler configuration for background jobs (anomaly detection, training, data retention).
#### [NEW] [seed.py](file:///e:/Sentinels/backend/api/seed.py)
Generation and insertion of realistic mock metric/anomaly data for development.

---
### Machine Learning Pipeline
Implementation of models and model management.

#### [NEW] [anomaly.py](file:///e:/Sentinels/backend/ml/anomaly.py)
Combined Isolation Forest and LSTM Autoencoder anomaly detection.
#### [NEW] [forecast.py](file:///e:/Sentinels/backend/ml/forecast.py)
Time-series forecasting with Prophet and ARIMA, including champion selection.
#### [NEW] [rca.py](file:///e:/Sentinels/backend/ml/rca.py)
Root Cause Analysis using locally-hosted Ollama (`llama3.2:3b`) with token streaming.
#### [NEW] [graph.py](file:///e:/Sentinels/backend/ml/graph.py)
Dependency graph and blast-radius analysis via NetworkX.
#### [NEW] [registry.py](file:///e:/Sentinels/backend/ml/registry.py)
Integration with MLflow for tracking experiments and promoting champion models.
#### [NEW] [features.py](file:///e:/Sentinels/backend/pipeline/features.py)
Feature engineering for latency percentiles and error rates.
#### [NEW] [validation.py](file:///e:/Sentinels/backend/pipeline/validation.py)
Data quality checks ensuring model robustness.

---
### Observability & Alerting
System tracking and incident routing.

#### [NEW] [metrics.py](file:///e:/Sentinels/backend/observability/metrics.py)
Custom Prometheus metrics (e.g., Inference duration, active incidents).
#### [NEW] [tracing.py](file:///e:/Sentinels/backend/observability/tracing.py)
OpenTelemetry tracing and Jaeger exporter setup.
#### [NEW] [router.py](file:///e:/Sentinels/backend/alerting/router.py)
Alert routing, Slack/Email integration, and automated runbook execution.

---
### Frontend Application
Next.js UI implementation with strict aesthetic guidelines.

#### [NEW] [app/layout.tsx](file:///e:/Sentinels/frontend/app/layout.tsx)
Root layout containing the Custom Cursor, Command Palette, and Sidebar.
#### [NEW] [globals.css](file:///e:/Sentinels/frontend/src/styles/globals.css)
Dark industrial CSS variables and animations.
#### [NEW] [page.tsx](file:///e:/Sentinels/frontend/app/page.tsx)
Dashboard overview with service grid and hero metrics.
#### [NEW] [services/[id]/page.tsx](file:///e:/Sentinels/frontend/app/services/[id]/page.tsx)
Service detail view featuring customized Recharts visualizations.
#### [NEW] [incidents/page.tsx](file:///e:/Sentinels/frontend/app/incidents/page.tsx)
Incident management with streaming RCA panel and runbook execution.
#### [NEW] [forecasts/page.tsx](file:///e:/Sentinels/frontend/app/forecasts/page.tsx)
Forecast timeline showing predicted constraint breaches.

## Verification Plan
1. **Automated Tests**: Execute `pytest` across the backend and run Vitest for frontend components using the provided `test.ps1` script.
2. **End-to-End Validation**: Populate the database with `seed.ps1`, then trigger the anomaly detection jobs to verify the IF+LSTM models score correctly.
3. **LLM Verification**: Provide an active incident to the RCA generator and ensure Ollama (`llama3.2:3b`) correctly streams the token responses back to the frontend without any HTTP 422 errors.
4. **Manual UI Testing**: Launch the frontend and confirm the Custom Cursor, Framer Motion animations, Recharts styling, and overall dark aesthetic render as intended.

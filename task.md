# Sentinel Platform — Build Checklist

## Phase 1 — Project Scaffold & Backend Foundation
- [ ] Step 1: Project scaffold (folders, .gitignore, scripts/install.ps1)
- [ ] Step 2: backend/api/config.py
- [ ] Step 3: backend/api/security.py
- [ ] Step 4: Database schema (SQLAlchemy models, plain PostgreSQL)
- [ ] Step 5: backend/api/main.py (all endpoints, lifespan, middleware)
- [ ] Step 6: backend/observability/metrics.py (Prometheus)
- [ ] Step 7: backend/observability/tracing.py (OpenTelemetry + Jaeger)
- [ ] Step 8: backend/ml/anomaly.py (Isolation Forest + LSTM AE)
- [ ] Step 9: backend/ml/forecast.py (Prophet + ARIMA)
- [ ] Step 10: backend/ml/rca.py (Ollama llama3.2:3b streaming)
- [ ] Step 11: backend/ml/graph.py (NetworkX dependency graph)
- [ ] Step 12: backend/ml/registry.py (MLflow model registry)
- [ ] Step 13: backend/pipeline/features.py (feature engineering)
- [ ] Step 14: backend/pipeline/validation.py (data quality)
- [ ] Step 15: backend/alerting/router.py (alert routing + runbooks)
- [ ] Step 16: backend/api/seed.py (realistic seed data + model training)
- [ ] Step 17: backend/api/scheduler.py (APScheduler jobs)
- [ ] Step 18: backend/api/websocket_manager.py (WebSocket manager)
- [ ] Step 19: backend/api/services.py (service layer functions)
- [ ] Step 20: backend/tests/ (conftest, test_api, test_security, test_ml)
- [ ] Step 21: backend/pyproject.toml + Dockerfile + .env.example

## Phase 2 — Frontend
- [x] Step 22: Next.js init + all deps (shadcn, framer, recharts, etc.)
- [x] Step 23: src/styles/globals.css (CSS vars, cursor:none, @keyframes)
- [x] Step 24: src/lib/animations.ts + src/lib/utils.ts
- [x] Step 25: src/types/index.ts (all TypeScript types)
- [x] Step 26: src/store/ (authStore, cursorStore, wsStore, uiStore)
- [x] Step 27: src/lib/api.ts (axios + interceptors)
- [x] Step 28: src/hooks/ (useReducedMotion, useWebSocket, useCounterAnimation, useCommandPalette, useInView)
- [x] Step 29: CustomCursor component
- [x] Step 30: Sidebar + CommandPalette + PageTransition layout components
- [x] Step 31: app/layout.tsx (root layout)
- [x] Step 32: middleware.ts (route protection)
- [x] Step 33: app/login/page.tsx + Next.js API routes (auth)
- [x] Step 34: app/page.tsx (Overview)
- [x] Step 35: Components — ServiceCard, HealthDot, AnomalyScoreBar, SparklineChart
- [x] Step 36: app/services/[id]/page.tsx (Service detail)
- [x] Step 37: Components — IncidentList, IncidentDetail, RcaPanel, RunbookPanel, ServiceGraph
- [x] Step 38: app/incidents/page.tsx (Incidents)
- [x] Step 39: Components — ForecastCard, ForecastChart
- [x] Step 40: app/forecasts/page.tsx (Forecasts)
- [x] Step 41: app/settings/page.tsx (Settings — all tabs)
- [x] Step 42: app/ml/page.tsx (ML Models — admin only)
- [ ] Step 43: next.config.ts + tailwind.config.ts + tsconfig.json
- [ ] Step 44: frontend/Dockerfile + .env.local.example
- [ ] Step 45: Frontend tests (Vitest + RTL)

## Phase 3 — Infrastructure & Scripts
- [x] Step 46: infra/docker-compose.yml (postgres, redis, kafka, jaeger, grafana, prometheus)
- [x] Step 47: infra/prometheus.yml
- [x] Step 48: infra/grafana/sentinel-dashboard.json
- [x] Step 49: All scripts/ (dev.ps1, dev-backend.ps1, dev-frontend.ps1, dev-mlflow.ps1, install.ps1, test.ps1, seed.ps1, train.ps1, chaos.ps1, ollama-check.ps1)
- [x] Step 50: .github/workflows/ (backend.yml, frontend.yml)

## Phase 4 — Docs
- [x] Step 51: docs/architecture.md (mermaid diagrams)
- [x] Step 52: docs/ml-models.md (model cards)
- [x] Step 53: docs/api.md (API usage examples)
- [x] Step 54: docs/runbook.md (incident response runbooks)
- [x] Step 55: docs/scale.md (capacity + scale reasoning)
- [x] Step 56: docs/adr/ (all 5 ADRs)

## Phase 5 — README
- [x] Step 57: README.md (full project README)

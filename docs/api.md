# Sentinel API Documentation

The Sentinel API is built with FastAPI and is accessible at `/api/v1`.
All interactive docs (Swagger) can be found at `http://localhost:8000/docs` when running locally.

## Authentication
Sentinel uses HTTP Bearer JWTs.

```bash
# Login
curl -X POST "http://localhost:8000/api/v1/auth/login" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=AdminPassword123!"

# Output:
# {"access_token": "ey...", "refresh_token": "ey...", "token_type": "bearer"}
```

## Telemetry Ingestion
If `KAFKA_ENABLED=false`, you can send metrics directly via REST.

```bash
curl -X POST "http://localhost:8000/api/v1/ingestion/metrics" \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{
       "service_id": "auth-service",
       "metrics": {
         "cpu_usage": 0.45,
         "mem_usage": 0.60,
         "p95_latency_ms": 124.5,
         "error_rate": 0.001
       },
       "timestamp": "2023-10-15T12:00:00Z"
     }'
```

## Triggering RCA
Requires an active incident ID.

```bash
curl -X POST "http://localhost:8000/api/v1/incidents/INC-12345/rca/generate" \
     -H "Authorization: Bearer <token>"
```
*Note: This kicks off an async BackgroundTask. Clients should subscribe to WebSockets (`ws://localhost:8000/api/v1/ws`) and listen for `rca_update` events.*

import asyncio
import time
from datetime import datetime, timezone
import psutil
import httpx
try:
    import docker
except ImportError:
    docker = None
from sqlalchemy import text
from api.config import settings
from api.database import AsyncSessionLocal
import redis.asyncio as aioredis
import structlog

log = structlog.get_logger()

async def ensure_service_exists(session, service_id: str, name: str, environment: str = "production", tags: dict = None) -> None:
    import json
    tags_json = json.dumps(tags or {})
    await session.execute(
        text("""
            INSERT INTO services (service_id, name, environment, tags)
            VALUES (:sid, :name, :env, CAST(:tags AS jsonb))
            ON CONFLICT (service_id) DO NOTHING
        """),
        {"sid": service_id, "name": name, "env": environment, "tags": tags_json}
    )

async def write_metrics_batch_session(session, service_id: str, metrics: dict, timestamp: datetime) -> None:
    for metric_name, value in metrics.items():
        if value is None:
            continue
        await session.execute(
            text("""
                INSERT INTO metrics (service_id, metric_name, value, timestamp)
                VALUES (:sid, :mname, :val, :ts)
            """),
            {"sid": service_id, "mname": metric_name, "val": float(value), "ts": timestamp}
        )

async def write_metrics_batch(service_id: str, metrics: dict, timestamp: datetime) -> None:
    async with AsyncSessionLocal() as session:
        for metric_name, value in metrics.items():
            if value is None:
                continue
            await session.execute(
                text("""
                    INSERT INTO metrics (service_id, metric_name, value, timestamp)
                    VALUES (:sid, :mname, :val, :ts)
                """),
                {"sid": service_id, "mname": metric_name, "val": float(value), "ts": timestamp}
            )
        await session.commit()

async def get_custom_http_services() -> list[dict]:
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                text("SELECT service_id, name, url, expected_status_code, timeout_seconds FROM monitored_urls WHERE is_active = TRUE")
            )
            return [dict(row) for row in result.mappings().all()]
        except Exception:
            return []

async def collect_system_metrics() -> dict:
    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()
    return {
        "cpu_usage": cpu / 100,
        "mem_usage": mem.percent / 100,
        "mem_available_gb": round(mem.available / (1024**3), 2),
        "disk_usage": disk.percent / 100,
        "disk_free_gb": round(disk.free / (1024**3), 2),
        "net_bytes_sent": net.bytes_sent,
        "net_bytes_recv": net.bytes_recv,
    }

async def collect_http_metrics(service_id: str, url: str, expected_status: int = 200, timeout_seconds: int = 5) -> dict:
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.get(url)
        latency_ms = (time.monotonic() - start) * 1000
        is_up = resp.status_code == expected_status or (resp.status_code < 300 and expected_status < 300)
        return {
            "p95_latency_ms": latency_ms,
            "error_rate": 0.0 if resp.status_code < 400 else 1.0,
            "status_code": resp.status_code,
            "is_up": float(is_up),
        }
    except Exception as exc:
        latency_ms = (time.monotonic() - start) * 1000
        log.warning("http.check.failed", service_id=service_id, url=url, error=str(exc))
        return {
            "p95_latency_ms": latency_ms,
            "error_rate": 1.0,
            "status_code": 0,
            "is_up": 0.0,
        }

async def collect_redis_metrics() -> dict:
    try:
        redis = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
        info = await redis.info()
        await redis.aclose()
        maxmemory = info.get("maxmemory", 0)
        used_memory = info.get("used_memory", 0)
        mem_usage = (used_memory / maxmemory) if maxmemory > 0 else (used_memory / (100 * 1024 * 1024))
        keyspace_hits = info.get("keyspace_hits", 0)
        keyspace_misses = info.get("keyspace_misses", 0)
        hit_rate = keyspace_hits / max(keyspace_hits + keyspace_misses, 1)
        return {
            "mem_usage": mem_usage,
            "connected_clients": info.get("connected_clients", 0),
            "ops_per_sec": float(info.get("instantaneous_ops_per_sec", 0)),
            "hit_rate": float(hit_rate),
            "error_rate": 0.0,
            "is_up": 1.0,
        }
    except Exception:
        return {"error_rate": 1.0, "is_up": 0.0, "mem_usage": 0.0}

async def collect_postgres_metrics() -> dict:
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT
                      count(*) as connections,
                      count(*) filter (where state = 'active') as active_connections
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                """)
            )
            row = result.fetchone()
            
            result2 = await session.execute(
                text("""
                    SELECT
                      blks_hit, blks_read, xact_commit, xact_rollback
                    FROM pg_stat_database
                    WHERE datname = current_database()
                """)
            )
            db_stats = result2.fetchone()

        active_connections = row.active_connections or 0
        blks_hit = db_stats.blks_hit or 0
        blks_read = db_stats.blks_read or 0
        xact_rollback = db_stats.xact_rollback or 0
        xact_commit = db_stats.xact_commit or 0

        total_blks = blks_hit + blks_read
        cache_hit_rate = (blks_hit / total_blks) if total_blks > 0 else 1.0
        rollback_rate = xact_rollback / max(xact_commit + xact_rollback, 1)

        return {
            "connections": row.connections or 0,
            "active_connections": active_connections,
            "cache_hit_rate": float(cache_hit_rate),
            "error_rate": float(rollback_rate),
            "is_up": 1.0,
            "cpu_usage": min(active_connections / 100.0, 1.0),
        }
    except Exception:
        return {"error_rate": 1.0, "is_up": 0.0}

async def collect_docker_metrics() -> list[dict]:
    if not docker:
        return []
    try:
        client = docker.from_env()
        containers = client.containers.list()
        metrics = []
        for container in containers:
            try:
                stats = container.stats(stream=False)
                cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - stats["precpu_stats"]["cpu_usage"]["total_usage"]
                sys_delta = stats["cpu_stats"]["system_cpu_usage"] - stats.get("precpu_stats", {}).get("system_cpu_usage", 0)
                cpu_pct = 0.0
                if sys_delta > 0.0 and cpu_delta > 0.0:
                    cpu_pct = (cpu_delta / sys_delta) * len(stats["cpu_stats"]["cpu_usage"].get("percpu_usage", [1]))
                mem = stats["memory_stats"]
                mem_pct = (mem["usage"] / mem["limit"]) if mem.get("limit") else 0.0
                
                service_id = f"docker-{container.name}"
                metrics.append({
                    "service_id": service_id,
                    "name": container.name,
                    "cpu_usage": float(cpu_pct),
                    "mem_usage": float(mem_pct),
                    "error_rate": 0.0 if container.status == "running" else 1.0,
                    "is_up": 1.0 if container.status == "running" else 0.0,
                })
            except Exception:
                continue
        return metrics
    except Exception as exc:
        log.warning("docker.collection.failed", error=str(exc))
        return []

async def real_metrics_collection_job() -> None:
    now = datetime.now(timezone.utc)
    
    # 1. Parallel metric collection
    try:
        results = await asyncio.wait_for(asyncio.gather(
            collect_system_metrics(),
            collect_http_metrics("sentinel-api", "http://127.0.0.1:8000/health"),
            collect_redis_metrics(),
            collect_postgres_metrics(),
            collect_docker_metrics(),
            get_custom_http_services(),
        ), timeout=8.0)
        
        sys_m, api_m, redis_m, pg_m, docker_results, custom_services = results
    except Exception as exc:
        log.error("real_metrics.gather_failed", error=str(exc))
        return

    # 2. Parallel custom service checks
    custom_results = []
    if custom_services:
        try:
            custom_results = await asyncio.wait_for(asyncio.gather(*[
                collect_http_metrics(
                    svc["service_id"], svc["url"], 
                    svc.get("expected_status_code", 200), 
                    svc.get("timeout_seconds", 5)
                ) for svc in custom_services
            ]), timeout=5.0)
        except Exception as exc:
            log.warning("real_metrics.custom_failed", error=str(exc))

    # 3. Batch persistence
    async with AsyncSessionLocal() as session:
        try:
            # Main services
            for sid, name, env, m in [
                ("system-host", "Host System", "system", sys_m),
                ("sentinel-api", "Sentinel API", "self", api_m),
                ("redis-local", "Redis", "redis", redis_m),
                ("postgres-local", "PostgreSQL", "postgres", pg_m),
            ]:
                await ensure_service_exists(session, sid, name, env)
                await write_metrics_batch_session(session, sid, m, now)

            # Custom & Docker
            for i, svc in enumerate(custom_services):
                if i < len(custom_results):
                    await ensure_service_exists(session, svc["service_id"], svc["name"], "http")
                    await write_metrics_batch_session(session, svc["service_id"], custom_results[i], now)

            for m in docker_results:
                sid = m.pop("service_id")
                name = m.pop("name", "container")
                await ensure_service_exists(session, sid, name, "docker")
                await write_metrics_batch_session(session, sid, m, now)

            await session.commit()
            log.info("real_metrics.collected", services=4 + len(custom_results) + len(docker_results))
        except Exception as exc:
            await session.rollback()
            log.error("real_metrics.save_failed", error=str(exc))

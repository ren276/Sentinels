"""
Kafka producer/consumer for metric ingestion.
KAFKA_ENABLED=false by default. Uses MockCollector when disabled.
"""
import asyncio
import json
from datetime import datetime, timezone

import structlog

log = structlog.get_logger()

METRICS_TOPIC = "sentinel.metrics"
ANOMALIES_TOPIC = "sentinel.anomalies"


async def get_collector():
    """Factory: return real or mock collector based on KAFKA_ENABLED."""
    from api.config import settings
    if settings.KAFKA_ENABLED:
        return KafkaCollector()
    return MockCollector()


class MockCollector:
    """Local in-memory collector used when Kafka is disabled."""

    async def produce_metric(
        self,
        service_id: str,
        metric_name: str,
        value: float,
        timestamp: datetime | None = None,
    ) -> None:
        ts = timestamp or datetime.now(timezone.utc)
        pass

    async def close(self) -> None:
        pass


class KafkaCollector:
    """
    Kafka producer/consumer for metric ingestion.
    Uses confluentinc/cp-kafka:7.6.0.
    """

    def __init__(self) -> None:
        from api.config import settings
        self._bootstrap = settings.KAFKA_BOOTSTRAP_SERVERS
        self._use_sasl = settings.KAFKA_USE_SASL
        self._username = settings.KAFKA_USERNAME
        self._password = settings.KAFKA_PASSWORD
        self._producer = None

    def _make_producer_config(self) -> dict:
        config = {"bootstrap_servers": self._bootstrap}
        if self._use_sasl:
            config.update({
                "security_protocol": "SASL_SSL",
                "sasl_mechanism": "PLAIN",
                "sasl_plain_username": self._username,
                "sasl_plain_password": self._password,
            })
        return config

    async def produce_metric(
        self,
        service_id: str,
        metric_name: str,
        value: float,
        timestamp: datetime | None = None,
    ) -> None:
        try:
            from kafka import KafkaProducer
            if self._producer is None:
                self._producer = KafkaProducer(
                    **self._make_producer_config(),
                    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                )

            ts = timestamp or datetime.now(timezone.utc)
            payload = {
                "service_id": service_id,
                "metric_name": metric_name,
                "value": value,
                "timestamp": ts.isoformat(),
            }
            self._producer.send(METRICS_TOPIC, value=payload)

            try:
                from observability.metrics import kafka_messages_total
                kafka_messages_total.labels(
                    topic=METRICS_TOPIC, status="success"
                ).inc()
            except Exception:
                pass

        except Exception as exc:
            log.error(
                "kafka.produce_failed",
                service_id=service_id,
                metric=metric_name,
                error=str(exc),
            )
            try:
                from observability.metrics import kafka_messages_total
                kafka_messages_total.labels(
                    topic=METRICS_TOPIC, status="error"
                ).inc()
            except Exception:
                pass

    async def close(self) -> None:
        if self._producer:
            self._producer.close()
            self._producer = None

"""
OpenTelemetry distributed tracing with Jaeger export.
"""
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from api.config import settings

import structlog
log = structlog.get_logger()


def setup_tracing(app) -> None:
    """Setup OpenTelemetry with Jaeger exporter."""
    try:
        from opentelemetry.exporter.jaeger.thrift import JaegerExporter
        exporter = JaegerExporter(
            agent_host_name=settings.JAEGER_HOST,
            agent_port=settings.JAEGER_PORT,
        )
        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app)

        # Auto-instrument SQLAlchemy and Redis
        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
            SQLAlchemyInstrumentor().instrument()
        except Exception:
            pass
        try:
            from opentelemetry.instrumentation.redis import RedisInstrumentor
            RedisInstrumentor().instrument()
        except Exception:
            pass

        log.info("tracing.initialized", jaeger=f"{settings.JAEGER_HOST}:{settings.JAEGER_PORT}")
    except Exception as exc:
        log.warning("tracing.setup_failed", error=str(exc))


# Global tracer
tracer = trace.get_tracer("sentinel")

"""
NetworkX dependency graph for service blast radius analysis.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

import networkx as nx


def build_dependency_graph(trace_spans: list[dict]) -> nx.DiGraph:
    """Build directed dependency graph from trace spans."""
    G = nx.DiGraph()
    for span in trace_spans:
        G.add_edge(
            span["parent_service"],
            span["child_service"],
            avg_latency_ms=span.get("avg_latency_ms", 0),
            error_rate=span.get("error_rate", 0),
            call_count=span.get("call_count", 0),
        )
    return G


def find_blast_radius(G: nx.DiGraph, anomalous_service: str) -> dict:
    """Identify what services are affected by this service's failure."""
    if anomalous_service not in G:
        return {"upstream": [], "downstream": [], "total_affected": 0}
    upstream = list(nx.ancestors(G, anomalous_service))
    downstream = list(nx.descendants(G, anomalous_service))
    return {
        "upstream": upstream,
        "downstream": downstream,
        "total_affected": len(upstream) + len(downstream),
    }


def find_most_likely_origin(
    G: nx.DiGraph,
    anomalous_service: str,
    anomaly_timestamps: dict[str, datetime],
) -> Optional[str]:
    """Which upstream service degraded first?"""
    if anomalous_service not in G:
        return None
    predecessors = list(nx.ancestors(G, anomalous_service))
    if not predecessors:
        return None
    sorted_preds = sorted(
        predecessors,
        key=lambda s: anomaly_timestamps.get(s, datetime.max),
    )
    return sorted_preds[0] if sorted_preds else None


def graph_to_frontend_format(
    G: nx.DiGraph,
    anomalous_services: list[str],
) -> dict:
    """Serialize graph for frontend SVG rendering."""
    return {
        "nodes": [
            {
                "id": node,
                "label": node,
                "is_anomalous": node in anomalous_services,
            }
            for node in G.nodes()
        ],
        "edges": [
            {
                "from": u,
                "to": v,
                "avg_latency_ms": G[u][v].get("avg_latency_ms", 0),
                "error_rate": G[u][v].get("error_rate", 0),
            }
            for u, v in G.edges()
        ],
    }


def build_default_sentinel_graph() -> nx.DiGraph:
    """Default service dependency graph for the Sentinel demo."""
    spans = [
        {"parent_service": "api-gateway", "child_service": "auth-service", "avg_latency_ms": 12, "error_rate": 0.001},
        {"parent_service": "api-gateway", "child_service": "user-service", "avg_latency_ms": 18, "error_rate": 0.002},
        {"parent_service": "api-gateway", "child_service": "search-service", "avg_latency_ms": 35, "error_rate": 0.003},
        {"parent_service": "api-gateway", "child_service": "order-service", "avg_latency_ms": 22, "error_rate": 0.002},
        {"parent_service": "order-service", "child_service": "payment-service", "avg_latency_ms": 45, "error_rate": 0.005},
        {"parent_service": "order-service", "child_service": "inventory-service", "avg_latency_ms": 15, "error_rate": 0.001},
        {"parent_service": "user-service", "child_service": "notification-service", "avg_latency_ms": 8, "error_rate": 0.001},
        {"parent_service": "search-service", "child_service": "cache-service", "avg_latency_ms": 3, "error_rate": 0.0005},
        {"parent_service": "analytics-service", "child_service": "storage-service", "avg_latency_ms": 20, "error_rate": 0.002},
        {"parent_service": "order-service", "child_service": "queue-service", "avg_latency_ms": 5, "error_rate": 0.001},
    ]
    return build_dependency_graph(spans)

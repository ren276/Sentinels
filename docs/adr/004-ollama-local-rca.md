# ADR 004: Local Ollama for Root Cause Analysis (RCA)

## Status
Accepted

## Context
When an incident is triggered, operators need context. A Large Language Model (LLM) can summarize telemetry variations and runbook matches into human-readable text. However, sending proprietary internal microservice architecture and security-sensitive metric data to OpenAI/Anthropic violates zero-trust principles.

## Decision
We chose to use Ollama running locally within the VPC, specifically utilizing the `llama3.2:3b` model.

## Consequences
- **Positive**: 100% data privacy. Zero external API costs.
- **Negative**: Requires provisioning GPU/high-VRAM CPU nodes in production. The 3B parameter model is fast but prone to hallucination if the prompt context window is not strictly controlled with RAG (Retrieval-Augmented Generation) metrics.

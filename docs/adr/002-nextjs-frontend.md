# ADR 002: Next.js App Router for Frontend

## Status
Accepted

## Context
Sentinel's UI requires near real-time updates of complex dashboard components (graphs, anomaly streams) and SEO is not a priority for an internal operations tool. However, fast initial load times and structured routing are important.

## Decision
We chose Next.js 15 using the new App Router (`app/`) over a single-page React app (Vite/CRA).
We also use Zustand for global state and React Query for server state caching.

## Consequences
- **Positive**: Next.js provides a robust API proxy, standalone Docker builds, and easy layout management for the Sidebar and nested routes.
- **Negative**: React Server Components (RSC) have a learning curve and most of our interactive components (WebSockets, Framer Motion) mandate the `"use client"` directive, largely transforming the UI into a thick client-side app anyway.

# TokenSentry V1 Decisions

This document records current architectural decisions only.

## One gateway application

Authentication, rate limits, budgets, model policy, routing, Agent Guard, provider calls, accounting, and audit remain in one Fastify application. Splitting the request path into services would add deployment and network failure modes without a demonstrated V1 need.

## Deterministic governance

Governance decisions are policy and state based. The primary enforcement path does not call an LLM to decide whether a request is allowed.

## PostgreSQL and Valkey

PostgreSQL stores durable application data. Valkey provides shared transient state and atomic operations for rate limiting, budget reservations, and Agent Guard. V1 does not add a second database or state service.

## Explicit model catalog

V1 uses checked-in model metadata and rejects unsupported or unpriced models. It does not synchronize a third-party model registry.

## Provider adapters

Provider-specific request/response details stay behind the API adapter layer. Provider credentials remain server-side.

## Streaming semantics

A provider error after a streaming HTTP response begins cannot change the already-sent status code. The gateway records and handles the remaining failure within that constraint.
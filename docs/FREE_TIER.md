# TokenSentry V1 - Free-Tier Design

Target: very low-cost or free-tier hosting (single VPS, managed DB/Valkey, serverless/static frontend).
Always-running services minimized: api (stateless), dashboard (optional, can disable), website (optional, can disable), nginx (optional if platform handles SSL/proxy).
No Kubernetes, Kafka, ClickHouse, background workers, dedicated monitoring stack, or additional daemon required.
DB pooling: max 5 connections recommended for free tier (current: max 20).
Valkey: single instance sufficient; retry limits set to 2 with 5-minute unhealthy cooldown.
API designed for serverless: graceful shutdown handled; stateless per request; no session persistence in server memory.

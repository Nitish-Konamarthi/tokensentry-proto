# TokenSentry

**Enterprise AI Token Governance Platform**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

TokenSentry sits between your team and AI providers. One line of code. 50–80% cost reduction.

## What it does

- **Routes** every AI call to the cheapest capable model (saves 50–80%)
- **Enforces** hard budget limits per user / team / org
- **Caches** semantically identical queries (100% free on repeat)
- **Guards** agentic workflows against infinite loops
- **Tracks** every dollar across Claude, Codex, and Antigravity in one dashboard

## Supported tools

| Tool | How | Status |
|------|-----|--------|
| Claude Code | `ANTHROPIC_BASE_URL` + MCP server | ✅ |
| OpenAI Codex | `OPENAI_BASE_URL` | ✅ |
| Antigravity CLI | `GEMINI_BASE_URL` | ✅ |

## Quick start

```bash
git clone https://github.com/Nitish-Konamarthi/tokensentry-proto
cd tokensentry-proto
cp .env.example .env
# Fill in: DATABASE_URL, REDIS_URL, CLICKHOUSE_URL, GROQ_API_KEY
docker compose up -d postgres redis clickhouse
npm install && npm run db:migrate && npm run db:seed
npm run dev
```

Test it:
```bash
curl -X POST http://localhost:3000/v1/proxy/messages \
  -H "Authorization: Bearer ts_live_test_YOUR_SEEDED_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-6","max_tokens":50,"messages":[{"role":"user","content":"What is 2+2?"}]}'
# X-TS-Approved-Model: claude-haiku-4-5  ← automatically downgraded
# X-TS-Cost-Usd: 0.000001               ← 94% cheaper than Opus
```

## Architecture

See [TOKENSENTRY_MASTER_v2.md](TOKENSENTRY_MASTER_v2.md) for full spec.

Built by [@Nitish-Konamarthi](https://github.com/Nitish-Konamarthi)

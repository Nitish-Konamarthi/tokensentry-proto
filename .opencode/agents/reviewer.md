---
description: Review without modifying code. Check security-sensitive changes (auth, budget, agent-guard, rate limiter) first.
mode: subagent
model: openrouter/free
tools:
  read: true
  bash: true
  grep: true
permission:
  read: allow
  bash: allow
  grep: allow
  edit: deny
  write: deny
---
---
description: Review without modifying code. Verify behavior against current V1 source, tests, and API contracts.
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

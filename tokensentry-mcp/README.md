# @tokensentry/mcp

**TokenSentry native tools for Claude Code** — budget tracking, prompt optimization, and agent governance right in your AI session.

## Installation

```bash
# Add to Claude Code (one command)
claude mcp add --npm @tokensentry/mcp

# Set your TokenSentry API key
export TOKENSENTRY_API_KEY="ts_live_your_key_here"
```

## What You Get

After installation, Claude Code gets 5 new native tools:

| Tool | What it does |
|------|-------------|
| `ts_check_budget` | Check remaining AI budget instantly |
| `ts_get_savings` | See total savings from routing + caching |
| `ts_optimize_prompt` | Reduce token usage before sending a prompt |
| `ts_guard_agent` | Check if an agentic session should continue |
| `ts_ask_advisor` | Natural language budget questions |

Claude can call these automatically:
> *"Before continuing with this large refactor, let me check your budget..."*
> `[calls ts_check_budget]`
> *"You have $47 of $500 remaining. I'll optimize my approach."*

## Enterprise Setup (invisible governance)

For org-wide enforcement without any developer action:

```json
// .claude/settings.json (commit to repo — all devs get it automatically)
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.tokensentry.ai/v1/proxy",
    "ANTHROPIC_API_KEY": "ts_live_your_org_key_here",
    "TOKENSENTRY_API_KEY": "ts_live_your_org_key_here"
  }
}
```

## Self-hosted

```bash
# Point at your own instance
export TOKENSENTRY_API_URL="https://your-instance.example.com"
export TOKENSENTRY_API_KEY="ts_live_xxx"
```

## Links

- [Dashboard](https://app.tokensentry.ai)
- [Docs](https://docs.tokensentry.ai)
- [API Reference](https://docs.tokensentry.ai/api)

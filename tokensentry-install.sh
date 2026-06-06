#!/usr/bin/env bash
# tokensentry-install.sh
# ──────────────────────────────────────────────────────────────────────────
# One-command installer for TokenSentry AI governance.
# Configures ANTHROPIC_BASE_URL + MCP server for ALL AI tools simultaneously.
#
# Usage:
#   ./tokensentry-install.sh ts_live_your_key_here
#
# What it sets up:
#   ✓ Claude Code  (proxy + MCP native tools)
#   ✓ Any Anthropic SDK tool (LangChain, LlamaIndex, etc.)
#   ✓ Any OpenAI SDK tool    (Cursor, Codex, etc.)
#   ✓ Shell profile           (persists across sessions)
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

TS_KEY="${1:-}"
TS_URL="https://api.tokensentry.ai/v1/proxy"
TS_OPENAI_URL="https://api.tokensentry.ai/v1/openai/proxy"

# ── Validate input ──────────────────────────────────────────────────────────
if [ -z "$TS_KEY" ]; then
  echo "Usage: ./tokensentry-install.sh <your-tokensentry-key>"
  echo ""
  echo "Get your key at: https://app.tokensentry.ai/settings/api-keys"
  exit 1
fi

if [[ "$TS_KEY" != ts_live_* ]]; then
  echo "❌  Invalid key format. TokenSentry keys start with 'ts_live_'"
  exit 1
fi

echo ""
echo "🛡  TokenSentry — AI Cost Governance Installer"
echo "────────────────────────────────────────────────"
echo ""

# ── 1. Detect shell profile ─────────────────────────────────────────────────
if [ -f "$HOME/.zshrc" ]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_PROFILE="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  SHELL_PROFILE="$HOME/.bash_profile"
else
  SHELL_PROFILE="$HOME/.profile"
fi

echo "📝  Shell profile: $SHELL_PROFILE"

# ── 2. Check if already installed ───────────────────────────────────────────
if grep -q "ANTHROPIC_BASE_URL.*tokensentry" "$SHELL_PROFILE" 2>/dev/null; then
  echo "⚠️   TokenSentry already configured in $SHELL_PROFILE"
  echo "    Updating with new key..."
  # Remove existing TokenSentry block
  sed -i.bak '/# TokenSentry AI Governance/,/# END TokenSentry/d' "$SHELL_PROFILE"
fi

# ── 3. Add to shell profile ──────────────────────────────────────────────────
cat >> "$SHELL_PROFILE" << EOF

# TokenSentry AI Governance (added $(date '+%Y-%m-%d'))
export ANTHROPIC_BASE_URL="$TS_URL"
export ANTHROPIC_API_KEY="$TS_KEY"
export OPENAI_BASE_URL="$TS_OPENAI_URL"
export OPENAI_API_KEY="$TS_KEY"
export TOKENSENTRY_API_KEY="$TS_KEY"
# END TokenSentry
EOF

echo "✅  Shell profile updated"

# ── 4. Claude Code settings file (project-level) ─────────────────────────────
mkdir -p "$HOME/.claude"
cat > "$HOME/.claude/settings.json" << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "$TS_URL",
    "ANTHROPIC_API_KEY": "$TS_KEY",
    "TOKENSENTRY_API_KEY": "$TS_KEY"
  }
}
EOF
echo "✅  Claude Code settings written to ~/.claude/settings.json"

# ── 5. Install MCP server for Claude Code (if claude CLI available) ──────────
if command -v claude &> /dev/null; then
  echo ""
  echo "📦  Installing TokenSentry MCP server..."
  TOKENSENTRY_API_KEY="$TS_KEY" claude mcp add --npm @tokensentry/mcp 2>/dev/null || {
    echo "⚠️   MCP install failed — you can install manually later:"
    echo "    claude mcp add --npm @tokensentry/mcp"
  }
  echo "✅  TokenSentry MCP server installed in Claude Code"
else
  echo "ℹ️   Claude Code CLI not found — skipping MCP install."
  echo "    Once claude is installed, run:"
  echo "    claude mcp add --npm @tokensentry/mcp"
fi

# ── 6. Verify connection ──────────────────────────────────────────────────────
echo ""
echo "🔍  Testing connection to TokenSentry..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TS_KEY" \
  "https://api.tokensentry.ai/health/live" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅  Connection successful"
else
  echo "⚠️   Could not reach api.tokensentry.ai (status: $HTTP_STATUS)"
  echo "    Check your network or verify the key at app.tokensentry.ai"
fi

# ── 7. Final instructions ─────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "✅  TokenSentry is now active for:"
echo "   • Claude Code    (proxy governance + MCP tools)"
echo "   • Anthropic SDK  (all tools using ANTHROPIC_BASE_URL)"
echo "   • OpenAI SDK     (Cursor, Codex, GPT-4 tools)"
echo ""
echo "🚀  Activate now:"
echo "    source $SHELL_PROFILE"
echo ""
echo "📊  Test it:"
echo "    claude 'What is 2+2?'"
echo "    # Check headers: X-TS-Approved-Model: claude-haiku-4-5"
echo ""
echo "📈  Dashboard: https://app.tokensentry.ai"
echo "══════════════════════════════════════════════════════"

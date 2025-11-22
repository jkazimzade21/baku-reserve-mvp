#!/bin/bash

# MCP Profile Switcher for Claude Code
# Reduces context usage by loading only needed MCP servers

CLAUDE_CONFIG_DIR="$HOME/.config/claude-code"
CURRENT_DIR="$(pwd)"

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}MCP Profile Switcher - Reduce Context Usage${NC}"
echo "============================================"
echo

# Show current context usage
echo -e "${YELLOW}Current MCP servers will consume:${NC}"
case "$1" in
  minimal)
    echo "• Filesystem only: ~7k tokens (81% reduction)"
    CONFIG="mcp-config-minimal.json"
    ;;
  testing)
    echo "• Chrome + Filesystem: ~20k tokens (46% reduction)"
    CONFIG="mcp-config-testing.json"
    ;;
  full)
    echo "• All 4 servers: 36.8k tokens (current)"
    CONFIG="mcp-config.json"
    ;;
  none)
    echo "• No MCP servers: 0 tokens (100% reduction)"
    cat > "$CLAUDE_CONFIG_DIR/mcp-config-none.json" <<EOF
{
  "mcpServers": {}
}
EOF
    CONFIG="mcp-config-none.json"
    ;;
  *)
    echo "Usage: ./switch-mcp-profile.sh [minimal|testing|full|none]"
    echo
    echo "Profiles:"
    echo "  minimal  - Filesystem only (7k tokens)"
    echo "  testing  - Chrome + Filesystem (20k tokens)"
    echo "  full     - All MCPs (36.8k tokens)"
    echo "  none     - No MCPs (0 tokens)"
    echo
    echo "Example: ./switch-mcp-profile.sh testing"
    exit 1
    ;;
esac

echo
echo -e "${GREEN}Switching to $1 profile...${NC}"

# Launch Claude Code with selected config
cd "$CURRENT_DIR"
claude \
  --model opus \
  --dangerously-skip-permissions \
  --mcp-config "$CLAUDE_CONFIG_DIR/$CONFIG"

echo -e "${GREEN}Claude Code launched with $1 profile${NC}"
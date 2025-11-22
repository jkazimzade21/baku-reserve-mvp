#!/bin/bash

# Chrome DevTools MCP Verification Script for Baku Reserve
# This script verifies the MCP integration and tests basic functionality

echo "═══════════════════════════════════════════════════════════════"
echo "     Chrome DevTools MCP - Baku Reserve Test Verification     "
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Check MCP Server Status
echo -e "${BLUE}1. Checking Chrome DevTools MCP Server Status...${NC}"
MCP_STATUS=$(claude mcp list 2>&1)
if [[ $MCP_STATUS == *"chrome-devtools"*"Connected"* ]]; then
    echo -e "${GREEN}✅ Chrome DevTools MCP is connected${NC}"
else
    echo -e "${YELLOW}⚠️  Chrome DevTools MCP connection status unclear${NC}"
fi
echo ""

# 2. Check Baku Reserve Servers
echo -e "${BLUE}2. Checking Baku Reserve Servers...${NC}"

# Check Backend API
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health | grep -q "200\|404"; then
    echo -e "${GREEN}✅ Backend API is running on port 8000${NC}"
else
    echo -e "${YELLOW}⚠️  Backend API might not be running${NC}"
fi

# Check Expo Web Server
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8081 | grep -q "200"; then
    echo -e "${GREEN}✅ Expo Web Server is running on port 8081${NC}"
else
    echo -e "${YELLOW}⚠️  Expo Web Server might not be running${NC}"
fi
echo ""

# 3. Test Chrome DevTools MCP Capabilities
echo -e "${BLUE}3. Available Chrome DevTools MCP Capabilities:${NC}"
echo "   • Browser Launch & Control"
echo "   • Page Navigation"
echo "   • Screenshot Capture"
echo "   • Device Emulation"
echo "   • Network Monitoring"
echo "   • Performance Metrics"
echo ""

# 4. Generate Test Commands
echo -e "${BLUE}4. Test Commands for Baku Reserve:${NC}"
echo ""
echo "You can now ask Claude to perform these tests:"
echo ""
echo -e "${GREEN}Basic Navigation Test:${NC}"
echo '  "Open Chrome and navigate to http://localhost:8081"'
echo ""
echo -e "${GREEN}Screenshot Test:${NC}"
echo '  "Take a screenshot of the Baku Reserve homepage"'
echo ""
echo -e "${GREEN}Mobile Test:${NC}"
echo '  "Show me how Baku Reserve looks on an iPhone 14 Pro"'
echo ""
echo -e "${GREEN}Performance Test:${NC}"
echo '  "Collect performance metrics for the Baku Reserve app"'
echo ""
echo -e "${GREEN}Network Test:${NC}"
echo '  "Monitor API calls while navigating through Baku Reserve"'
echo ""

# 5. Create test results file
echo -e "${BLUE}5. Creating test results template...${NC}"
cat > chrome_mcp_test_results.json << 'EOF'
{
  "testDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "project": "Baku Reserve",
  "mcp_server": "chrome-devtools-mcp",
  "version": "0.10.2",
  "tests": {
    "navigation": {
      "status": "ready",
      "description": "Navigate to Baku Reserve pages"
    },
    "screenshots": {
      "status": "ready",
      "description": "Capture screenshots of the app"
    },
    "mobile_emulation": {
      "status": "ready",
      "description": "Test on various mobile devices"
    },
    "network_monitoring": {
      "status": "ready",
      "description": "Monitor API requests and responses"
    },
    "performance_metrics": {
      "status": "ready",
      "description": "Collect load times and rendering metrics"
    }
  },
  "endpoints": {
    "backend_api": "http://localhost:8000",
    "expo_web": "http://localhost:8081"
  }
}
EOF
echo -e "${GREEN}✅ Test results template created: chrome_mcp_test_results.json${NC}"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}Chrome DevTools MCP is ready for testing Baku Reserve!${NC}"
echo "═══════════════════════════════════════════════════════════════"
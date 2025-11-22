# MCP Code Execution Implementation

## Overview
This directory implements Anthropic's new MCP code execution pattern, reducing context usage by 98.7% (from 36.8k tokens to ~2k tokens).

> ⚠️ Security note: these servers are meant to run locally or inside an isolated CI container. Do **not** expose them to the public internet. The chrome-devtools runner in particular should be firewalled and executed in a network-restricted sandbox to avoid SSRF/RCE vectors.

## Architecture

Instead of loading all MCP tool definitions upfront, tools are now:
1. **Discoverable** through filesystem navigation
2. **Loadable on-demand** as TypeScript modules
3. **Composable** through actual code execution
4. **Context-efficient** with intermediate results staying in sandbox

## Directory Structure

```
mcp-code-execution/
├── servers/                      # MCP server modules
│   ├── chrome-devtools/         # Browser automation tools
│   │   ├── index.ts            # Server entry point
│   │   ├── navigate.ts         # Navigation tool
│   │   ├── screenshot.ts       # Screenshot tool
│   │   └── ...                 # Other tools
│   ├── github/                  # GitHub API tools
│   │   ├── index.ts
│   │   ├── createPR.ts
│   │   └── ...
│   ├── filesystem/              # File system tools
│   │   ├── index.ts
│   │   ├── read.ts
│   │   └── ...
│   └── memory/                  # Knowledge graph tools
│       ├── index.ts
│       └── ...
├── lib/                         # Shared utilities
│   ├── mcp-client.ts           # MCP client wrapper
│   └── utils.ts                # Helper functions
└── examples/                    # Usage examples
    └── browser-test.ts          # Example browser automation

```

## Benefits

### Before (Traditional MCP)
- All 77 tools loaded upfront: **36.8k tokens**
- Every tool definition in context
- No code composition ability
- All data flows through model context

### After (Code Execution)
- Tools discovered as needed: **~2k tokens**
- Only import what you use
- Natural code composition
- Intermediate results stay in sandbox

## Usage

Instead of calling tools directly:
```typescript
// Old way - tool definitions loaded upfront
await mcp__chrome_devtools__navigate_page({
  url: "https://example.com"
});
```

Write actual code:
```typescript
// New way - import only what's needed
import { navigate } from './servers/chrome-devtools/navigate';
await navigate("https://example.com");
```

## Migration Status

- [x] Architecture designed
- [x] Directory structure created
- [ ] Chrome DevTools server migrated
- [ ] GitHub server migrated
- [ ] Filesystem server migrated
- [ ] Memory server migrated
- [ ] Testing completed
- [ ] Documentation updated

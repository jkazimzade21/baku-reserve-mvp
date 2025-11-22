#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { url: 'http://localhost:8081', outDir: null };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--url' && args[i + 1]) {
      parsed.url = args[++i];
    } else if (token === '--out' && args[i + 1]) {
      parsed.outDir = args[++i];
    }
  }
  return parsed;
}

function extractJson(content) {
  for (const item of content ?? []) {
    if (item.type === 'text') {
      try {
        return JSON.parse(item.text);
      } catch (_) {
        // ignore
      }
    }
  }
  return null;
}

async function main() {
  const { url, outDir } = parseArgs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactsDir = path.resolve(repoRoot, outDir ?? path.join('artifacts', `perf-${timestamp}`));
  await fs.mkdir(artifactsDir, { recursive: true });

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest', '--isolated=true'],
    cwd: repoRoot,
    env: process.env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'perf-runner', version: '1.0.0' });

  await client.connect(transport);

  console.log(`[perf] Launching Chrome page at ${url}`);
  await client.callTool({
    name: 'mcp__chrome-devtools__new_page',
    arguments: { url },
  });

  const pages = await client.callTool({ name: 'mcp__chrome-devtools__list_pages', arguments: {} });
  const parsed = extractJson(pages.content);
  const pageIdx = parsed?.pages?.[parsed.pages.length - 1]?.index ?? 0;
  await client.callTool({ name: 'mcp__chrome-devtools__select_page', arguments: { pageIdx } });

  console.log('[perf] Starting trace...');
  await client.callTool({
    name: 'mcp__chrome-devtools__performance_start_trace',
    arguments: { autoStop: false, reload: true },
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const traceResponse = await client.callTool({
    name: 'mcp__chrome-devtools__performance_stop_trace',
    arguments: {},
  });

  const tracePath = path.join(artifactsDir, 'concierge_trace.jsonl');
  await fs.writeFile(tracePath, JSON.stringify(traceResponse.content ?? [], null, 2), 'utf-8');
  console.log(`[perf] Trace captured -> ${tracePath}`);

  const screenshotPath = path.join(artifactsDir, 'concierge_card.png');
  await client.callTool({
    name: 'mcp__chrome-devtools__take_screenshot',
    arguments: { filePath: screenshotPath, fullPage: true },
  });
  console.log(`[perf] Screenshot saved -> ${screenshotPath}`);

  await client.close();
  await transport.close();
}

main().catch((err) => {
  console.error('[perf] Failed to capture run:', err);
  process.exitCode = 1;
});

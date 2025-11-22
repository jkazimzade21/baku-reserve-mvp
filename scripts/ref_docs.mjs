#!/usr/bin/env node
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname, '..');

function usage() {
  console.log('Usage: node scripts/ref_docs.mjs --query "sentry sdk" [--read-first]');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { query: null, readFirst: false };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--query' && args[i + 1]) {
      parsed.query = args[++i];
    } else if (token === '--read-first') {
      parsed.readFirst = true;
    }
  }
  return parsed;
}

function buildEndpoint() {
  const base = process.env.REF_MCP_ENDPOINT || 'https://api.ref.tools/mcp';
  const apiKey = process.env.REF_MCP_API_KEY;
  if (apiKey && !base.includes('apiKey=')) {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}apiKey=${apiKey}`;
  }
  return base;
}

function logContent(response) {
  for (const item of response.content ?? []) {
    if (item.type === 'text' && item.text) {
      console.log(item.text.trim());
    }
  }
}

async function main() {
  const { query, readFirst } = parseArgs();
  if (!query) {
    usage();
    process.exit(1);
  }

  const endpoint = buildEndpoint();
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'mcp-remote@latest', endpoint],
    cwd: repoRoot,
    env: process.env,
  });
  const client = new Client({ name: 'ref-docs', version: '1.0.0' });
  await client.connect(transport);

  console.log(`[ref] searching docs for "${query}"`);
  const search = await client.callTool({
    name: 'ref_search_documentation',
    arguments: { query, maxResults: 5 },
  });
  logContent(search);

  if (readFirst) {
    const first = search.content?.find((item) => item.type === 'text' && item.text?.includes('http'));
    const urlMatch = first?.text?.match(/https?:[^\s]+/);
    if (urlMatch) {
      console.log(`[ref] reading ${urlMatch[0]}`);
      const detail = await client.callTool({
        name: 'ref_read_url',
        arguments: { url: urlMatch[0] },
      });
      logContent(detail);
    }
  }

  await client.close();
  await transport.close();
}

main().catch((err) => {
  console.error('[ref] Failed to run lookup:', err);
  process.exitCode = 1;
});

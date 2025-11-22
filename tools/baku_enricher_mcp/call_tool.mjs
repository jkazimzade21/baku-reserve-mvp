import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';

const [,, nameArg, outDirArg = 'out/restaurants'] = process.argv;
if (!nameArg) {
  console.error('Usage: node tools/baku_enricher_mcp/call_tool.mjs "Restaurant Name" [outDir]');
  process.exit(1);
}

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');

const transport = new StdioClientTransport({
  command: path.join(repoRoot, 'tools/baku_enricher_mcp/start_server.sh'),
  cwd: repoRoot,
  env: process.env,
});

const client = new Client({
  name: 'local-mcp-runner',
  version: '1.0.0',
});

await client.connect(transport);

const response = await client.callTool({
  name: 'enrich_restaurant',
  arguments: {
    name: nameArg,
    outDir: outDirArg,
    downloadImages: true,
  },
}, undefined, { timeout: 240000 });

for (const item of response.content ?? []) {
  if (item.type === 'text' && item.text) {
    console.log(item.text);
  }
}

await client.close();
await transport.close();

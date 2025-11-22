#!/usr/bin/env node
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    org: process.env.SENTRY_ORG || 'baku-reserve',
    project: process.env.SENTRY_PROJECT || 'concierge-ai',
    team: process.env.SENTRY_TEAM || 'platform',
    platform: process.env.SENTRY_PLATFORM || 'python',
  };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--org' && args[i + 1]) parsed.org = args[++i];
    else if (token === '--project' && args[i + 1]) parsed.project = args[++i];
    else if (token === '--team' && args[i + 1]) parsed.team = args[++i];
    else if (token === '--platform' && args[i + 1]) parsed.platform = args[++i];
  }
  return parsed;
}

function parseJsonResponse(response) {
  for (const item of response.content ?? []) {
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

async function ensureProject(client, org, project, team, platform) {
  const projects = await client.callTool({
    name: 'mcp__sentry__find_projects',
    arguments: { organizationSlug: org, query: project },
  });
  const parsed = parseJsonResponse(projects);
  const existing = parsed?.projects?.find((p) => p.slug === project);
  if (existing) {
    console.log(`[sentry] project ${project} already exists`);
    return existing;
  }
  console.log(`[sentry] creating project ${project}`);
  const created = await client.callTool({
    name: 'mcp__sentry__create_project',
    arguments: {
      organizationSlug: org,
      teamSlug: team,
      name: project,
      platform,
    },
  });
  return parseJsonResponse(created);
}

async function ensureDsn(client, org, project) {
  const existing = await client.callTool({
    name: 'mcp__sentry__find_dsns',
    arguments: { organizationSlug: org, projectSlug: project },
  });
  const parsed = parseJsonResponse(existing);
  if (parsed?.dsns?.length) {
    console.log(`[sentry] existing DSNs:`);
    parsed.dsns.forEach((dsn) => console.log(` - ${dsn.name}: ${dsn.dsn}`));
    return parsed.dsns;
  }
  console.log('[sentry] creating default DSN');
  const created = await client.callTool({
    name: 'mcp__sentry__create_dsn',
    arguments: {
      organizationSlug: org,
      projectSlug: project,
      name: 'Production',
    },
  });
  const createdJson = parseJsonResponse(created);
  if (createdJson?.dsn) {
    console.log(` - Production: ${createdJson.dsn}`);
  }
  return createdJson ? [createdJson] : [];
}

async function main() {
  const params = parseArgs();
  console.log(`[sentry] ensuring ${params.org}/${params.project}`);
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'mcp-remote@latest', 'https://mcp.sentry.dev/mcp'],
    cwd: repoRoot,
    env: process.env,
  });
  const client = new Client({ name: 'sentry-bootstrap', version: '1.0.0' });
  await client.connect(transport);

  await ensureProject(client, params.org, params.project, params.team, params.platform);
  await ensureDsn(client, params.org, params.project);

  await client.close();
  await transport.close();
}

main().catch((err) => {
  console.error('[sentry] bootstrap failed:', err);
  process.exitCode = 1;
});

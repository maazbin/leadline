#!/usr/bin/env node
// mcp-server.js — stdio MCP for any coding agent. This process is not a brain.
//
// Owns: the protocol. Tool rules live in src/mcp/tools.js.
// Must not: write to stdout except for MCP frames. Logs go to stderr.
// Installs dependencies, then starts the local control plane if it is not already up.

import { ensureInstalled } from './src/kernel/runtime.js';

const ready = ensureInstalled();
if (!ready.ok) process.exit(1);

const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
const { getDb } = await import('./src/kernel/db.js');
const { callTool, TOOLS } = await import('./src/mcp/tools.js');
const { startServer } = await import('./src/web/server.js');

getDb();
await startServer({ tolerateInUse: true });

const server = new Server({ name: 'leadline', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await callTool(request.params.name, request.params.arguments || {});
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);

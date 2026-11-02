import http from 'node:http';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {definitions, validateArgs} from './browser.js';
import {readFileSync} from 'node:fs';
const {version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

export function rpc(name, args = {}, socketPath = process.env.ABB_SOCKET || '/tmp/abb/control.sock') {
  return new Promise((resolve, reject) => {
    const req = http.request({socketPath, path: '/tool', method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 30000}, res => {
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > 16 * 1024 * 1024) { res.destroy(new Error('Response too large')); return; } chunks.push(c); });
      res.on('error', reject);
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks))); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('Bridge request timed out.')));
    req.on('error', reject);
    req.end(JSON.stringify({name, args}));
  });
}

const server = new Server({name: 'agentic-browser-bridge', version}, {capabilities: {tools: {}}});
server.setRequestHandler(ListToolsRequestSchema, async () => ({tools: definitions.map(([name, description, fields]) => ({
  name, description,
  inputSchema: {type: 'object', properties: Object.fromEntries(Object.entries(fields).map(([key, type]) => [key, {type}])), required: Object.keys(fields), additionalProperties: false},
  annotations: {readOnlyHint: ['browser_status', 'browser_tabs', 'browser_snapshot', 'browser_screenshot', 'browser_logs'].includes(name), openWorldHint: true},
}))}));
server.setRequestHandler(CallToolRequestSchema, async ({params}) => {
  try { validateArgs(params.name, params.arguments || {}); return await rpc(params.name, params.arguments || {}); }
  catch (e) { return {isError: true, content: [{type: 'text', text: e.message}]}; }
});
await server.connect(new StdioServerTransport());

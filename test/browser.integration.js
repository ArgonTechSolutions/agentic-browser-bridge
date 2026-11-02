import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {scryptSync} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start} from '../src/server.js';

// A bounded real-browser test. No credentials or third-party websites.
test('MCP flow → human handoff → same-tab resume → persistent profile', {timeout: 60000}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-test-'));
  const fixture = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<title>Bridge fixture</title><label>Name <input id="name"></label><button onclick="localStorage.setItem(\'name\',document.querySelector(\'#name\').value);document.querySelector(\'#result\').textContent=localStorage.name">Save</button><p id="result"></p>');
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${fixture.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
  let context, app, client;
  try {
    context = await chromium.launchPersistentContext(path.join(dir, 'profile'), {executablePath, headless: true, args: ['--no-sandbox', '--remote-debugging-port=19222']});
    const passwordHash = '00'.repeat(16) + ':' + scryptSync('fixture-password', Buffer.alloc(16), 64).toString('hex');
    const authorization = 'Basic ' + Buffer.from('operator:fixture-password').toString('base64');
    app = await start({passwordHash, port: 0, socket: path.join(dir, 'control.sock'), endpoint: 'http://127.0.0.1:19222'});
    client = new Client({name: 'integration', version: '1.0.0'});
    await client.connect(new StdioClientTransport({command: process.execPath, args: ['src/mcp.js'], env: {...process.env, ABB_SOCKET: app.socket}}));
    const call = (name, args = {}) => client.callTool({name, arguments: args});
    assert.ok((await client.listTools()).tools.some(t => t.name === 'browser_request_human'));
    assert.equal((await call('browser_tabs')).isError, true);
    const viewerURL = `http://127.0.0.1:${app.viewer.address().port}`;
    assert.equal((await fetch(viewerURL + '/api/status')).status, 401);
    const control = mode => fetch(viewerURL + '/api/control', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-ABB-Control': '1', Authorization: authorization, Origin: viewerURL}, body: JSON.stringify({mode})});
    assert.equal((await control('agent')).status, 200);
    const opened = await call('browser_open', {url});
    const {tab} = JSON.parse(opened.content[0].text);
    assert.ok(tab);
    await call('browser_fill', {tab, selector: '#name', text: 'agent'});
    await call('browser_click', {tab, selector: 'button'});
    assert.match((await call('browser_snapshot', {tab})).content[0].text, /agent/);
    assert.equal((await call('browser_screenshot', {tab})).content[0].type, 'image');
    await call('browser_request_human', {reason: 'Please complete the next step.'});
    assert.equal((await call('browser_screenshot', {tab})).isError, true);
    assert.equal((await call('browser_fill', {tab, selector: '#name', text: 'blocked'})).isError, true);
    const page = context.pages().find(p => p.url() === url + '/');
    await page.locator('#name').fill('human'); await page.locator('button').click();
    await control('agent');
    assert.match((await call('browser_snapshot', {tab})).content[0].text, /human/);
    // Disconnecting MCP leaves the browser alive, and reconnecting preserves the same tab.
    await client.close(); client = undefined;
    assert.equal(await page.locator('#result').textContent(), 'human');
    const response = await fetch(viewerURL + '/api/control', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-ABB-Control': '1', Authorization: authorization, Origin: 'http://evil.test'}, body: '{"mode":"human"}'});
    assert.equal(response.status, 403);
    await app.close(); app = undefined;
    await context.close();
    context = await chromium.launchPersistentContext(path.join(dir, 'profile'), {executablePath, headless: true, args: ['--no-sandbox']});
    const restored = await context.newPage(); await restored.goto(url);
    assert.equal(await restored.evaluate(() => localStorage.getItem('name')), 'human');
  } finally {
    await client?.close(); await app?.close(); await context?.close();
    await new Promise(resolve => fixture.close(resolve)); await rm(dir, {recursive: true, force: true});
  }
});

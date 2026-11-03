import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {WebSocketServer} from 'ws';
import {proxyArguments} from '../src/proxy.js';

// Only proxy can resolve *.proxy-fixture.invalid. Chromium cannot reach the
// fixtures directly. CONNECT forwards TLS untouched; certificate trust is scoped
// to this synthetic profile. Nothing uses production profiles or tailnet keys.
test('Chromium uses proxy DNS, TLS CONNECT and WebSockets; unavailable proxy fails closed', {timeout: 60000}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-proxy-'));
  const sockets = new Set();
  let browser;
  const track = server => server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const requests = [], tunnels = [];
  const serve = (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<title>Proxy fixture</title><p>Connected through proxy</p>'); };
  const plain = http.createServer(serve);
  const proxy = http.createServer((req, res) => {
    requests.push(req.url);
    const target = new URL(req.url);
    if (target.hostname !== 'site.proxy-fixture.invalid') {res.writeHead(502).end(); return;}
    const upstream = http.request({host: '127.0.0.1', port: plain.address().port, path: target.pathname}, response => {res.writeHead(response.statusCode, response.headers); response.pipe(res);});
    upstream.on('error', () => res.destroy()); req.pipe(upstream);
  });
  let secure;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=site.proxy-fixture.invalid', '-keyout', path.join(dir, 'key'), '-out', path.join(dir, 'cert')], {stdio: 'ignore'});
    secure = https.createServer({key: await readFile(path.join(dir, 'key')), cert: await readFile(path.join(dir, 'cert'))}, serve);
    const ws = new WebSocketServer({server: secure}); ws.on('connection', socket => socket.on('message', message => socket.send(message, {binary: false})));
    for (const server of [plain, secure, proxy]) {track(server); await listen(server);}
    proxy.on('connect', (req, client, head) => {
      tunnels.push(req.url);
      if (req.url !== 'site.proxy-fixture.invalid:443') {client.destroy(); return;}
      const upstream = net.connect(secure.address().port, '127.0.0.1', () => {client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client);});
      sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
      upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy()); client.on('close', () => upstream.destroy());
    });
    const port = proxy.address().port;
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', ...proxyArguments({ABB_PROXY_SERVER: `http://127.0.0.1:${port}`})]});
    const context = await browser.newContext({ignoreHTTPSErrors: true}); const page = await context.newPage();
    await page.goto('http://site.proxy-fixture.invalid/'); assert.equal(await page.title(), 'Proxy fixture');
    assert.ok(requests.some(url => url === 'http://site.proxy-fixture.invalid/'));
    await page.goto('https://site.proxy-fixture.invalid/'); assert.equal(await page.title(), 'Proxy fixture');
    assert.ok(tunnels.includes('site.proxy-fixture.invalid:443'));
    assert.equal(await page.evaluate(() => new Promise((resolve, reject) => {
      const socket = new WebSocket('wss://site.proxy-fixture.invalid/echo');
      socket.onopen = () => socket.send('same secure connection');
      socket.onmessage = event => {resolve(event.data); socket.close();}; socket.onerror = reject;
    })), 'same secure connection');
    // Restart the browser against the same now-dead proxy, then attempt a
    // directly reachable origin. A DIRECT fallback would return the fixture.
    await browser.close(); browser = undefined;
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => proxy.close(resolve));
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', ...proxyArguments({ABB_PROXY_SERVER: `http://127.0.0.1:${port}`}), '--proxy-bypass-list=<-loopback>']});
    const failed = await browser.newPage();
    await assert.rejects(failed.goto(`http://127.0.0.1:${plain.address().port}/`, {timeout: 10000}), /ERR_PROXY_CONNECTION_FAILED/);
  } finally {
    await browser?.close();
    for (const socket of sockets) socket.destroy();
    for (const server of [proxy, plain, secure].filter(Boolean)) await new Promise(resolve => server.close(resolve));
    await rm(dir, {recursive: true, force: true});
  }
});

import http from 'node:http';
import net from 'node:net';
import {readFile, mkdir, chmod, unlink, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocket, WebSocketServer} from 'ws';
import {Control} from './control.js';
import {Sessions, checkHash} from './auth.js';
import {Lifecycle} from './lifecycle.js';
import {Runtime} from './runtime.js';
import {BrowserTools} from './browser.js';

const webRoot = fileURLToPath(new URL('../web/', import.meta.url));
const text = (res, status, value) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(value)); };
const fail = (res, e) => text(res, 400, {error: e.message});
async function json(req) {
  if (req.headers['content-type'] !== 'application/json') throw new Error('application/json required.');
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 65536) throw new Error('Request too large.'); }
  return JSON.parse(body);
}
export function allowedRequest(req, hosts) {
  let target;
  try { target = new URL(`http://${req.headers.host}`); } catch { return false; }
  if (!hosts.includes(target.hostname)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try { const u = new URL(origin); if (!['http:', 'https:'].includes(u.protocol) || u.host !== target.host) return false; }
    catch { return false; }
  }
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
  return true;
}

export async function start({port = 8080, host = '127.0.0.1', socket = '/tmp/abb/control.sock', endpoint, novncRoot = '/opt/novnc', vncPort = 5900, hosts = ['localhost', '127.0.0.1', '[::1]'], passwordHash = process.env.ABB_VIEWER_PASSWORD_HASH, managed = false, idleMs = 1800000, warningMs = 120000, policyFile, secureCookies = false, runtime: suppliedRuntime} = {}) {
  checkHash(passwordHash);
  const control = new Control();
  const browser = new BrowserTools(control, endpoint);
  const sessions = new Sessions(passwordHash, {secure: secureCookies});
  const sockets = new Set();
  const runtime = suppliedRuntime || (managed ? new Runtime() : undefined);
  const lifecycle = new Lifecycle({idleMs, warningMs, policyFile,
    start: async () => { await control.takeHuman('Browser awakened. Return control to enable agent access.'); await runtime?.start(); },
    stop: async () => { await control.takeHuman('Browser sleeping. Wake it in the viewer.'); await browser.disconnect(); await runtime?.stop(); },
    blockers: () => [...(control.mode === 'agent' ? ['agent workflow'] : []), ...(control.waitingForHuman ? ['waiting for human'] : []), ...(control.active ? ['agent operation'] : []), ...(sockets.size ? ['connected viewer'] : []), ...(runtime?.blockers() || [])]
  });
  if (runtime) runtime.onFailure = () => {
    lifecycle.phase = 'error';
    console.error('Browser supervisor failed unexpectedly; restarting workspace.');
    if (managed) process.kill(process.pid, 'SIGTERM');
  };
  await lifecycle.load();
  await lifecycle.wake();
  control.beforeOperation = () => {
    if (lifecycle.phase !== 'running') throw Error('Browser sleeping or starting. Ask the human to wake it in the viewer.');
    lifecycle.activity();
  };
  control.afterOperation = () => lifecycle.activity();
  const status = () => ({...control.status(), ...lifecycle.status()});
  const mutation = req => { if (req.headers['x-abb-control'] !== '1') throw Error('Control header required.'); };

  const viewer = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!allowedRequest(req, hosts)) { text(res, 403, {error: 'Host or Origin rejected.'}); return; }
    try {
      let pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/api/login' && req.method === 'POST') {
        mutation(req);
        const {password} = await json(req);
        const token = sessions.login(password);
        if (!token) { text(res, 401, {error: 'Sign-in failed. Check your password or wait a minute before retrying.'}); return; }
        res.setHeader('Set-Cookie', sessions.cookie(token, req)); text(res, 200, {ok: true}); return;
      }
      if (!sessions.authenticated(req)) {
        if (pathname === '/') pathname = '/login.html';
        else if (!['/login.html', '/login.js', '/style.css', '/fonts/manrope-latin-wght-normal.woff2'].includes(pathname)) {
          text(res, 401, {error: 'Sign in to the viewer.'}); return;
        }
      } else {
        if (pathname === '/api/logout' && req.method === 'POST') {
          mutation(req); sessions.logout(req); res.setHeader('Set-Cookie', sessions.cookie('', req)); text(res, 200, {ok: true}); return;
        }
        if (pathname === '/api/idle' && req.method === 'POST') {
          mutation(req); const {enabled} = await json(req); await lifecycle.setEnabled(enabled); text(res, 200, status()); return;
        }
        if (pathname === '/api/wake' && req.method === 'POST') {
          mutation(req); await lifecycle.wake(); text(res, 200, status()); return;
        }
        if (pathname === '/api/activity' && req.method === 'POST') {
          mutation(req); lifecycle.activity(); text(res, 200, status()); return;
        }
      }
      if (pathname === '/api/status' && req.method === 'GET') { text(res, 200, status()); return; }
      if (pathname === '/api/control' && req.method === 'POST') {
        // An extra header prevents form posts; Origin/Fetch Metadata prevent cross-origin browser requests.
        if (req.headers['x-abb-control'] !== '1') throw new Error('Control header required.');
        const {mode} = await json(req);
        if (!['human', 'agent'].includes(mode)) throw new Error('Invalid mode.');
        if (mode === 'agent' && lifecycle.phase !== 'running') throw Error('Wake the browser first.');
        if (mode === 'human') await control.takeHuman(); else control.returnToAgent();
        lifecycle.activity(); text(res, 200, status()); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { text(res, 405, {error: 'Method not allowed.'}); return; }
      const base = pathname.startsWith('/novnc/') ? novncRoot : webRoot;
      const relative = pathname.startsWith('/novnc/') ? decodeURIComponent(pathname.slice(7)) : pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
      const root = await realpath(base);
      const file = await realpath(path.resolve(root, relative));
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path.');
      const body = await readFile(file);
      const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2'};
      res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) { fail(res, e); }
  });
  const wss = new WebSocketServer({noServer: true, maxPayload: 4 * 1024 * 1024});
  viewer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/websockify' || !req.headers.origin || !allowedRequest(req, hosts) || !sessions.authenticated(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    if (lifecycle.phase !== 'running') { socket.end('HTTP/1.1 409 Conflict\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, client => {
      client.sessionToken = sessions.token(req);
      sockets.add(client); control.waitingForHuman = false; lifecycle.activity();
      // Raw TCP cannot be reached as a WebSocket by arbitrary pages in Chromium.
      // Only this authenticated/Origin-checked endpoint exposes a web transport.
      const upstream = net.createConnection({host: '127.0.0.1', port: vncPort});
      const queue = [];
      let queuedBytes = 0;
      let connected = false;
      client.on('message', data => {
        if (connected) {
          if (upstream.writableLength > 1024 * 1024) { client.close(); return; }
          upstream.write(data);
        } else if (queuedBytes + data.length <= 65536) { queue.push(data); queuedBytes += data.length; }
        else client.close();
      });
      upstream.on('connect', () => { connected = true; for (const data of queue.splice(0)) upstream.write(data); });
      upstream.on('data', data => {
        if (client.readyState !== WebSocket.OPEN) return;
        if (client.bufferedAmount > 8 * 1024 * 1024) { client.close(); return; }
        client.send(data, {binary: true});
      });
      upstream.on('error', () => client.close());
      upstream.on('close', () => client.close());
      client.on('error', () => upstream.destroy());
      client.on('close', () => { sockets.delete(client); lifecycle.activity(); upstream.destroy(); });
    });
  });
  // No network MCP listener: only same-UID local processes can access this socket.
  await mkdir(path.dirname(socket), {recursive: true, mode: 0o700});
  await chmod(path.dirname(socket), 0o700);
  // Refuse stale sockets: supervisor owns the socket directory; entrypoint removes it on a fresh start.
  const internal = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/policy') {
      try { const {enabled} = await json(req); text(res, 200, await lifecycle.setEnabled(enabled)); } catch (e) { fail(res, e); }
      return;
    }
    if (req.method !== 'POST' || req.url !== '/tool') { text(res, 404, {error: 'Not found.'}); return; }
    try {
      const {name, args} = await json(req);
      if (name === 'browser_status') { text(res, 200, {content: [{type: 'text', text: JSON.stringify(status())}]}); return; }
      text(res, 200, await browser.call(name, args));
    }
    catch (e) { text(res, 200, {isError: true, content: [{type: 'text', text: e.message}]}); }
  });
  await new Promise((resolve, reject) => { internal.once('error', reject); internal.listen(socket, resolve); });
  await chmod(socket, 0o600);
  await new Promise((resolve, reject) => { viewer.once('error', reject); viewer.listen(port, host, resolve); });
  let ticking = false;
  const timer = setInterval(async () => {
    sessions.prune();
    for (const client of sockets) if (!sessions.valid(client.sessionToken)) client.terminate();
    if (ticking) return;
    ticking = true;
    try { await lifecycle.tick(); } catch { console.error('Browser lifecycle transition failed.'); }
    finally { ticking = false; }
  }, 1000);
  timer.unref();
  return {control, browser, lifecycle, sessions, viewer, socket, close: async () => {
    clearInterval(timer);
    for (const ws of sockets) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await Promise.all([new Promise(resolve => viewer.close(resolve)), new Promise(resolve => internal.close(resolve))]);
    await browser.disconnect();
    await runtime?.stop();
    await unlink(socket).catch(() => {});
  }};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await start({managed: process.env.ABB_MANAGED_BROWSER === '1', warningMs: Number(process.env.ABB_IDLE_GRACE_SECONDS || 120) * 1000, policyFile: process.env.ABB_MANAGED_BROWSER === '1' ? '/data/idle-policy.json' : undefined, idleMs: Number(process.env.ABB_IDLE_MINUTES || 30) * 60000, secureCookies: process.env.ABB_SECURE_COOKIES === '1', host: process.env.ABB_LISTEN || '127.0.0.1', socket: process.env.ABB_SOCKET, hosts: (process.env.ABB_ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]').split(',')});
  console.error('Agentic Browser Bridge viewer ready; control starts with human.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().then(() => process.exit(0)); });
}

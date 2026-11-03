import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {scryptSync} from 'node:crypto';
import {WebSocket} from 'ws';
import {start} from '../src/server.js';

test('screen proxy authenticates upgrades, rejects foreign origins and forwards raw VNC', {timeout: 10000}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-viewer-'));
  const tcp = net.createServer(socket => { socket.write('RFB 003.008\n'); socket.on('data', data => socket.write(data)); });
  await new Promise(resolve => tcp.listen(0, '127.0.0.1', resolve));
  const passwordHash = '00'.repeat(16) + ':' + scryptSync('fixture-password', Buffer.alloc(16), 64).toString('hex');
  const app = await start({port: 0, socket: path.join(dir, 'control.sock'), passwordHash, vncPort: tcp.address().port});
  const host = `127.0.0.1:${app.viewer.address().port}`;
  const origin = 'http://' + host;
  const cookie = `${app.sessions.name}=${app.sessions.login('fixture-password')}`;
  let client;
  const rejected = headers => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}/websockify`, {headers});
    ws.on('unexpected-response', (_req, res) => { const status = res.statusCode; res.resume(); ws.terminate(); resolve(status); });
    ws.on('error', () => {});
    ws.on('open', () => { ws.terminate(); reject(Error('Unauthorized upgrade succeeded.')); });
  });
  try {
    assert.equal(await rejected({Origin: origin}), 403);
    assert.equal(await rejected({Origin: 'https://evil.test', Cookie: cookie}), 403);
    assert.equal(await rejected({Cookie: cookie}), 403);
    client = new WebSocket(`ws://${host}/websockify`, {headers: {Origin: origin, Cookie: cookie}});
    const greeting = await new Promise((resolve, reject) => { client.once('message', resolve); client.once('error', reject); });
    assert.equal(greeting.toString(), 'RFB 003.008\n');
    const echo = new Promise(resolve => client.once('message', resolve));
    client.send(Buffer.from('client-data'));
    assert.equal((await echo).toString(), 'client-data');
    const status = await new Promise(resolve => {
      http.get(origin + '/api/status', {headers: {Cookie: cookie}}, response => { response.resume(); resolve(response.statusCode); });
    });
    assert.equal(status, 200);
  } finally {
    client?.terminate(); await app.close();
    await new Promise(resolve => tcp.close(resolve)); await rm(dir, {recursive: true, force: true});
  }
});

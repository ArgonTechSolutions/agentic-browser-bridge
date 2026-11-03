import test from 'node:test';
import assert from 'node:assert/strict';
import {Control} from '../src/control.js';
import {validateArgs} from '../src/browser.js';
import {allowedRequest} from '../src/server.js';

test('human ownership blocks all browser access until explicitly returned', async () => {
  const c = new Control();
  await assert.rejects(c.run(() => 'secret'), /Human control/);
  c.returnToAgent(); assert.equal(await c.run(() => 'ok'), 'ok');
  await c.takeHuman('Authentication required');
  await assert.rejects(c.run(() => 'secret'), /Human control/);
  assert.equal(c.status().reason, 'Authentication required');
});
test('takeover immediately closes admission then drains an active operation', async () => {
  const c = new Control(); c.returnToAgent();
  let finish;
  const operation = c.run(() => new Promise(resolve => { finish = resolve; }));
  let handedOver = false;
  const takeover = c.takeHuman().then(() => { handedOver = true; });
  await assert.rejects(c.run(() => 1), /Human control/);
  assert.throws(() => c.returnToAgent(), /Wait/);
  assert.equal(handedOver, false);
  finish(); await operation; await takeover;
  assert.equal(handedOver, true); assert.equal(c.status().active, false);
});
test('concurrent tool calls cannot compete and failures release control', async () => {
  const c = new Control(); c.returnToAgent();
  let finish;
  const active = c.run(() => new Promise(resolve => { finish = resolve; }));
  await assert.rejects(c.run(() => 1), /busy/); finish(); await active;
  await assert.rejects(c.run(() => { throw Error('test'); }));
  assert.equal(c.status().active, false);
});
test('rejects unsupported URLs, malformed tabs, unknown tools and arguments', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com']) assert.throws(() => validateArgs('browser_open', {url}));
  assert.throws(() => validateArgs('browser_snapshot', {tab: 1.5}));
  assert.throws(() => validateArgs('browser_fill', {tab: 1, selector: '#x', text: 'x', arbitrary: true}));
  assert.throws(() => validateArgs('arbitrary_eval', {}));
  validateArgs('browser_open', {url: 'http://localhost:3000/'});
});
test('viewer rejects DNS rebinding, cross-origin control, and cross-site fetches', () => {
  const allowed = headers => allowedRequest({headers}, ['localhost', '127.0.0.1']);
  assert.equal(allowed({host: 'localhost:17080', origin: 'http://localhost:17080'}), true);
  assert.equal(allowed({host: 'evil.test:17080'}), false);
  assert.equal(allowed({host: 'localhost:17080', origin: 'https://evil.test'}), false);
  assert.equal(allowed({host: 'localhost:17080', origin: 'null'}), false);
  assert.equal(allowed({host: 'localhost:17080', 'sec-fetch-site': 'cross-site'}), false);
});

test('viewer authentication rejects missing and incorrect credentials', async () => {
  const {scryptSync} = await import('node:crypto');
  const {Sessions, checkHash} = await import('../src/auth.js');
  const hash = '00'.repeat(16) + ':' + scryptSync('fixture-password', Buffer.alloc(16), 64).toString('hex');
  const sessions = new Sessions(hash);
  const req = token => ({headers: {cookie: `${sessions.name}=${token}`}});
  assert.throws(() => checkHash(''));
  assert.equal(sessions.authenticated({headers: {}}), false);
  assert.equal(sessions.login('wrong'), undefined);
  assert.equal(sessions.authenticated(req('unknown')), false);
  assert.equal(sessions.authenticated(req(sessions.login('fixture-password'))), true);
});

test('agent workflow and pending human handoff remain protected until explicit completion', async()=>{
 const {BrowserTools}=await import('../src/browser.js');const control=new Control();const browser=new BrowserTools(control);
 control.returnToAgent();await browser.call('browser_request_human',{reason:'Waiting on approval'});assert.equal(control.waitingForHuman,true);
 await browser.call('browser_release',{});assert.equal(control.waitingForHuman,false);assert.equal(control.mode,'human');
});

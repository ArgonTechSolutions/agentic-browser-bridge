import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {scryptSync} from 'node:crypto';
import {chromium} from 'playwright-core';
import {start} from '../src/server.js';

// Synthetic screen transport isolates ownership UI behavior. Container smoke tests
// separately exercise the real noVNC transport and human keyboard input.
const screenTransport = `export default class RFB extends EventTarget {
  constructor(target) { super(); this.viewOnly=true; const canvas=document.createElement('canvas'); canvas.width=1440;canvas.height=900;target.append(canvas);window.__rfb=this;setTimeout(()=>this.dispatchEvent(new Event('connect')),20); }
  disconnect() { this.dispatchEvent(new Event('disconnect')); }
}`;

test('single ownership switch handles keyboard, active handoff, recovery and responsive layout', {timeout: 45000}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-ui-'));
  const hash = '00'.repeat(16) + ':' + scryptSync('fixture-password', Buffer.alloc(16), 64).toString('hex');
  const app = await start({port: 0, socket: path.join(dir, 'control.sock'), passwordHash: hash});
  let browser, finish;
  try {
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
    const context = await browser.newContext({viewport: {width: 1280, height: 800}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/novnc/core/rfb.js', route => route.fulfill({contentType: 'text/javascript', body: screenTransport}));
    await page.goto(`http://127.0.0.1:${app.viewer.address().port}`);
    await page.getByLabel('Workspace password').fill('fixture-password');
    await page.getByRole('button', {name:'Sign in', exact:true}).click();
    await page.waitForFunction(() => document.getElementById('notice')?.hidden);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.fonts.check('600 13px Manrope')));
    const toggle = page.getByRole('switch', {name: 'Agent control'});
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    assert.equal(await page.evaluate(() => window.__rfb.viewOnly), false);
    await toggle.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => document.getElementById('control').getAttribute('aria-checked') === 'true');
    await page.waitForFunction(() => !document.getElementById('control').disabled && document.getElementById('control').getAttribute('aria-busy') === 'false');
    assert.equal(app.control.mode, 'agent');
    assert.equal(await page.evaluate(() => window.__rfb.viewOnly), true);

    if (process.env.ABB_PREVIEW_DIR) {
      await mkdir(process.env.ABB_PREVIEW_DIR, {recursive: true});
      await page.screenshot({path: path.join(process.env.ABB_PREVIEW_DIR, 'browser-controls-agent.png'), clip: {x:0,y:0,width:1280,height:84}});
    }
    const active = app.control.run(() => new Promise(resolve => { finish = resolve; }));
    await toggle.click();
    await page.getByText('Taking control…', {exact: true}).waitFor();
    assert.equal(await toggle.isEnabled(), false);
    assert.equal(await page.evaluate(() => window.__rfb.viewOnly), true);
    finish(); finish = undefined; await active;
    await page.getByText('Human control', {exact: true}).waitFor();
    await page.waitForFunction(() => !document.getElementById('control').disabled);
    assert.equal(await page.evaluate(() => window.__rfb.viewOnly), false);

    // A failed status fetch disables stale controls and makes the stream view-only.
    await page.route('**/api/status', route => route.fulfill({status: 503, body: '{}'}));
    await page.getByText('Connection lost', {exact: true}).waitFor();
    assert.equal(await toggle.isEnabled(), false);
    assert.equal(await page.evaluate(() => window.__rfb.viewOnly), true);
    await page.unroute('**/api/status');
    await page.getByText('Human control', {exact: true}).waitFor();
    // Responses slower than the polling interval must still update ownership.
    await page.route('**/api/status', async route => {
      await new Promise(resolve => setTimeout(resolve, 1200));
      await route.continue();
    });
    app.control.returnToAgent();
    await page.getByText('Agent control', {exact: true}).waitFor({timeout: 8000});
    await page.unroute('**/api/status');
    await toggle.click();
    await page.getByText('Human control', {exact: true}).waitFor();
    await page.evaluate(() => window.__rfb.dispatchEvent(new Event('disconnect')));
    await page.getByRole('button', {name: 'Reconnect', exact: true}).click();
    await page.waitForFunction(() => document.getElementById('notice').hidden);
    await page.setViewportSize({width: 320, height: 640});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await toggle.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    assert.equal(await page.locator('footer,h1').count(), 0);
    assert.equal(await page.getByRole('button', {name: 'Reconnect', exact: true}).isVisible(), false);
    if (process.env.ABB_PREVIEW_DIR) await page.screenshot({path: path.join(process.env.ABB_PREVIEW_DIR, 'browser-controls-mobile.png'), clip: {x:0,y:0,width:320,height:84}});
    const idle = page.getByRole('switch', {name:'Idle shutdown',exact:true});
    const idleBounds=await idle.boundingBox();const ownerBounds=await toggle.boundingBox();
    assert.ok(idleBounds.x < ownerBounds.x);assert.ok(idleBounds.width>=44 && idleBounds.height>=44);
    await idle.click();await page.waitForFunction(()=>document.getElementById('idle').getAttribute('aria-checked')==='false');
    assert.equal(app.lifecycle.enabled,false);
    await page.reload();await page.waitForFunction(()=>!document.getElementById('idle').disabled);
    assert.equal(await idle.getAttribute('aria-checked'),'false');
    await page.evaluate(()=>fetch('/api/logout',{method:'POST',headers:{'X-ABB-Control':'1'}}));
    await page.goto(`http://127.0.0.1:${app.viewer.address().port}`);
    await page.getByLabel('Workspace password').fill('fixture-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByText('Your browser is set to keep running. Do you still need it?',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Enable idle shutdown',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('idle').getAttribute('aria-checked')==='true');
    assert.equal(app.lifecycle.enabled,true);
    assert.deepEqual(errors, []);
  } finally {
    finish?.();
    await browser?.close(); await app.close(); await rm(dir, {recursive: true, force: true});
  }
});

// Run inside the built disposable image, where /usr/local/bin/abb-browser exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Runtime} from '../src/runtime.js';

test('packaged managed browser applies proxy flags and refuses direct fallback', {timeout: 45000}, async () => {
  process.env.ABB_PROXY_SERVER = 'http://unavailable.proxy.invalid:1055';
  const runtime = new Runtime();
  try {
    await runtime.start();
    const args = [];
    for (const entry of await fs.readdir('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try { args.push(await fs.readFile(`/proc/${entry}/cmdline`, 'utf8')); } catch {}
    }
    assert.ok(args.some(value => value.includes('--proxy-server=http://unavailable.proxy.invalid:1055') && value.includes('--user-data-dir=/data/profile')));
    const page = await runtime.browser.contexts()[0].newPage();
    await assert.rejects(page.goto('http://destination.proxy-fixture.invalid/', {timeout: 10000}), /ERR_PROXY_CONNECTION_FAILED/);
  } finally {await runtime.stop();}
});

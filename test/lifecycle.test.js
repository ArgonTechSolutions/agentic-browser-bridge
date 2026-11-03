import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Lifecycle} from '../src/lifecycle.js';

test('idle requires no viewer, active work or download, followed by a cancellable grace period', async () => {
  let now = 0, blockers = [], stops = 0;
  const l = new Lifecycle({idleMs:1000, warningMs:200, clock:()=>now, blockers:()=>blockers, stop:async()=>{stops++;}});
  await l.wake();
  for (const blocker of ['connected viewer','agent operation','download']) {
    blockers = [blocker]; now += 2000; await l.tick(); assert.equal(stops,0); assert.equal(l.status().shutdownAt,null);
  }
  blockers = []; now += 1000; await l.tick(); assert.equal(l.status().shutdownAt, now+200);
  blockers = ['connected viewer']; now += 201; await l.tick(); assert.equal(stops,0);
  blockers = []; now += 1000; await l.tick(); now += 200; await l.tick(); assert.equal(stops,1); assert.equal(l.phase,'sleeping');
  await l.wake(); assert.equal(l.phase,'running');
});
test('keep-running persists across restart and blocks shutdown until explicitly re-enabled', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'abb-policy-'));
  try {
    const file = path.join(dir,'policy.json'); let now = 0;
    const a = new Lifecycle({policyFile:file,idleMs:1000,clock:()=>now});
    await a.setEnabled(false);
    const b = new Lifecycle({policyFile:file,idleMs:1000,clock:()=>now}); await b.load(); await b.wake();
    now = 90000; await b.tick(); assert.equal(b.phase,'running'); assert.equal(b.enabled,false);
    await b.setEnabled(true); now += 1001; await b.tick(); assert.ok(b.status().shutdownAt);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('wake waits for an in-flight sleep and cannot race teardown', async () => {
  let now=0, finish, starts=0;
  const l = new Lifecycle({idleMs:1000,warningMs:0,clock:()=>now,start:async()=>{starts++;},stop:()=>new Promise(r=>{finish=r;})});
  await l.wake(); now=1001; const sleep=l.tick(); assert.equal(l.phase,'stopping');
  const wake=l.wake(); assert.equal(starts,1); finish(); await sleep; await wake; assert.equal(starts,2); assert.equal(l.phase,'running');
});

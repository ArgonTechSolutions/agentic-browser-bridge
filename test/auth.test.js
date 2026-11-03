import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {start} from '../src/server.js';
import {Sessions} from '../src/auth.js';
const hash='00'.repeat(16)+':'+scryptSync('fixture-password',Buffer.alloc(16),64).toString('hex');
test('sessions expire, logout revokes, cookies are private, and verification is rate bounded',()=>{
 let now=0; const s=new Sessions(hash,{secure:true,clock:()=>now,lifetime:1000}); const token=s.login('fixture-password');
 assert.match(s.cookie(token,{headers:{host:'viewer.private.test'}}),/; Secure/);
 assert.ok(s.valid(token)); assert.match(s.cookie(token),/HttpOnly; SameSite=Strict; Max-Age=1; Secure/);
 now=1001; assert.equal(s.valid(token),false); s.prune(); assert.equal(s.tokens.size,0);
 const again=s.login('fixture-password'); s.logout({headers:{cookie:`${s.name}=${again}`}}); assert.equal(s.valid(again),false);
 for(let n=0;n<10;n++)s.login('wrong'); assert.equal(s.login('fixture-password'),undefined);
 now+=60001;assert.ok(s.login('fixture-password'));
});
test('password login replaces Basic challenge; CSRF rejected and authenticated wake/idle works',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'abb-auth-')); const app=await start({port:0,socket:path.join(dir,'control.sock'),passwordHash:hash});
 const origin=`http://127.0.0.1:${app.viewer.address().port}`;
 const post=(url,body,cookie,foreign=false)=>fetch(origin+url,{method:'POST',headers:{'Content-Type':'application/json','X-ABB-Control':'1',Origin:foreign?'https://foreign.test':origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 try{
  const root=await fetch(origin); assert.equal(root.status,200); assert.equal(root.headers.get('www-authenticate'),null); assert.match(await root.text(),/Workspace password/);
  assert.equal((await fetch(origin+'/api/status')).status,401);
  assert.equal((await post('/api/login',{password:'fixture-password'},null,true)).status,403);
  const login=await post('/api/login',{password:'fixture-password'}); assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(origin+'/api/status',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await post('/api/idle',{enabled:false},cookie,true)).status,403);
  assert.equal((await post('/api/idle',{enabled:false},cookie)).status,200);assert.equal(app.lifecycle.enabled,false);
  await post('/api/logout',{},cookie);assert.equal((await fetch(origin+'/api/status',{headers:{Cookie:cookie}})).status,401);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

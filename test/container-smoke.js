// Run only against a disposable CI workspace and synthetic browser profile.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const container = process.env.ABB_TEST_CONTAINER || 'abb-smoke';
const viewerURL = 'http://127.0.0.1:17080';
const client = new Client({name: 'container-smoke', version: '1.0.0'});
let browser;
try {
  assert.equal((await fetch(viewerURL + '/api/status')).status, 401);
  await client.connect(new StdioClientTransport({command: 'docker', args: ['exec', '-i', '--user', 'node', container, 'node', '/app/src/mcp.js']}));
  const call = (name, args = {}) => client.callTool({name, arguments: args});
  assert.equal((await call('browser_tabs')).isError, true);
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  const context = await browser.newContext({viewport: {width: 1600, height: 1100}});
  const viewer = await context.newPage();
  const pageErrors = [];
  viewer.on('pageerror', e => pageErrors.push(e.message));
  await viewer.goto(viewerURL);
  await viewer.getByLabel('Workspace password').fill('fixture-password');
  await viewer.getByRole('button', {name:'Sign in', exact:true}).click();
  await viewer.getByRole('switch', {name: 'Agent control'}).waitFor();
  await viewer.waitForFunction(()=>!document.getElementById('idle').disabled);
  if (await viewer.getByRole('button',{name:'Wake browser',exact:true}).isVisible()) await viewer.getByRole('button',{name:'Wake browser',exact:true}).click();
  await viewer.locator('#screen canvas').waitFor();
  await viewer.waitForFunction(() => document.querySelector('#screen canvas')?.width > 100);
  await viewer.getByRole('switch', {name: 'Agent control'}).click();
  await viewer.getByText('Agent control', {exact: true}).waitFor();
  const fixture = `<title>Bridge smoke fixture</title><form onsubmit="localStorage.setItem('name',document.querySelector('#name').value);document.querySelector('#result').textContent=localStorage.name;return false"><label>Name <input id="name"></label><button>Save</button></form><p id="result"></p><script>document.querySelector("#result").textContent=localStorage.name||""</script>`;
  execFileSync('docker', ['exec', container, 'node', '-e', `require('fs').writeFileSync('/tmp/fixture.html', ${JSON.stringify(fixture)})`]);
  execFileSync('docker', ['exec', '-d', container, 'node', '-e', "require('http').createServer((q,s)=>{if(q.url==='/download'){s.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename=fixture.bin'});let n=0;const t=setInterval(()=>{s.write(Buffer.alloc(1024));if(++n===12){clearInterval(t);s.end();}},500);}else s.end(require('fs').readFileSync('/tmp/fixture.html'));}).listen(18081,'127.0.0.1')"]);
  const opened = await call('browser_open', {url: 'http://127.0.0.1:18081'});
  assert.ok(!opened.isError, JSON.stringify(opened));
  const {tab} = JSON.parse(opened.content[0].text);
  await call('browser_fill', {tab, selector: '#name', text: 'agent'});
  await call('browser_request_human', {reason: 'Human keyboard intervention test'});
  await viewer.getByText('Human control', {exact: true}).waitFor();
  await viewer.waitForTimeout(1200);
  assert.equal((await call('browser_snapshot', {tab})).isError, true);
  await viewer.locator('#screen canvas').focus();
  await viewer.keyboard.press('Control+a');
  await viewer.keyboard.type('human');
  await viewer.keyboard.press('Enter');
  await viewer.getByRole('switch', {name: 'Agent control'}).click();
  await viewer.getByText('Agent control', {exact: true}).waitFor();
  assert.match((await call('browser_snapshot', {tab})).content[0].text, /human/);
  assert.equal((await call('browser_screenshot', {tab})).content[0].type, 'image');
  await viewer.screenshot({path: '/tmp/abb-viewer-smoke.png'});
  assert.deepEqual(pageErrors, []);
  // A viewer blocks idle shutdown even when it receives no input.
  await viewer.waitForTimeout(5000);
  const live = JSON.parse((await call('browser_status')).content[0].text);
  assert.equal(live.phase, 'running'); assert.ok(live.blockers.includes('connected viewer'));
  const cookies = await context.cookies();
  const cookie = cookies.map(c=>`${c.name}=${c.value}`).join('; ');
  await call('browser_open',{url:'http://127.0.0.1:18081/download'});
  await call('browser_release');
  await context.close();
  await new Promise(r=>setTimeout(r,2000));
  const downloading=JSON.parse((await call('browser_status')).content[0].text);
  assert.equal(downloading.phase,'running');assert.ok(downloading.blockers.includes('download in progress'));
  // Status polling and a persistent MCP client must not keep a browser awake.
  let sleeping;
  for (let n=0;n<20;n++) {
    sleeping=JSON.parse((await call('browser_status')).content[0].text);
    if (sleeping.phase==='sleeping') break;
    await new Promise(r=>setTimeout(r,500));
  }
  assert.equal(sleeping.phase,'sleeping');
  assert.equal((await call('browser_tabs')).isError,true);
  const awakened=await fetch(viewerURL+'/api/wake',{method:'POST',headers:{'Content-Type':'application/json','X-ABB-Control':'1',Origin:viewerURL,Cookie:cookie},body:'{}'});
  assert.equal(awakened.status,200);
  const awake=await awakened.json(); assert.equal(awake.phase,'running');assert.equal(awake.mode,'human');
  const resumed=await fetch(viewerURL+'/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-ABB-Control':'1',Origin:viewerURL,Cookie:cookie},body:'{"mode":"agent"}'});
  assert.equal(resumed.status,200);
  const restored=await call('browser_tabs');assert.ok(!restored.isError,JSON.stringify(restored));
  const restoredTabs=JSON.parse(restored.content[0].text);const fixtureTab=restoredTabs.find(t=>t.url==='http://127.0.0.1:18081/');assert.ok(fixtureTab,JSON.stringify(restoredTabs));
  assert.ok(!(await call('browser_navigate',{tab:fixtureTab.tab,url:'http://127.0.0.1:18081/'})).isError);
  assert.match((await call('browser_snapshot',{tab:fixtureTab.tab})).content[0].text,/human/);
  await client.close();
  console.log('PASS: authenticated viewer/WebSocket, actual noVNC keyboard takeover, same-tab MCP continuation, screenshot, viewer idle protection, actual sleep/wake and restored profile.');
} catch(error) {
  try { console.error(execFileSync('docker',['logs',container],{encoding:'utf8'})); console.error(execFileSync('docker',['exec',container,'sh','-c','cat /tmp/chromium.log /tmp/x11vnc.log'],{encoding:'utf8'})); } catch {}
  throw error;
} finally { await client.close(); await browser?.close(); }

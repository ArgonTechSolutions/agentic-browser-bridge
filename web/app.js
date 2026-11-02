import RFB from '/novnc/core/rfb.js';
const $ = id => document.getElementById(id);
let rfb;
let state;
let screenMessage = 'Connecting screen…';
let switching = false;
function render() {
  if (!state) return;
  $('mode').textContent = state.mode === 'human' ? 'Human control' : 'Agent control';
  $('human').disabled = switching || (state.mode === 'human' && !state.active);
  $('agent').disabled = switching || state.active || state.mode === 'agent';
  if (rfb) rfb.viewOnly = state.mode !== 'human' || state.active;
  $('reason').textContent = state.active && state.mode === 'human' ? 'Pausing agent action before enabling your input…' : state.reason || (state.mode === 'agent' ? 'Agent has control. Take control before interacting.' : screenMessage);
}
function connect() {
  rfb?.disconnect();
  $('screen').replaceChildren();
  rfb = new RFB($('screen'), `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/websockify`, {shared: true});
  rfb.scaleViewport = true;
  rfb.resizeSession = false;
  rfb.viewOnly = true;
  rfb.addEventListener('connect', () => { screenMessage = 'You have control.'; render(); });
  rfb.addEventListener('disconnect', () => { screenMessage = 'Screen disconnected. Reconnect to view the running workspace.'; $('reason').textContent = screenMessage; });
  render();
}
async function refresh() {
  try {
    const res = await fetch('/api/status', {cache: 'no-store'});
    if (!res.ok) throw new Error('Workspace unavailable.');
    state = await res.json(); render();
  } catch (e) { if (rfb) rfb.viewOnly = true; $('reason').textContent = e.message; }
}
async function setMode(mode) {
  switching = true; render();
  try {
    const res = await fetch('/api/control', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-ABB-Control': '1'}, body: JSON.stringify({mode})});
    state = await res.json();
    if (!res.ok) throw new Error(state.error || 'Control change failed.');
  } catch (e) { $('reason').textContent = e.message; }
  finally { switching = false; await refresh(); }
}
$('human').onclick = () => setMode('human');
$('agent').onclick = () => setMode('agent');
$('reconnect').onclick = connect;
await refresh(); connect(); setInterval(refresh, 1000);

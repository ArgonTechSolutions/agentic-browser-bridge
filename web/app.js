import RFB from '/novnc/core/rfb.js';
const $ = id => document.getElementById(id);
let rfb;
let state;
let available = false;
let switching = false;
let requestedMode;
let screenState = 'connecting';
let controlError = '';
let refreshSequence = 0;

function render() {
  const draining = state?.mode === 'human' && state.active;
  const takingControl = (switching && requestedMode === 'human') || draining;
  $('mode').textContent = !available ? (state ? 'Connection lost' : 'Connecting…')
    : takingControl ? 'Taking control…' : state.mode === 'human' ? 'Human control' : 'Agent control';
  document.body.dataset.owner = state?.mode || 'unknown';
  document.body.dataset.available = String(available);
  $('control').setAttribute('aria-checked', String(state?.mode === 'agent'));
  $('control').setAttribute('aria-busy', String(switching || Boolean(draining)));
  $('control').disabled = !available || switching || Boolean(draining);
  $('control').title = !available ? 'Waiting for the workspace' : state.mode === 'agent' ? 'Take control' : state.reason || 'Give control to the agent';
  if (rfb) rfb.viewOnly = !available || state?.mode !== 'human' || Boolean(state.active);

  let message = controlError;
  if (!available) message = state ? 'Workspace unavailable. Retrying…' : 'Connecting to the workspace…';
  else if (screenState === 'disconnected') message = 'Screen disconnected.';
  else if (screenState === 'connecting') message = 'Connecting to the browser…';
  $('notice').hidden = !message;
  $('message').textContent = message;
  $('reconnect').hidden = screenState !== 'disconnected';
}

function connect() {
  // Ignore late events from a replaced connection.
  const previous = rfb;
  rfb = undefined;
  previous?.disconnect();
  $('screen').replaceChildren();
  screenState = 'connecting';
  const connection = new RFB($('screen'), `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/websockify`, {shared: true});
  rfb = connection;
  connection.scaleViewport = true;
  connection.resizeSession = false;
  connection.viewOnly = true;
  connection.addEventListener('connect', () => {
    if (rfb !== connection) return;
    screenState = 'connected'; render();
  });
  connection.addEventListener('disconnect', () => {
    if (rfb !== connection) return;
    screenState = 'disconnected'; render();
  });
  render();
}

async function refresh() {
  const sequence = ++refreshSequence;
  try {
    const res = await fetch('/api/status', {cache: 'no-store'});
    if (!res.ok) throw new Error('Workspace unavailable.');
    const result = await res.json();
    if (sequence !== refreshSequence) return;
    state = result;
    available = true;
  } catch {
    if (sequence !== refreshSequence) return;
    available = false;
  }
  render();
}

async function setMode(mode) {
  switching = true;
  requestedMode = mode;
  controlError = '';
  render();
  try {
    const res = await fetch('/api/control', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-ABB-Control': '1'}, body: JSON.stringify({mode})});
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not change control. Try again.');
    ++refreshSequence;
    state = result;
  } catch (e) {
    controlError = e.message;
  } finally {
    switching = false;
    requestedMode = undefined;
    await refresh();
  }
}
$('control').onclick = () => setMode(state.mode === 'agent' ? 'human' : 'agent');
$('reconnect').onclick = connect;
await refresh();
connect();
setInterval(refresh, 1000);

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
let refreshing = false;
let reminderPending = sessionStorage.getItem('abb-show-reminder') === '1';
sessionStorage.removeItem('abb-show-reminder');

function render() {
  const sleeping = Boolean(state?.phase && state.phase !== 'running');
  $('sleep').hidden = !available || !sleeping;
  $('sleep-message').textContent = state?.phase === 'sleeping' ? 'Browser sleeping' : state?.phase === 'error' ? 'Browser needs attention. Check workspace logs.' : 'Preparing browser…';
  $('wake').disabled = state?.phase !== 'sleeping';
  $('idle').disabled = !available;
  $('idle').setAttribute('aria-checked', String(state?.idleShutdown !== false));
  $('idle').title = state?.idleShutdown === false ? 'Keep running enabled' : `Sleep after ${state?.idleMinutes || 30} minutes after workflow release, with no viewer or download`;
  if (available && reminderPending) { $('reminder').hidden = state.idleShutdown !== false; reminderPending = false; }
  const draining = state?.mode === 'human' && state.active;
  const takingControl = (switching && requestedMode === 'human') || draining;
  $('mode').textContent = !available ? (state ? 'Connection lost' : 'Connecting…')
    : takingControl ? 'Taking control…' : state.mode === 'human' ? 'Human control' : 'Agent control';
  document.body.dataset.owner = state?.mode || 'unknown';
  document.body.dataset.available = String(available);
  $('control').setAttribute('aria-checked', String(state?.mode === 'agent'));
  $('control').setAttribute('aria-busy', String(switching || Boolean(draining)));
  $('control').disabled = !available || sleeping || switching || Boolean(draining);
  $('control').title = !available ? 'Waiting for the workspace' : state.mode === 'agent' ? 'Take control' : state.reason || 'Give control to the agent';
  if (rfb) rfb.viewOnly = !available || state?.mode !== 'human' || Boolean(state.active);

  let message = controlError;
  if (!available) message = state ? 'Workspace unavailable. Retrying…' : 'Connecting to the workspace…';
  else if (sleeping) message = '';
  else if (state.shutdownAt) message = 'Browser will sleep soon. Open the viewer or enable Keep running to cancel.';
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
  if (refreshing) return;
  refreshing = true;
  const sequence = refreshSequence;
  try {
    const res = await fetch('/api/status', {cache: 'no-store'});
    if (res.status === 401) { location.replace('/'); return; }
    if (!res.ok) throw new Error('Workspace unavailable.');
    const result = await res.json();
    if (sequence !== refreshSequence) return;
    const wasRunning = state?.phase === 'running';
    state = result;
    available = true;
    if (state.phase && state.phase !== 'running' && rfb) { const previous = rfb; rfb = undefined; previous.disconnect(); }
    else if (state.phase === 'running' && !wasRunning && !rfb) connect();
  } catch {
    if (sequence !== refreshSequence) return;
    available = false;
  } finally {
    refreshing = false;
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
    available = false;
  } finally {
    switching = false;
    requestedMode = undefined;
    render();
    await refresh();
  }
}
$('control').onclick = () => setMode(state.mode === 'agent' ? 'human' : 'agent');
$('reconnect').onclick = connect;
async function post(endpoint, body = {}) {
  try {
    const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json','X-ABB-Control':'1'}, body:JSON.stringify(body)});
    if (response.status === 401) { location.replace('/'); return; }
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Request failed.');
    ++refreshSequence; state = result; available = true; render(); await refresh();
  } catch(e) { controlError = e.message; render(); }
}
$('idle').onclick = () => post('/api/idle', {enabled:state.idleShutdown === false});
$('enable-idle').onclick = async () => { await post('/api/idle', {enabled:true}); $('reminder').hidden = true; };
$('keep-running').onclick = () => { $('reminder').hidden = true; };
$('wake').onclick = async () => { $('wake').disabled = true; await post('/api/wake'); if (!rfb && state?.phase === 'running') connect(); };

await refresh();
if (!rfb && (!state?.phase || state.phase === 'running')) connect();
setInterval(refresh, 1000);

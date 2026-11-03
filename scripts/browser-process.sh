#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p /tmp/abb /data/profile /data/downloads
# A fresh container has no surviving Chromium process. Remove only its stale lock links.
rm -f /data/profile/SingletonLock /data/profile/SingletonSocket /data/profile/SingletonCookie
pids=()
cleanup() { trap - EXIT TERM INT; kill -TERM "${pids[-1]}" 2>/dev/null || true; wait "${pids[-1]}" 2>/dev/null || true; kill -TERM "${pids[@]}" 2>/dev/null || true; wait || true; }
trap cleanup EXIT TERM INT
Xvfb :99 -screen 0 1440x900x24 -nolisten tcp & pids+=("$!")
for _ in {1..100}; do [[ -S /tmp/.X11-unix/X99 ]] && break; sleep .1; done
[[ -S /tmp/.X11-unix/X99 ]] || { echo 'Display failed to start.' >&2; exit 1; }
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const dir = '/data/profile/Default';
fs.mkdirSync(dir, {recursive: true});
const file = dir + '/Preferences';
let prefs = {};
if (fs.existsSync(file)) prefs = JSON.parse(fs.readFileSync(file));
prefs.download = {...prefs.download, default_directory: '/data/downloads'};
fs.writeFileSync(file, JSON.stringify(prefs), {mode: 0o600});
NODE
openbox >/tmp/openbox.log 2>&1 & pids+=("$!")
x11vnc -display :99 -localhost -rfbport 5900 -nopw -forever -shared -noxdamage >/tmp/x11vnc.log 2>&1 & pids+=("$!")
# Chromium's sandbox is unavailable with the container's no-new-privileges policy.
# Isolation comes from this unprivileged, capability-dropped container. See SECURITY.md.
chromium --no-sandbox --disable-dev-shm-usage --no-first-run --no-default-browser-check \
  --password-store=basic --user-data-dir=/data/profile --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 --window-size=1440,850 --restore-last-session --disable-session-crashed-bubble \
  about:blank >/tmp/chromium.log 2>&1 & pids+=("$!")
# Fail the workspace if a required component exits; Docker handles restart policy.
wait -n "${pids[@]}"
exit 1

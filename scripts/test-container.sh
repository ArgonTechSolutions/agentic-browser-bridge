#!/usr/bin/env bash
# Disposable CI environment only; no real browser profiles or credentials.
set -euo pipefail
image=${1:?Usage: test-container.sh IMAGE}
cleanup() { docker rm -f abb-smoke >/dev/null 2>&1 || true; }
trap cleanup EXIT
hash=$(node --input-type=module -e "import {scryptSync} from 'node:crypto'; console.log('00'.repeat(16)+':'+scryptSync('fixture-password',Buffer.alloc(16),64).toString('hex'))")
docker run -d --name abb-smoke --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 1536m --pids-limit 256 --shm-size 256m \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,mode=1777 \
  -p 127.0.0.1:17080:8080 -e ABB_VIEWER_PASSWORD_HASH="$hash" "$image"
ready=false
for _ in {1..90}; do
  state=$(docker inspect --format '{{.State.Health.Status}}' abb-smoke)
  if [[ "$state" == healthy ]]; then ready=true; break; fi
  [[ "$state" == unhealthy ]] && break
  sleep 2
done
if [[ "$ready" != true ]]; then
  docker logs abb-smoke
  docker exec abb-smoke cat /tmp/chromium.log /tmp/x11vnc.log || true
  exit 1
fi
npx playwright-core install --with-deps chromium
CHROMIUM_PATH=$(node --input-type=module -e "import {chromium} from 'playwright-core'; console.log(chromium.executablePath())")
export CHROMIUM_PATH
npm run test:ui
npm run test:browser
node test/container-smoke.js
ABB_VIEWER_PASSWORD_HASH="$hash" docker compose config --quiet

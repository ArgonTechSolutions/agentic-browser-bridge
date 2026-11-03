#!/usr/bin/env bash
# Bounded, unenrolled official-image smoke. Only this disposable project's
# containers/network/volume are removed. No auth key or real tailnet is used.
set -euo pipefail
app_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
project="abb-proxy-smoke-$$"
compose() { docker compose -p "$project" -f "$app_dir/connectors/tailscale/compose.yaml" "$@"; }
cleanup() { compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT
compose config --format json | python3 -c '
import json,sys
c=json.load(sys.stdin); s=c["services"]["tailscale-proxy"]
assert not s.get("ports") and not s.get("privileged")
assert not s.get("devices") and not s.get("cap_add")
assert s["cap_drop"] == ["ALL"] and s["read_only"]
assert s.get("network_mode") != "host"
assert len(s["volumes"]) == 1 and s["volumes"][0]["target"] == "/var/lib/tailscale"
print("Connector Compose isolation: passed")'
compose up -d
ready=false
for _ in {1..20}; do
  if compose exec -T tailscale-proxy tailscale --socket=/tmp/tailscaled.sock status --json 2>/dev/null | python3 -c 'import json,sys; assert json.load(sys.stdin)["BackendState"] == "NeedsLogin"' 2>/dev/null; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { compose logs --tail=30; exit 1; }
# Probe both protocol handshakes over the connector's private Docker network.
# This disposable client needs Node only; no credentials or device enrollment.
network="${project}_proxy"
docker run --rm --network "$network" --entrypoint node "${ABB_CONNECTOR_TEST_IMAGE:-argon/agentic-browser-bridge:0.1.0-alpha.4}" --input-type=module -e '
import net from "node:net";
import http from "node:http";
await new Promise((resolve,reject) => {
  const socket=net.connect(1055,"tailscale-proxy",()=>socket.write(Buffer.from([5,1,0])));
  socket.setTimeout(3000,()=>socket.destroy(new Error("SOCKS5 timeout")));
  socket.once("error",reject);
  socket.once("data",data=>{socket.destroy(); if(data[0]!==5 || data[1]!==0)reject(new Error("SOCKS5 greeting rejected")); else resolve();});
});
await new Promise((resolve,reject) => {
  const request=http.get({host:"tailscale-proxy",port:1055,path:"http://unreachable.tailnet.invalid/"},response=>{
    response.resume(); if(response.statusCode<400)reject(new Error("Unenrolled private request succeeded")); else resolve();
  });
  request.setTimeout(5000,()=>request.destroy(new Error("HTTP proxy timeout")));
  request.on("error",reject);
});
console.log("Private-network SOCKS5 and HTTP proxy listeners: passed");'
compose restart >/dev/null
sleep 1
compose exec -T tailscale-proxy tailscale --socket=/tmp/tailscaled.sock status --json | python3 -c 'import json,sys; assert json.load(sys.stdin)["BackendState"] == "NeedsLogin"; print("Userspace daemon starts/restarts without privileges; enrollment remains explicit")'

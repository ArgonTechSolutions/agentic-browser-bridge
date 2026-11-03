#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p /tmp/abb /data/profile /data/downloads
rm -f /tmp/abb/control.sock
exec node /app/src/server.js

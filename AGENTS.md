# Agentic Browser Bridge

Owner: Argon Tech Solutions. Purpose: portable persistent per-user browser workspaces with MCP access and human takeover. Public repository: keep host deployment details and profiles out of source.

Runtime: Node.js 24+, npm lockfile, Linux container, no transpilation. Entry points and validation are in docs/development.md; trust boundaries are in docs/architecture.md and SECURITY.md.

Validation: npm ci --ignore-scripts; npm run check; npm test; CHROMIUM_PATH=/usr/bin/chromium npm run test:browser. Container CI validates authentication, viewer/WebSocket/noVNC handoff and same-tab continuation with disposable profiles.

Installation/update/rollback: docs/operations.md. Ownership starts as human. Profile/download data is private and independent of software. Release validation and host live acceptance are separate evidence.

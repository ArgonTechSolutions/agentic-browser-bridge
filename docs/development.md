# Development and release

Requires Node.js 24+, npm, Bash, Linux and Chromium. Runtime npm versions are exact and package-lock.json is committed. No build transpilation is used.

```bash
npm ci --ignore-scripts
npm run check
npm test
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
npm audit --omit=dev
```

The browser integration test launches a temporary headless profile, exercises the MCP stdio transport and ownership gate, and verifies storage after restart. It closes browser/server processes and removes synthetic data. It does not sign into external services.

Build with `docker build -t abb:local .`. CI starts a disposable capability-dropped workspace, verifies HTTP authentication, noVNC JavaScript imports and the WebSocket screen, sends real keyboard input through noVNC during human takeover, then resumes MCP against that same browser tab. Fixtures use public synthetic credentials. Cleanup runs on failure. CI uses rootful Docker in a disposable runner; rootless-host deployment needs its own live acceptance check.

For local source testing, initialize a workspace, change its private ABB_IMAGE to `abb:local`, and start it with Docker Compose directly (abb up loads published release image archives). Keep all ports loopback-only and remove only disposable fixtures.

## Repository map

- `src/control.js`: single-owner operation gate.
- `src/browser.js`: tool schema, input checks and Playwright/CDP operations.
- `src/server.js`, `src/auth.js`: authenticated viewer, VNC proxy, private Unix socket.
- `src/mcp.js`: stdio MCP adapter; no TCP MCP transport.
- `web/`: viewer UI and noVNC integration.
- `scripts/`: user-local CLI/installer and container lifecycle.
- `test/`: security/ownership/CLI tests and real browser/container flows.
- `compose.yaml`, `Dockerfile`: portable packaging.

Public source must remain host-independent. Deployment instance details belong in private operator runbooks.

## Releases

Use SemVer with prerelease suffixes during alpha. Update VERSION, package.json/package-lock.json, compose.yaml, examples/tests and CHANGELOG.md together. Prepare docs/release-notes.md. Push to main and require successful CI on that exact commit. Dispatch Release with the version. It refuses existing tags/releases, checks successful push CI for the SHA, builds and smoke-tests the exact amd64 image, exports a compressed Docker image archive, tags the source and creates a public GitHub prerelease with source/install bundle, image archive, SHA256SUMS and image ID.

No moving latest tag is published. Image archives are downloaded anonymously from public GitHub Releases; no registry credential is needed. A future registry mirror is optional. Download/verify release assets and record live acceptance separately from CI. Checksums are integrity checks, not independent signatures. Browser security refreshes get a new version. Publication does not authorize deployment.

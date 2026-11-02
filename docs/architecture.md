# Architecture

## Components and boundaries

One workspace container runs Chromium with a persistent `/data/profile`, downloads under `/data/downloads`, Xvfb, Openbox, x11vnc and the Node.js controller. noVNC runs in the human's web browser and displays that same X session. Playwright connects to Chromium through container-local CDP. This gives people access to browser chrome/dialogs while agent tools operate web pages.

The host publishes only `127.0.0.1:PORT -> 8080`. The viewer handles its UI, control ownership and authenticated WebSocket-to-raw-TCP proxying. There is no unauthenticated internal WebSocket-to-VNC listener for websites running inside Chromium to reach. Host/Origin/Fetch Metadata checks reject ordinary cross-origin control requests and DNS rebinding. These checks are not authentication. Each HTTP request and WebSocket upgrade also requires the per-workspace operator password. Only a salted scrypt hash is stored in private configuration. Use SSH forwarding or TLS to protect Basic authentication in transit.

MCP uses stdio: `abb mcp` executes the MCP adapter as the unprivileged container user. It sends tool calls to a mode-0600 Unix socket inside a mode-0700 directory. MCP has no TCP listener. The browser container never receives the Docker socket. The host-side CLI necessarily uses the owning user's Docker daemon.

## Ownership

The controller starts in human mode on every process restart. Every browser tool, including read tools, passes through a single active-operation gate. Human takeover sets human mode before waiting for the active operation to drain. New tool calls fail immediately. The viewer enables input only when human mode is active and no operation is running. Agent mode is view-only in the provided viewer. Only a viewer request can return control; MCP provides no resume tool.

The gate is cooperative coordination, not an isolation boundary against someone with direct shell, CDP or Docker access as the workspace owner. View-only is a client UI behavior, not a permission tier for sharing with other people. Do not distribute this viewer to untrusted viewers. Agent clients must stop on tool errors and request status again after a handoff; no automatic chat notification, queued task scheduler, or unattended agent resumption is implemented.

Action timeouts bound common browser operations. A stuck/disconnected browser or exhausted server may still delay takeover. Stop the workspace if necessary. Two agents are serialized by rejecting overlapping calls rather than silently queueing old actions. Workspace tab identifiers are ephemeral across controller restarts; clients must refresh browser_tabs.

## Persistence

A rootless Docker named volume holds the profile and downloads. Browser life is independent of MCP/SSH/viewer connections. Restarting or updating the container retains disk data but interrupts active workflows; recovering every tab/form state is not guaranteed. Chromium attempts to restore its last session. Cookies/storage survive only as allowed by the website. The container's `/tmp` holds volatile display/control files and is not backed up. Ownership resets to human after restart.

Separate Linux users must have separate rootless daemons. Compose project names also include UID and workspace name; persistent CLI configuration lives under `${XDG_DATA_HOME:-~/.local/share}/agentic-browser-bridge/workspaces/NAME`. Ports are shared host resources; allocate distinct ports. The same host administrator can still access both users' data.

## Tool scope

The initial tools support HTTP(S) URLs and Playwright locators, including frame locators expressible by supported selectors. They do not expose arbitrary JavaScript evaluation, shell execution, cookies, storage export, file upload or direct host filesystem access. Password inputs require a human handoff in browser_fill; this is a convenience guard, not a guarantee that agent tools can never manipulate authentication UI.

Diagnostic logs retain only console types and response status/path, at most 100 events per tab; they omit console text, bodies, headers and query values. Page snapshots/screenshots may still contain sensitive data. Tools connect only after agent control is granted. Pages and downloads are untrusted data, never instructions or authorization.

## Dependencies and licensing

The application is Apache-2.0. Container packages and npm dependencies retain their original licenses (including Chromium, noVNC and x11vnc). Package copyright/license files remain in the image. `package-lock.json` fixes npm resolution; tagged images freeze a built browser/OS package set. The Debian Node base and apt packages are refreshed when rebuilding a release; source builds on different dates need not be byte-identical. Release image digests identify the exact resulting image. Images are built for linux/amd64 initially; other architectures remain unvalidated.

Upstream references: [Playwright CDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp), [noVNC](https://github.com/novnc/noVNC), [Rootless Docker](https://docs.docker.com/engine/security/rootless/).

# Proxy connector implementation plan (ATS-11)

Owner: Argon Tech Solutions. Candidate: `feat/proxy-connectors`.

1. Add provider-independent HTTP/HTTPS/SOCKS5 proxy configuration to the managed
   Chromium entrypoint. Validate URLs, preserve the no-proxy default, forbid
   credentials/fallback maps and keep viewer/MCP outside the proxy path.
2. Ship an independent userspace Tailscale connector, with explicit user login,
   a private Docker network, HTTP CONNECT/SOCKS5 endpoints and separate persistent
   state. Do not couple it to browser ownership, idle shutdown or SSH execution.
3. Add CLI configuration and installation support. Applying browser settings is
   explicit via `abb up`; preserve settings through updates/rollback. Reject
   incompatible images before any browser startup.
4. Validate unit/CLI contracts, actual proxy DNS/HTTPS/WebSockets/failure behavior,
   image packaging/startup, existing browser/UI behavior and the official
   unenrolled Tailscale image's listeners/restart with disposable resources.

Scope excludes gateway changes, host networking, production restarts, enrollment
using real accounts, release publication, ACL changes, SSH credentials/execution
and PAC/domain-routing machinery. Do not infer live policy acceptance from local
synthetic validation. See [proxy connectors](proxy-connectors.md) for the shipped
contract and [ATS-11](https://youtrack.argon.com.pe/issue/ATS-11) for validation status.

# Optional proxy connectors

Browser Bridge accepts a provider-independent proxy endpoint. Tailscale is an
optional standalone connector, not a dependency of the browser controller.
Default workspaces have no proxy and do not start a connector.

## Tailscale quick start

A new installation includes `tailscale-proxy` alongside `abb`. From a source
checkout use `connectors/tailscale/tailscale-proxy` and `scripts/abb` instead.

```bash
export PROXY_CONNECTOR_NAME=research
export ABB_WORKSPACE=research
# Initialize the browser normally first; skip if this workspace already exists.
abb init 17081

tailscale-proxy init
tailscale-proxy up
tailscale-proxy login
# Approve the printed link as the user who should own the connection.
tailscale-proxy status

abb proxy tailscale research
abb up
```

`abb proxy tailscale NAME` joins that connector's existing private Docker network
and configures its HTTP proxy. Names are explicit: `ABB_WORKSPACE` and
`PROXY_CONNECTOR_NAME` select independent browser and connector instances. Use a
separate connector per workspace to avoid mixing identities. More than one
trusted client can intentionally use a connector later.

Proxy configuration commands only write private configuration. `abb up` applies
changes by recreating the browser container, interrupting active tabs/workflows
while retaining the disk profile. Coordinate with the operator before restarting
a live workspace. The connector must be up first; a missing external Docker
network is an error. A proxy that is stopped, logged out or denied by tailnet
policy does not cause Chromium to fall back to a direct connection for proxied
requests. Viewer and MCP control remain outside the page proxy path.

## Other proxies

```bash
abb proxy set http://proxy.example:8080
abb proxy set socks5://proxy.example:1080
abb proxy set https://proxy.example:8443
abb proxy status
abb up
```

Use one explicit host:port URL, without credentials, paths, proxy maps or fallback
lists. Proxy authentication, if offered, is handled by Chromium's normal UI; do
not put credentials into configuration. SOCKS5 authentication is not supported by
Chromium. Ensure the endpoint is reachable from the container; its localhost is
not the host's localhost. The generic command does not provision network routes.
For another companion container, attach its private network using the existing
workspace `override.yaml`; `proxy set` only configures the endpoint.

Equivalent deployment environment variables are `ABB_PROXY_SERVER` and optional
`ABB_PROXY_BYPASS`. Compose forwards them from the workspace `.env`. CLI settings
in `proxy.yaml` take precedence. Updates and automatic image rollback preserve
this file. Applying the feature requires a newly built/released browser image
containing proxy support; the CLI refuses to start a configured proxy workspace
with an older image that lacks the proxy capability label.

By default, HTTP(S) and WebSocket page requests use the proxy, including ordinary
websites. That routes public requests through the connector too; it does not
select a Tailscale exit node. This first implementation avoids PAC/domain-routing
machinery. Chromium's implicit localhost/link-local bypass remains in effect.
An optional second argument to `proxy set` provides explicit direct bypasses:

```bash
abb proxy set http://proxy.example:8080 '*.direct.example;10.0.0.0/8'
```

Bypasses intentionally use direct access. Proxies resolve destination names;
QUIC and non-proxied WebRTC UDP are disabled while a proxy is configured. This is
browser page proxying, not an OS VPN or complete network sandbox: other processes
and every possible browser background protocol are not governed by this setting.
TLS remains end to end; no interception certificate or certificate exception is
installed.

## Disconnect

```bash
abb proxy off
abb up
# Then optionally stop the connector, retaining its state:
tailscale-proxy down
```

`off` removes only CLI settings; any proxy in `.env`/`override.yaml` remains under
the operator's control. It does not stop the connector or revoke its device.
Use `tailscale-proxy logout` separately when revoking local enrollment. See the
[standalone connector](../connectors/tailscale/README.md) for lifecycle, isolation,
state protection and reuse with other clients.

Validation: `npm run test:proxy` exercises real Chromium through a disposable
HTTP proxy, including proxy-side DNS, HTTPS CONNECT, secure WebSockets and denied
direct fallback. Unit/CLI tests cover configuration and lifecycle. Actual tailnet
enrollment and access under a real user's policy require separate live acceptance.

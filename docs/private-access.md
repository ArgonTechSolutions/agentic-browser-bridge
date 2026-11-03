# Private access

## Default: SSH forwarding

The viewer requires the per-workspace password initialized privately by `abb init`. It has no shared user database or separate read-only role. Keep the Compose port bound to 127.0.0.1 and authenticate through SSH:

```bash
ssh -N -L 17080:127.0.0.1:17080 your-server-alias
```

Open http://127.0.0.1:17080. The SSH alias can use a Tailscale address. The server never needs to SSH back to your computer. A disconnected tunnel does not stop an active agent workflow. Released idle workspaces can sleep; the login/wake controller remains available.

Local processes on the host may reach loopback ports, so the viewer authenticates every HTTP request and WebSocket upgrade with the workspace password. Separate rootless daemons protect profile volumes and Unix sockets from ordinary cross-user filesystem access. Host administrators still control the host and can access the workspace.

## Direct Tailscale HTTPS viewer (optional integration)

Retain the viewer password and use a TLS reverse proxy in front of the viewer, with WebSocket support, and expose only that authenticated endpoint through Tailscale Serve. Restrict grants to the intended operator/group and service port. Never expose CDP, raw VNC or the Unix-socket adapter.

Preserve cookies on HTTP and WebSocket upgrade requests; the viewer authenticates both. Do not add an HTTP Basic challenge. A proxy may add SSO as an additional gate. Preserve the original Host/Origin, and add only the private viewer hostname to ABB_ALLOWED_HOSTS in the workspace .env. Serve the application at `/` on a dedicated hostname/port; subpath hosting is not supported. Do not disable Origin/Host checks or enable permissive CORS. Prevent access to the backend from unauthorized local users as part of the deployment.

The alpha ships SSH forwarding as its tested distribution default. It does not provision tailnet policy, reverse proxies, users or credentials. This integration needs a separately reviewed configuration. [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) provides private reachability; its presence does not replace application authentication.

The password-only login reuses existing salted scrypt hashes. Opaque in-memory sessions expire after 8 hours or controller restart; cookies are HttpOnly, SameSite=Strict and automatically Secure on non-loopback hostnames. Logout revokes a session and its screen connections. Loopback HTTP through SSH remains supported; `ABB_SECURE_COOKIES=1` also forces Secure cookies for loopback TLS. Do not publish the viewer over plain HTTP. Login attempts have a global verification budget to bound expensive password hashing.

Your ingress must support long-lived WebSockets. An ordinary HTTP proxy that rejects Upgrade cannot carry noVNC. Private HTTPS deployment must validate identity revocation for already open streams as well as new connections.

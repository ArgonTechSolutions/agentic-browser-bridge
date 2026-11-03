# Tailscale proxy adapter

An Argon-maintained, standalone userspace Tailscale adapter using the official client with HTTP CONNECT and SOCKS5 endpoints.
It has no dependency on Browser Bridge. Any trusted container attached to its
Docker network can use it. No proxy port is published on the host or tailnet.

Requires Bash, Docker Compose and a separate rootless Docker daemon per Linux
user. The image is pinned in `compose.yaml`; no TUN device, host network,
NET_ADMIN, Docker socket, SSH credentials or privileged container is required.

```bash
export PROXY_CONNECTOR_NAME=research
./tailscale-proxy init
./tailscale-proxy up
./tailscale-proxy login
./tailscale-proxy status
./tailscale-proxy endpoints
```

`login` prints an identity-provider approval URL and waits for up to 60 seconds.
Open that link on your own computer. If approval takes longer, complete it and
check `status`; retry `login` if necessary. No auth key is required. Enrollment
creates a separate device in your tailnet and may require administrator approval.
Use an untagged user-owned device to inherit user-based grants. Device posture,
IP-specific rules, subnet routing, key expiry and device approval can affect
access; this is not a clone of your computer's identity or device permissions.
SSH serving, route advertising, exit nodes and host DNS configuration are not
enabled. Login enables shields-up to reject inbound tailnet connections, including
attempts to use the proxy from another tailnet device, and disables subnet route
acceptance. The proxy is for attached local clients only.

The private Docker network is `tsproxy-<Linux UID>-<connector name>_proxy`.
Endpoints on that network are:

- HTTP CONNECT: `http://tailscale-proxy:1055`
- SOCKS5: `socks5://tailscale-proxy:1055`

The same port supports both protocols. Proxy-side DNS supports private names.
The proxy does not terminate destination TLS. Clients retain certificate and
SSH host-key verification. An SSH client container can later join this network
and use an appropriate SOCKS5/HTTP CONNECT transport; SSH execution and credential
management are not implemented here. Never attach untrusted containers: network
membership grants use of this connector's identity. This is not a public proxy.

State lives in a Compose named volume, separate from every client's data.
Configuration defaults to `${XDG_DATA_HOME:-~/.local/share}/proxy-connectors/tailscale/NAME`;
set `PROXY_CONNECTOR_HOME` to choose another configuration root. Device keys are
sensitive: do not commit/export the volume or duplicate it across connectors.
The local workspace administrator and host administrator can access this state.

`down` stops/removes containers and the network but retains device state.
Disconnect attached clients first. `up` recreates the same device from its state.
`logout` invalidates the local login; it does not delete browser profiles. Remove
or revoke the device in Tailscale's admin console when retiring it. No command
here deletes the state volume. Protect state separately; ABB browser backups do
not contain it. To update the pinned image, edit this connector instance's private
`compose.yaml`, then run `up`; preserve the volume and record the previous image
for rollback. Installed source updates do not overwrite initialized instances.

References: [userspace networking](https://tailscale.com/docs/concepts/userspace-networking),
[Tailscale identity](https://tailscale.com/docs/concepts/tailscale-identity).

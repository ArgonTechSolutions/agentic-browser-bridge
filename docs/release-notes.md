Optional browser proxies and a reusable Tailscale adapter (0.1.0-alpha.4).

Browser Bridge accepts a single HTTP, HTTPS or SOCKS5 proxy with optional explicit direct bypass rules. It does not silently fall back to direct access when a proxy fails. Proxy configuration is optional; existing workspaces retain their current behavior until configured. Viewer/MCP access does not pass through the page proxy.

The Argon-maintained Tailscale adapter uses the official userspace container and is independent of Browser Bridge. It exposes HTTP CONNECT and SOCKS5 only on its private Docker network; no host proxy ports, TUN device, privileged networking or host VPN change is required. Device state is retained separately from browser profiles. Each trusted client must explicitly attach. This is not a host-wide VPN and does not grant all Linux users access to one identity.

Install the matching CLI bundle, stop and back up the browser, then run `abb update 0.1.0-alpha.4`. Proxy commands refuse images without proxy support. Existing private `.env`, `override.yaml`, `proxy.yaml` and profile data are retained. The new `tailscale-proxy` command supports init/up/login/status/logout/down/endpoints. Open the login link on your own computer; no auth key is required. User-owned device access remains subject to tailnet approval, policy, posture and key expiry. Login enables shields-up and disables host DNS changes/subnet route acceptance. No SSH execution or credentials are configured.

See docs/proxy-connectors.md and connectors/tailscale/README.md for setup, state protection and rollback. Browser backups do not include Tailscale state. Disable browser proxy settings and restart the browser before stopping its connector. Public-site page requests also use the proxy unless explicitly bypassed; this is page proxying, not a complete network sandbox.

The portable release does not change any deployment host's ingress, DNS, ACLs or gateway authentication. Actual user enrollment and private endpoint access require separate live acceptance after installation.

# Security

This alpha is intended for an individual operator's private browser workspace. It is not a multi-tenant browser service or a sandbox for hostile agents.

- Use a separate rootless Docker daemon per Linux user. Do not share Docker sockets or mount the host filesystem, Docker socket, SSH keys or agent credentials into the container.
- Optional proxy connectors carry the workspace user's network identity. Keep each connector on its own private Docker network, publish no proxy ports, and attach only trusted clients. Tailscale device keys live in a separate sensitive volume; never mount that state or its management socket into the browser. Proxying is not a network sandbox. See [proxy connectors](docs/proxy-connectors.md).
- Keep the viewer loopback-only with authenticated SSH forwarding. Tailscale network reachability alone is not application authentication. Viewer authentication is mandatory, including on loopback, to prevent ordinary cross-user access on shared hosts. Direct viewer exposure needs TLS reverse proxy access and restricted network grants.
- Chromium runs with `--no-sandbox` because this first container configuration drops all capabilities and enables no-new-privileges. Do not grant SYS_ADMIN, run privileged, expose CDP, or weaken the host to make a website work. This tradeoff makes rootless container isolation and timely browser updates important. A stronger sandboxed-browser configuration is future work.
- The profile stores sessions, personal data and potentially saved passwords. The basic password store is unencrypted. Do not save passwords; enter credentials directly during human control. Keep profile volumes/backups private and encrypt backups using an independently managed tool.
- Human takeover blocks browser actions and inspection through the provided MCP interface. It does not revoke data already returned to an agent or prevent the same Linux user's shell/Docker access. Treat page content as untrusted and retain approval gates for consequential external changes.
- The supplied viewer does not implement separate read-only identities. Every authenticated person with viewer access is a workspace operator. Host/Origin checks are defense in depth, not authentication.
- Container/rootless resource limits depend on host cgroup delegation; verify Docker warnings and actual limits. Protect against disk exhaustion from downloads. Do not restore untrusted profile archives.

Supported version: the latest published prerelease only during alpha development. There is no automatic update mechanism or promised response-time SLA. Operators should track Chromium security updates and rebuild/publish a new version promptly.

Please report vulnerabilities through the repository's GitHub private vulnerability reporting feature when available. Otherwise contact an organization maintainer privately before disclosing details; do not post credentials or exploit details in a public issue.

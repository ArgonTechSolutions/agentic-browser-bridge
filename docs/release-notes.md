First alpha of Agentic Browser Bridge, an Argon tool for persistent server-hosted browser workspaces shared by agents and humans.

Includes per-user rootless Docker workspaces, mandatory per-workspace viewer authentication, stdio MCP tools, noVNC access to the same browser, explicit human takeover/resume, persistent profiles/downloads, a user-local installer, explicit image updates with startup rollback, and backup guidance.

Target: Linux x86_64 servers. Each Linux user needs their own rootless Docker daemon. Private SSH forwarding is the supported access default; no tailnet or server configuration changes automatically.

Alpha boundaries: website automation/challenges may fail; profiles contain sensitive data; Chromium runs without its process sandbox inside a restricted container. No arbitrary desktop automation, notification service, or agent scheduler is included. Read SECURITY.md and the operations guide. CI does not replace rootless-host live acceptance.

Installation uses checksummed prebuilt image archives attached to this public GitHub release. No container-registry account or token is required. Registry publication is not part of this alpha.

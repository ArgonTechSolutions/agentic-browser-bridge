Password-only viewer login, conservative idle shutdown and ATS-8 backup fix.

Idle shutdown is enabled by default after 30 idle minutes plus a 2-minute grace period. Connected viewers (even without input), agent ownership, pending human handoff, active operations and monitored downloads block shutdown. An agent must call `browser_release` when finished. Unattended waits cannot be inferred from a quiet page: keep the workflow owned or disable idle shutdown. The top-left toggle and `abb up --no-idle-shutdown` persist the preference; the next viewer login reminds you when keep-running is enabled.

The lightweight controller remains available during browser sleep. Explicit wake restores Chromium from the persistent profile and starts in human control. Cookies/site storage survive; unsaved forms and page JavaScript are not guaranteed to survive sleep. Unexpected browser/display failure restarts the workspace.

Sign in using the existing workspace password, with no username. Existing salted hashes remain valid. Sessions expire after 8 hours or restart. Private hostnames automatically receive Secure cookies; loopback SSH access remains supported. HTTPS ingress must support authenticated WebSockets.

Install the matching CLI release, stop and back up the workspace, then use `abb update 0.1.0-alpha.3`. Upgrades migrate the Compose packaging while preserving private configuration and profile volumes. MCP now exposes 13 tools; restart/reconnect clients to discover `browser_release`. No client route changes are needed.

The portable project does not provision any specific host's ingress, Tailscale policy or DNS. The separately maintained private gateway integration has its own validation and deployment record.

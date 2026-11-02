A simpler viewer, styled after Argon’s current website. The normal toolbar shows only who has control and one accessible switch. Product title, footer and permanent explanation/reconnect rows are removed. Connection recovery controls appear only when needed. Manrope is self-hosted with its OFL license; dark surfaces and violet accents follow Argon’s palette.

The switch supports keyboard operation and preserves the human takeover/drain behavior. Ownership polling handles slow connections without leaving controls stuck, disables stale controls on failed status checks, and ignores late events from replaced screen connections.

Existing MCP configuration, profiles and downloads remain compatible. Use `abb update 0.1.0-alpha.2`; updating recreates/restarts the workspace and resets ownership to human. Take a consistent private backup before updating. No bootstrap/client configuration changes are required.

Linux x86_64 alpha. The published image archive is checksum-verified by the CLI; no registry account is required. Existing website-automation and container-security limitations remain documented in SECURITY.md and the operations guide.

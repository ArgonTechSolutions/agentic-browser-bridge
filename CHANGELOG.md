# Changelog

## 0.1.0-alpha.3

- Add conservative idle sleep/wake, persisted keep-running preference and top-left idle switch with sign-in reminder.
- Protect connected viewers, agent workflows, human handoffs, operations and downloads. Add `browser_release` to explicitly finish a workflow.
- Replace fixed-username Basic Auth prompt with password-only, bounded cookie sessions; preserve existing password hashes.
- Keep the lightweight controller available during sleep; gracefully flush Chromium profiles and restart on unexpected browser/display failures.
- Fix ATS-8: backups detach stdin so streamed SSH scripts continue after archiving.
- Update workspace packaging during CLI upgrade with packaging rollback on failed health checks.

## 0.1.0-alpha.2

- Replace the viewer title, footer and two action buttons with a compact ownership indicator and one accessible toggle.
- Match Argon's dark/violet palette and self-hosted Manrope typography.
- Show screen recovery controls only when disconnected; preserve human takeover/drain behavior.

## 0.1.0-alpha.1

- Persistent Chromium workspace with same-session agent and human access.
- Per-Linux-user rootless Docker and separate workspace data volumes.
- Mandatory viewer authentication and private stdio/Unix-socket MCP.
- Human takeover closes admission/drains work; only viewers can resume.
- Versioned installation, updates, backup guidance, CI and prereleases.

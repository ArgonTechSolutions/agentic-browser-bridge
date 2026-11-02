# Changelog

## Unreleased

- Replace the viewer title, footer and two action buttons with a compact ownership indicator and one accessible toggle.
- Match Argon's dark/violet palette and self-hosted Manrope typography.
- Show screen recovery controls only when disconnected; preserve human takeover/drain behavior.

## 0.1.0-alpha.1

- Persistent Chromium workspace with same-session agent and human access.
- Per-Linux-user rootless Docker and separate workspace data volumes.
- Mandatory viewer authentication and private stdio/Unix-socket MCP.
- Human takeover closes admission/drains work; only viewers can resume.
- Versioned installation, updates, backup guidance, CI and prereleases.

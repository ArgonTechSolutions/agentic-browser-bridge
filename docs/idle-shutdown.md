# Idle shutdown

The browser can sleep; its lightweight authenticated controller remains available. Default inactivity is 30 minutes plus a 2-minute grace period. Configure `ABB_IDLE_MINUTES` before recreating the workspace. `ABB_IDLE_GRACE_SECONDS` defaults to 120 (short values are useful for disposable acceptance tests).

Sleep is admitted only when idle shutdown is enabled, there are no connected authenticated screen viewers, ownership is human, no human intervention is pending, no agent operation is executing and the download monitor reports no active downloads. A failed download monitor blocks automatic sleep. Each blocker resets the idle window. Read-only status polling and an MCP connection alone do not count as work. Agent browser operations reset inactivity when starting and completing.

A connected viewer deliberately counts as use even if no input arrives: a person can be observing a long process. Close the viewer when finished. An agent-owned browser stays awake across disconnection; call `browser_release` only after the workflow is complete. `browser_request_human` keeps an unattended handoff protected until a viewer connects. Background network traffic or a changing page cannot establish whether the user still needs a session. For unattended waits, retain agent ownership or turn idle shutdown off.

Use the top-left Idle shutdown switch (on = enabled, off = keep running), or `abb up --no-idle-shutdown`. The preference is saved privately in the workspace volume and survives updates. On the next password sign-in, a reminder offers Enable idle shutdown / Keep running. Merely viewing status or acknowledging the reminder never closes a browser.

Wake is explicit in the authenticated viewer. Ownership returns to human; old tab IDs can change, so agents must re-list tabs after wake. Profile cookies, site storage and downloads remain on disk. In-memory JavaScript, live connections and unsaved forms are not guaranteed to survive. No claim is made that a saved profile is a memory snapshot. Profile backups still require stopping the workspace.

The release closes Chromium gracefully and waits for process exit before bounded signal fallbacks. Unexpected browser/display supervisor exit restarts the workspace. Idle sleep itself remains healthy. The 1.5 GiB memory and 1.5 CPU defaults remain limits, not reserved allocations. Measure active and sleeping footprints on your target host.

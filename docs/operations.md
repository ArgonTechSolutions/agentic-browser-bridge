# Operations

## Install and per-user ownership

Install the CLI from a checksummed release under the intended Linux account. Keep each account's default Docker context set to its own rootless daemon. `abb init [PORT]` prompts privately for a viewer password (username `operator`) and stores only a salted scrypt hash in the workspace `.env`, with a mode-0700 directory and mode-0600 file. No plaintext password is saved by the CLI. The browser itself may save website credentials; avoid doing so.

For noninteractive provisioning, supply `ABB_PASSWORD_HASH_FILE=/private/path/hash` containing an independently generated `saltHex:derivedKeyHex` scrypt hash (16-byte salt, N=16384, r=8, p=1, 64-byte output). Keep this file private. The tool does not read passwords from command-line arguments. Do not commit the resulting configuration. `ABB_HOME` and `ABB_BIN_DIR` override user-local installation locations; use absolute paths and keep them stable between invocations.

Use distinct ports per workspace across the host. `abb init` refuses to overwrite an existing workspace; `abb up` verifies/loads its release image and starts it. Rootless Docker must start independently of an interactive login if the workspace should survive disconnection/reboot. Verify user lingering and daemon startup with your host administrator; the installer does not change those settings.

## Health and limits

`abb status` shows container health, while `abb logs` shows bounded startup logs. Health checks require viewer authentication to be active and Chromium's local CDP endpoint to answer. They do not prove a website workflow succeeds.

Default limits are 1536 MiB RAM, 1.5 CPUs, 256 PIDs, 256 MiB shared memory and 256 MiB temporary filesystem. Change ABB_MEMORY/ABB_CPUS in the private workspace .env and recreate with `abb up`. Verify actual cgroup limits, especially with rootless Docker. Avoid starting a workspace on an already pressured host. Browser tabs and downloads need monitoring; no disk quota or cleanup scheduler is included. `abb stop` preserves the profile.

## Update and rollback

1. Read the target release notes and install the new CLI bundle if required.
2. Stop the browser and make a private consistent backup (below).
3. Run `abb update VERSION`; a moving latest tag is deliberately unsupported.
4. Reconnect the viewer, verify ownership starts as human, and run a benign workflow before handing it back to agents.

Update downloads the target image archive from GitHub Releases, checks its checksum and loads it before changing configuration. Already-loaded versions can be used offline. If container startup/health fails, it restores `.env.previous` and recreates the old image. This does **not** roll back profile writes. Browser versions can migrate profiles incompatibly. For a complete rollback, restore a pre-update volume backup with the workspace stopped, then use the previous image/CLI. Do not repeatedly downgrade a live profile.

The CLI uses the image tag saved in the workspace .env. Record its exact image ID with `docker image inspect` for incident/release verification. Old CLI releases remain under the user data directory. Before upgrading across a breaking release, follow its migration notes; the first alpha makes no stable-schema compatibility promise.

## Backups

Run `abb stop`, then `abb backup /private/path/browser.tar.gz`. Backup refuses a running browser and an existing output file; it writes mode 0600. It includes the profile and downloads, so handle it like account credentials. It does not include the CLI `.env`; back that up separately in a protected location. Encrypt archives using your existing backup system. `abb up` resumes afterwards.

Restore only a trusted archive, to an empty data volume, while the workspace is stopped. Use Docker Compose's `run --rm --no-deps --entrypoint tar` against the same user/workspace so the archive is extracted into `/data` as the container user. Restore is intentionally manual in alpha: inspect paths and preserve the old volume first; never extract an untrusted archive. Validate both browser data and permissions after restore.

## Password changes

Stop the workspace, derive a new hash using the same private terminal provisioning process (or your secret manager), replace ABB_VIEWER_PASSWORD_HASH in its protected `.env`, and recreate the container. Existing viewer connections must be closed; browser HTTP Basic authentication caches may require closing the browser window or using a new profile. No self-service password-reset endpoint is exposed.

## Removal

`abb down` removes the container and its Compose network; it retains the named browser-data volume. Stop agent MCP connections as well. Delete only the intended workspace's configuration/volume after separately confirming that its cookies, downloads and browser data may be erased. There is no automatic purge command. Removing `~/.local/bin/abb` and the installed CLI releases does not remove the data volume; keep a recovery path until you intentionally remove it.

## Known limitations

- No arbitrary desktop automation; no notification service or agent scheduler.
- One active agent action per workspace. Other agents receive a busy error.
- Human takeover waits for the current bounded action; network/browser failure can delay it.
- Site anti-automation, CAPTCHA/MFA, server IP reputation, hardware passkeys and device-bound checks may need human intervention or remain unsupported. Do not bypass these controls.
- Agent tool snapshots/screenshots may contain private account content. No audit transcript or screenshots are persisted by the bridge.
- Downloaded files remain inside `/data/downloads`; file management/export is an operator task.
- CLI installation is Linux-only; viewers and SSH MCP clients may run on other operating systems. ARM images are not yet validated.

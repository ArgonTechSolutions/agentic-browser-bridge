import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, stat, rm, readlink} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('installer and initialization isolate workspace data and refuse overwrite', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-cli-'));
  const env = {...process.env, ABB_HOME: path.join(dir, 'data'), ABB_BIN_DIR: path.join(dir, 'bin'), ABB_PASSWORD_HASH_FILE: path.join(dir, 'fixture-hash')};
  try {
    await writeFile(env.ABB_PASSWORD_HASH_FILE, '00'.repeat(16) + ':' + '11'.repeat(64), {mode: 0o600});
    execFileSync('bash', ['scripts/install.sh'], {env});
    const cli = path.join(dir, 'bin/abb');
    assert.match(await readlink(cli), /releases\/0\.1\.0-alpha\.3\/scripts\/abb$/);
    execFileSync(cli, ['init', '17080'], {env});
    execFileSync(cli, ['init', '17081'], {env: {...env, ABB_WORKSPACE: 'research'}});
    const first = path.join(env.ABB_HOME, 'workspaces/default/.env');
    const second = path.join(env.ABB_HOME, 'workspaces/research/.env');
    assert.match(await readFile(first, 'utf8'), /ABB_PORT=17080/);
    assert.match(await readFile(second, 'utf8'), /ABB_PORT=17081/);
    assert.equal((await stat(first)).mode & 0o777, 0o600);
    assert.equal((await stat(path.dirname(first))).mode & 0o777, 0o700);
    assert.notEqual(spawnSync(cli, ['init'], {env}).status, 0);
    assert.notEqual(spawnSync(cli, ['init'], {env: {...env, ABB_WORKSPACE: '../other'}}).status, 0);
    assert.match(await readFile(first, 'utf8'), /ABB_PORT=17080/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('updates preserve private configuration and restore the previous image on failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-update-'));
  const env = {...process.env, ABB_HOME: path.join(dir, 'data'), ABB_BIN_DIR: path.join(dir, 'bin'), ABB_PASSWORD_HASH_FILE: path.join(dir, 'fixture-hash'), ABB_TEST_LOG: path.join(dir, 'docker.log')};
  try {
    await writeFile(env.ABB_PASSWORD_HASH_FILE, '00'.repeat(16) + ':' + '11'.repeat(64));
    execFileSync('bash', ['scripts/install.sh'], {env});
    const cli = path.join(dir, 'bin/abb');
    execFileSync(cli, ['init', '17080'], {env});
    await writeFile(path.join(dir, 'bin/docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$ABB_TEST_LOG"
case "$*" in
  *'config --format json'*) echo '{"services":{"workspace":{"environment":{}}}}';;
  'info '*) echo '["name=rootless"]';;
  'inspect '*) if [[ "\${ABB_TEST_FAIL:-}" == 1 ]]; then echo unhealthy; else echo healthy; fi;;
  *'ps -q workspace'*) echo fixture-container;;
esac
`, {mode: 0o700});
    env.PATH = path.join(dir, 'bin') + ':' + env.PATH;
    execFileSync(cli, ['update', '0.1.0-alpha.3'], {env});
    const config = path.join(env.ABB_HOME, 'workspaces/default/.env');
    const successful = await readFile(config, 'utf8');
    assert.match(successful, /:0.1.0-alpha.3/);
    assert.match(successful, /ABB_VIEWER_PASSWORD_HASH=/);
    const failed = spawnSync(cli, ['update', '0.1.0-alpha.4'], {env: {...env, ABB_TEST_FAIL: '1'}});
    assert.notEqual(failed.status, 0);
    assert.equal(await readFile(config, 'utf8'), successful);
    assert.match(await readFile(env.ABB_TEST_LOG, 'utf8'), /up -d --force-recreate/);
    assert.equal((await stat(config)).mode & 0o777, 0o600);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('release image downloads are checksum-verified before Docker loads or starts them', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-download-'));
  const env = {...process.env, ABB_HOME: path.join(dir, 'data'), ABB_BIN_DIR: path.join(dir, 'bin'), ABB_PASSWORD_HASH_FILE: path.join(dir, 'fixture-hash'), ABB_TEST_LOG: path.join(dir, 'docker.log'), ABB_TEST_LOADED: path.join(dir, 'loaded')};
  try {
    await writeFile(env.ABB_PASSWORD_HASH_FILE, '00'.repeat(16) + ':' + '11'.repeat(64));
    execFileSync('bash', ['scripts/install.sh'], {env});
    const cli = path.join(dir, 'bin/abb');
    execFileSync(cli, ['init', '17080'], {env});
    await writeFile(path.join(dir, 'bin/docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$ABB_TEST_LOG"
case "$*" in
  *'config --format json'*) echo '{"services":{"workspace":{"environment":{}}}}';;
  'info '*) echo '["name=rootless"]';;
  'image inspect '*) test -f "$ABB_TEST_LOADED";;
  'image load '*) touch "$ABB_TEST_LOADED";;
  'inspect '*) echo healthy;;
  *'ps -q workspace'*) echo fixture-container;;
esac
`, {mode: 0o700});
    await writeFile(path.join(dir, 'bin/curl'), `#!/usr/bin/env bash
url=''; output=''
while [[ $# -gt 0 ]]; do
  case "$1" in -o) output=$2; shift 2;; https://*) url=$1; shift;; *) shift;; esac
done
case "$url" in
  */SHA256SUMS) hash=$(printf fixture | sha256sum); printf '%s  agentic-browser-bridge-0.1.0-alpha.3-linux-amd64.tar.gz\\n' "\${hash%% *}" > "$output";;
  */agentic-browser-bridge-0.1.0-alpha.3-linux-amd64.tar.gz) if [[ "\${ABB_CORRUPT:-}" == 1 ]]; then printf corrupt > "$output"; else printf fixture > "$output"; fi;;
  *) exit 1;;
esac
`, {mode: 0o700});
    env.PATH = path.join(dir, 'bin') + ':' + env.PATH;
    assert.notEqual(spawnSync(cli, ['up'], {env: {...env, ABB_CORRUPT: '1'}}).status, 0);
    assert.doesNotMatch(await readFile(env.ABB_TEST_LOG, 'utf8'), /image load|up -d/);
    execFileSync(cli, ['up'], {env});
    assert.match(await readFile(env.ABB_TEST_LOG, 'utf8'), /image load/);
    assert.match(await readFile(env.ABB_TEST_LOG, 'utf8'), /up -d/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('backup cannot consume commands remaining on a streamed shell stdin (ATS-8)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-backup-'));
  const env = {...process.env, ABB_HOME:path.join(dir,'data'), ABB_BIN_DIR:path.join(dir,'bin'), ABB_PASSWORD_HASH_FILE:path.join(dir,'hash')};
  try {
    await writeFile(env.ABB_PASSWORD_HASH_FILE,'00'.repeat(16)+':'+ '11'.repeat(64));
    execFileSync('bash',['scripts/install.sh'],{env}); const cli=path.join(dir,'bin/abb'); execFileSync(cli,['init'],{env});
    await writeFile(path.join(dir,'bin/docker'),`#!/usr/bin/env bash
case "$*" in
  *'config --format json'*) echo '{"services":{"workspace":{"environment":{}}}}';;
  'info '*) echo '["name=rootless"]';;
  *'run --rm'*) cat >/dev/null; printf fixture-archive;;
esac
`,{mode:0o700});
    env.PATH=path.join(dir,'bin')+':'+env.PATH;
    const result=spawnSync('bash',['-s'],{env,input:`'${cli}' backup '${dir}/backup.tar.gz'\nprintf 'AFTER_BACKUP\\n'\n`,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/AFTER_BACKUP/);
    assert.equal(await readFile(path.join(dir,'backup.tar.gz'),'utf8'),'fixture-archive');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('proxy commands validate atomically, isolate workspaces and persist across update rollback', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'abb-proxy-cli-'));
  const env = {...process.env, ABB_HOME: path.join(dir, 'data'), ABB_BIN_DIR: path.join(dir, 'bin'), ABB_PASSWORD_HASH_FILE: path.join(dir, 'hash'), ABB_TEST_LOG: path.join(dir, 'docker.log')};
  try {
    await writeFile(env.ABB_PASSWORD_HASH_FILE, '00'.repeat(16) + ':' + '11'.repeat(64));
    execFileSync('bash', ['scripts/install.sh'], {env});
    const cli = path.join(dir, 'bin/abb');
    execFileSync(cli, ['init'], {env});
    execFileSync(cli, ['init'], {env: {...env, ABB_WORKSPACE: 'other'}});
    const config = path.join(env.ABB_HOME, 'workspaces/default/proxy.yaml');
    execFileSync(cli, ['proxy', 'set', 'socks5://connector.example:1055', '*.direct.test'], {env});
    const initial = await readFile(config, 'utf8');
    assert.equal(JSON.parse(initial).services.workspace.environment.ABB_PROXY_SERVER, 'socks5://connector.example:1055');
    assert.equal((await stat(config)).mode & 0o777, 0o600);
    for (const value of ['http://user:secret@proxy:80', 'http://proxy:80,direct://', 'http://proxy:70000', 'http://proxy:80\nBAD=value']) {
      assert.notEqual(spawnSync(cli, ['proxy', 'set', value], {env}).status, 0);
      assert.equal(await readFile(config, 'utf8'), initial);
    }
    execFileSync(cli, ['proxy', 'tailscale', 'research'], {env});
    const attached = await readFile(config, 'utf8');
    assert.match(JSON.parse(attached).networks['proxy-connector'].name, /^tsproxy-\d+-research_proxy$/);
    assert.doesNotMatch(execFileSync(cli, ['proxy', 'status'], {env: {...env, ABB_WORKSPACE: 'other'}, encoding: 'utf8'}), /tailscale-proxy/);
    await writeFile(path.join(dir, 'bin/docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$ABB_TEST_LOG"
case "$*" in
  *'config --format json'*) echo '{"services":{"workspace":{"environment":{"ABB_PROXY_SERVER":"http://tailscale-proxy:1055"}}}}';;
  'image inspect --format '*) if [[ "\${ABB_OLD_IMAGE:-}" != 1 ]]; then echo 1; fi;;
  'info '*) echo '["name=rootless"]';;
  'inspect '*) if [[ "\${ABB_TEST_FAIL:-}" == 1 ]]; then echo unhealthy; else echo healthy; fi;;
  *'ps -q workspace'*) echo fixture-container;;
esac
`, {mode: 0o700});
    env.PATH = path.join(dir, 'bin') + ':' + env.PATH;
    assert.notEqual(spawnSync(cli, ['up'], {env: {...env, ABB_OLD_IMAGE: '1'}}).status, 0);
    assert.doesNotMatch(await readFile(env.ABB_TEST_LOG, 'utf8'), /up -d/);
    execFileSync(cli, ['update', '0.1.0-alpha.3'], {env});
    assert.equal(await readFile(config, 'utf8'), attached);
    assert.notEqual(spawnSync(cli, ['update', '0.1.0-alpha.4'], {env: {...env, ABB_TEST_FAIL: '1'}}).status, 0);
    assert.equal(await readFile(config, 'utf8'), attached);
    execFileSync(cli, ['mcp'], {env});
    assert.match(await readFile(env.ABB_TEST_LOG, 'utf8'), /proxy.yaml.*exec -T --user node workspace node \/app\/src\/mcp.js/);
    execFileSync(cli, ['proxy', 'off'], {env});
    await assert.rejects(readFile(config));
  } finally {await rm(dir, {recursive: true, force: true});}
});

test('standalone Tailscale connector preserves state and has no ABB dependency', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tsproxy-cli-'));
  const env = {...process.env, PROXY_CONNECTOR_HOME: path.join(dir, 'connectors'), PROXY_CONNECTOR_NAME: 'research', ABB_TEST_LOG: path.join(dir, 'docker.log')};
  const cli = path.resolve('connectors/tailscale/tailscale-proxy');
  try {
    execFileSync(cli, ['init'], {env});
    const config = path.join(env.PROXY_CONNECTOR_HOME, 'tailscale/research/compose.yaml');
    assert.equal((await stat(config)).mode & 0o777, 0o600);
    assert.notEqual(spawnSync(cli, ['init'], {env}).status, 0);
    assert.notEqual(spawnSync(cli, ['init'], {env: {...env, PROXY_CONNECTOR_NAME: '../escape'}}).status, 0);
    await writeFile(path.join(dir, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$ABB_TEST_LOG"
case "$*" in 'info '*) echo '["name=rootless"]';; esac
`, {mode: 0o700});
    env.PATH = dir + ':' + env.PATH;
    for (const action of ['up', 'login', 'status', 'logout', 'down']) execFileSync(cli, [action], {env});
    const log = await readFile(env.ABB_TEST_LOG, 'utf8');
    assert.match(log, /--tun=|up -d/);
    assert.match(log, /tailscale --socket=\/tmp\/tailscaled.sock up --timeout=60s --accept-dns=false --accept-routes=false --shields-up --hostname=tsproxy-/);
    assert.match(log, / down\n/); assert.doesNotMatch(log, /down -v|authkey|ABB_/);
    const endpoints = execFileSync(cli, ['endpoints'], {env, encoding: 'utf8'});
    assert.match(endpoints, /Docker network: tsproxy-\d+-research_proxy/);
    assert.match(endpoints, /HTTP: http:\/\/tailscale-proxy:1055/);
    assert.match(endpoints, /SOCKS5: socks5:\/\/tailscale-proxy:1055/);
    assert.ok(await readFile(config));
  } finally {await rm(dir, {recursive: true, force: true});}
});

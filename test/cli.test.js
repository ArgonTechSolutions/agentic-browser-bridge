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
    assert.match(await readlink(cli), /releases\/0\.1\.0-alpha\.1\/scripts\/abb$/);
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

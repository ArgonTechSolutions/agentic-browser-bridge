import {readFile, writeFile, rename} from 'node:fs/promises';

// A connected viewer is deliberately a blocker: observing/waiting counts as use.
// No attempt is made to infer human intent from DOM/network/background activity.
export class Lifecycle {
  constructor({start = async () => {}, stop = async () => {}, blockers = () => [], policyFile, idleMs = 1800000, warningMs = 120000, clock = Date.now} = {}) {
    if (!Number.isFinite(idleMs) || idleMs < 1000) throw new Error('Invalid idle timeout.');
    if (!Number.isFinite(warningMs) || warningMs < 0) throw new Error('Invalid idle grace period.');
    this.startBrowser = start; this.stopBrowser = stop; this.blockers = blockers; this.policyFile = policyFile;
    this.idleMs = idleMs; this.warningMs = warningMs; this.clock = clock;
    this.enabled = true; this.phase = 'sleeping'; this.lastActivity = clock(); this.warningAt = undefined;
  }
  async load() {
    if (!this.policyFile) return;
    try { const data = JSON.parse(await readFile(this.policyFile, 'utf8')); if (typeof data.enabled !== 'boolean') throw Error('Invalid idle policy'); this.enabled = data.enabled; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  activity() { this.lastActivity = this.clock(); this.warningAt = undefined; }
  status() { return {phase: this.phase, idleShutdown: this.enabled, idleMinutes: this.idleMs / 60000, shutdownAt: this.warningAt === undefined ? null : this.warningAt + this.warningMs, blockers: this.blockers()}; }
  async setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw Error('idleShutdown must be boolean.');
    const apply = async () => {
      if (this.policyFile) { await writeFile(this.policyFile + '.tmp', JSON.stringify({enabled}), {mode: 0o600}); await rename(this.policyFile + '.tmp', this.policyFile); }
      this.enabled = enabled; this.activity(); return this.status();
    };
    this.policyWrite = (this.policyWrite || Promise.resolve()).catch(() => {}).then(apply);
    return this.policyWrite;
  }

  async wake() {
    if (this.transition) { await this.transition; return this.wake(); }
    if (this.phase === 'running') { this.activity(); return this.status(); }
    this.phase = 'starting';
    this.transition = (async () => {
      try { await this.startBrowser(); this.phase = 'running'; this.activity(); }
      catch (e) { this.phase = 'sleeping'; throw e; }
      finally { this.transition = undefined; }
    })();
    await this.transition; return this.status();
  }
  async tick() {
    if (this.phase !== 'running' || this.transition) return;
    if (!this.enabled || this.blockers().length) { this.activity(); return; }
    if (this.clock() - this.lastActivity < this.idleMs) return;
    this.warningAt ??= this.clock();
    if (this.clock() < this.warningAt + this.warningMs) return;
    // Admission closes synchronously before awaiting anything. A wake/input
    // during shutdown must wait for the transition, never race a browser kill.
    this.phase = 'stopping';
    this.transition = (async () => {
      try { await this.stopBrowser(); this.phase = 'sleeping'; }
      catch (e) { this.phase = 'error'; throw e; }
      finally { this.transition = undefined; }
    })();
    await this.transition;
  }
}

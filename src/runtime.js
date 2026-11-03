import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';

export class Runtime {
  downloads = new Set();
  watch(child) {
    child.once('exit', () => { if (!this.stopping) this.onFailure?.(); });
  }
  async start() {
    this.stopping = false;
    this.child = spawn('/usr/local/bin/abb-browser', [], {stdio: 'inherit', detached: true});
    this.watch(this.child);
    this.child.on('error', () => {});
    for (let n = 0; n < 150; n++) {
      if (this.child.exitCode !== null) throw Error('Browser failed to start.');
      try {
        const response = await fetch('http://127.0.0.1:9222/json/version', {signal: AbortSignal.timeout(500)});
        if (response.ok) {
          this.browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
          this.cdp = await this.browser.newBrowserCDPSession();
          this.cdp.on('Browser.downloadWillBegin', e => this.downloads.add(e.guid));
          this.cdp.on('Browser.downloadProgress', e => { if (e.state !== 'inProgress') this.downloads.delete(e.guid); });
          await this.cdp.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: '/data/downloads', eventsEnabled: true});
          return;
        }
      } catch { /* CDP becomes ready after the virtual display. */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    await this.stop(); throw Error('Browser startup timed out.');
  }
  blockers() {
    if (this.child && this.child.exitCode !== null) return ['browser failure'];
    if (!this.browser?.isConnected()) return ['browser monitor unavailable'];
    return this.downloads.size ? ['download in progress'] : [];
  }
  async stop() {
    this.stopping = true;
    // Browser.close gracefully flushes the profile; the shell then tears down
    // the display/VNC. Force termination is only a bounded shutdown fallback.
    const child = this.child;
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      const wait = async ms => {
        let timer;
        await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, ms); })]);
        clearTimeout(timer);
      };
      // CDP acknowledgement is not a profile-flush completion signal. Wait for
      // Chromium and its supervisor to exit naturally before any signal fallback.
      this.cdp?.send('Browser.close').catch(() => {});
      await wait(15000);
      if (child.exitCode === null) {
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        await wait(5000);
      }
      if (child.exitCode === null) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await exited; }
    }
    await this.browser?.close().catch(() => {});
    this.child = this.browser = this.cdp = undefined; this.downloads.clear();
  }
}

// One owner at a time. Human takeover closes admission before draining work.
export class Control {
  mode = 'human';
  reason = 'Workspace started. Return control to enable agent access.';
  active = false;
  waitingForHuman = false;
  #drained = [];

  status() { return {mode: this.mode, reason: this.reason, active: this.active, waitingForHuman: this.waitingForHuman}; }

  async run(operation) {
    if (this.mode !== 'agent') throw new Error('Human control: browser access is paused. Ask the user to return control in the viewer.');
    if (this.active) throw new Error('Browser busy: another tool call is running. Retry after it finishes.');
    this.beforeOperation?.();
    this.active = true;
    try { return await operation(); }
    finally {
      this.active = false;
      this.afterOperation?.();
      for (const resolve of this.#drained.splice(0)) resolve();
    }
  }

  async takeHuman(reason = 'Human took control.') {
    this.mode = 'human';
    this.reason = String(reason).slice(0, 500);
    if (this.active) await new Promise(resolve => this.#drained.push(resolve));
    return this.status();
  }

  returnToAgent() {
    if (this.active) throw new Error('Wait for the current action to finish before returning control.');
    this.mode = 'agent';
    this.reason = '';
    return this.status();
  }
}

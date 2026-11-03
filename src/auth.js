import {scryptSync, timingSafeEqual, randomBytes} from 'node:crypto';
export function checkHash(value) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(value || '')) throw new Error('ABB_VIEWER_PASSWORD_HASH must contain a salted scrypt hash. Initialize the workspace with abb init.');
  return value;
}
export function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length > 1024) return false;
  const [salt, expected] = checkHash(hash).split(':');
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, 'hex'), 64), Buffer.from(expected, 'hex'));
}
// Password verification is globally bounded; normal requests use opaque sessions.
export class Sessions {
  constructor(hash, {secure = false, clock = Date.now, lifetime = 8 * 3600000} = {}) {
    this.hash = checkHash(hash); this.secure = secure; this.clock = clock; this.lifetime = lifetime;
    this.name = `abb_${hash.slice(0, 16)}`; this.tokens = new Map(); this.attempts = [];
  }
  verify(password) {
    const now = this.clock(); this.attempts = this.attempts.filter(t => t > now - 60000);
    if (this.attempts.length >= 10) return false;
    this.attempts.push(now);
    return verifyPassword(password, this.hash);
  }
  login(password) {
    if (!this.verify(password)) return undefined;
    this.prune();
    while (this.tokens.size >= 32) this.tokens.delete(this.tokens.keys().next().value);
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, this.clock() + this.lifetime); return token;
  }
  prune() { for (const [t, until] of this.tokens) if (until <= this.clock()) this.tokens.delete(t); }
  token(req) {
    const value = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(this.name + '='))?.slice(this.name.length + 1);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : undefined;
  }
  valid(token) { return Boolean(token && (this.tokens.get(token) || 0) > this.clock()); }
  authenticated(req) { return this.valid(this.token(req)); }
  cookie(token = '', req) {
    let loopback = false;
    try { loopback = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${req?.headers.host}`).hostname); } catch {}
    const secure = this.secure || Boolean(req && !loopback);
    return `${this.name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? Math.floor(this.lifetime / 1000) : 0}${secure ? '; Secure' : ''}`;
  }
  logout(req) { this.tokens.delete(this.token(req)); }
}

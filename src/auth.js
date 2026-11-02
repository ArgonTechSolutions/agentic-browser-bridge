import {scryptSync, timingSafeEqual} from 'node:crypto';
export function checkHash(value) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(value || '')) throw new Error('ABB_VIEWER_PASSWORD_HASH must contain a salted scrypt hash. Initialize the workspace with abb init.');
  return value;
}
export function authenticated(req, hash) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Basic ') || authorization.length > 4096) return false;
  const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
  if (!decoded.startsWith('operator:')) return false;
  const [salt, expected] = hash.split(':');
  const derived = scryptSync(decoded.slice(9), Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(derived, Buffer.from(expected, 'hex'));
}

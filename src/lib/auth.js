import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import db from './db';
import { normalizeSchoolAffiliations } from './chatUserContext';

const SESSION_COOKIE = 'helpdesk_session';

export function getJwtSecret() {
  const config = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('idp_config')?.value || '{}');
  if (!config.jwtSecret || config.jwtSecret === 'default-fallback-secret') throw new Error('IdP-Schlüssel nicht eingerichtet.');
  return config.jwtSecret;
}
function sessionSecret() {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get('internal_session_secret').value;
}
export function verifyIdpJwt(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (payload.type || typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return null;
    return payload;
  } catch { return null; }
}
export async function createSession(user) {
  const current = db.prepare('SELECT session_version FROM users WHERE id = ?').get(user.id);
  if (!current) throw new Error('Konto nicht vorhanden.');
  const token = jwt.sign({
    type: 'session', id: user.id, version: current.session_version,
    authMethod: user.authMethod || 'unknown', verifiedAt: new Date().toISOString(),
    schoolAffiliations: normalizeSchoolAffiliations(user.schoolAffiliations)
  }, sessionSecret(), { expiresIn: '7d', issuer: 'helpdesk', audience: 'helpdesk-session' });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 604800, path: '/helpdesk' });
}
export function validateSessionToken(token) {
  try {
    const payload = jwt.verify(token, sessionSecret(), { algorithms: ['HS256'], issuer: 'helpdesk', audience: 'helpdesk-session' });
    if (payload.type !== 'session') return null;
    const user = db.prepare('SELECT id,email,role,name,session_version FROM users WHERE id = ?').get(payload.id);
    if (!user || user.session_version !== payload.version) return null;
    return { ...payload, ...user };
  } catch { return null; }
}
export async function getSessionToken() {
  let token;
  // The old generic name collides with root cookies from previous releases
  // and other applications on the same host. Never use it for authentication.
  try { token = (await cookies()).get(SESSION_COOKIE)?.value; } catch {}
  if (!token) {
    try { token = (await headers()).get('authorization')?.replace(/^Bearer /, ''); } catch {}
  }
  return token;
}
export async function getSessionUser() {
  const token = await getSessionToken();
  const user = token ? validateSessionToken(token) : null;
  if (user) db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  return user;
}
export async function destroySession() {
  const user = await getSessionUser();
  if (user) db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(user.id);
  const store = await cookies();
  store.set('helpdesk_guest','',{httpOnly:true,expires:new Date(0),path:'/helpdesk'});
  store.set(SESSION_COOKIE, '', { httpOnly: true, expires: new Date(0), path: '/helpdesk' });
}
export function generateMagicLinkToken(email) {
  return jwt.sign({ email: email.trim().toLowerCase(), type: 'magic_link' }, sessionSecret(), {
    expiresIn: '30m', jwtid: randomUUID(), issuer: 'helpdesk', audience: 'helpdesk-login'
  });
}
export function verifyMagicLinkToken(token, consume = false) {
  try {
    const p = jwt.verify(token, sessionSecret(), { algorithms: ['HS256'], issuer: 'helpdesk', audience: 'helpdesk-login' });
    if (p.type !== 'magic_link' || !p.jti || typeof p.email !== 'string') return null;
    return db.transaction(() => {
      db.prepare('DELETE FROM consumed_magic_tokens WHERE expires_at < ?').run(Math.floor(Date.now()/1000));
      if (db.prepare('SELECT id FROM consumed_magic_tokens WHERE id = ?').get(p.jti)) return null;
      if (consume) db.prepare('INSERT INTO consumed_magic_tokens (id,expires_at) VALUES (?,?)').run(p.jti,p.exp);
      return p.email;
    })();
  } catch { return null; }
}

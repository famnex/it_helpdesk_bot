import jwt from 'jsonwebtoken';
import { cookies, headers } from 'next/headers';
import db from './db';

// Helper, um das JWT Secret aus den DB-Einstellungen zu laden
export function getJwtSecret() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('idp_config');
    if (row) {
      const config = JSON.parse(row.value);
      return config.jwtSecret || 'default-fallback-secret';
    }
  } catch (e) {
    console.error('Fehler beim Laden des JWT Secrets:', e);
  }
  return 'default-fallback-secret';
}

/**
 * Verifiziert einen externen JWT (vom Identity Provider)
 */
export function verifyIdpJwt(token) {
  const secret = getJwtSecret();
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    console.error('JWT Verifikation fehlgeschlagen:', err.message);
    return null;
  }
}

/**
 * Erstellt eine interne Benutzer-Session (verschlüsselter Cookie)
 */
export async function createSession(user) {
  const secret = getJwtSecret();
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role
  };
  
  // Session-Token läuft nach 7 Tagen ab
  const token = jwt.sign(payload, secret, { expiresIn: '7d' });
  
  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 Tage
    path: '/'
  });
}

/**
 * Liest die aktuelle Session aus den Cookies
 */
export async function getSessionUser() {
  let token = null;

  // 1. Aus den Cookies lesen
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('session');
    if (tokenCookie && tokenCookie.value) {
      token = tokenCookie.value;
    }
  } catch (err) {
    // In manchen Next.js Rendering-Kontexten können Cookies nicht gelesen werden
  }

  // 2. Aus dem Authorization-Header lesen, falls kein Cookie existiert
  if (!token) {
    try {
      const headersList = await headers();
      const authHeader = headersList.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    } catch (err) {
      // In manchen Kontexten können Header nicht gelesen werden
    }
  }

  if (!token) return null;

  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret);
    
    // Aktivitätszeitstempel für eingeloggte Mitarbeiter/Admins bei jeder Anfrage aktualisieren
    if (payload && (payload.role === 'agent' || payload.role === 'admin') && payload.email) {
      try {
        db.prepare("UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER(?)").run(payload.email);
      } catch (e) {}
    }
    
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Löscht die Session (Logout)
 */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set('session', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  });
}

/**
 * Generiert einen Magic-Link-Token für einen Kunden
 */
export function generateMagicLinkToken(email, expiresIn = '15m') {
  const secret = getJwtSecret();
  return jwt.sign({ email, type: 'magic_link' }, secret, { expiresIn });
}

/**
 * Verifiziert einen Magic-Link-Token
 */
export function verifyMagicLinkToken(token) {
  const secret = getJwtSecret();
  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.type === 'magic_link') {
      return decoded.email;
    }
  } catch (err) {
    console.error('Magic Link Verifikation fehlgeschlagen:', err.message);
  }
  return null;
}

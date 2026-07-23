import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ user: null });
  }

  // IP-Adresse extrahieren
  const xForwardedFor = request.headers.get('x-forwarded-for');
  let userIp = '';
  if (xForwardedFor) {
    userIp = xForwardedFor.split(',')[0].trim();
  } else {
    userIp = request.headers.get('x-real-ip') || '';
  }

  // Session ID aus dem Client-Header lesen
  const userSessionId = request.headers.get('x-user-session-id') || '';

  // Wenn der Benutzer angemeldet ist und wir eine Session-ID haben, verknüpfen wir diese im Hintergrund in der chats-Tabelle
  if (sessionUser.email && userSessionId) {
    try {
      // Prüfen, ob für diese Session ID schon eine Verknüpfung existiert
      const existing = db.prepare('SELECT id FROM chats WHERE user_session_id = ? AND user_email = ?').get(userSessionId, sessionUser.email);
      if (!existing) {
        // Ein neuer leerer Chat-Datensatz wird angelegt, um die Verknüpfung festzuhalten
        const linkChatId = `link-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`;
        db.prepare('INSERT INTO chats (id, user_email, user_name, user_ip, user_session_id) VALUES (?, ?, ?, ?, ?)')
          .run(linkChatId, sessionUser.email, sessionUser.name || null, userIp || null, userSessionId);
      } else {
        // Bestehende Verknüpfung mit aktueller IP/Name aktualisieren
        db.prepare('UPDATE chats SET user_ip = ?, user_name = ? WHERE user_session_id = ? AND user_email = ?')
          .run(userIp || null, sessionUser.name || null, userSessionId, sessionUser.email);
      }
    } catch (dbErr) {
      console.error('Fehler beim Assoziieren der Session-ID bei /api/auth/me:', dbErr);
    }
  }

  // IdP-Logout-Alternativtext abfragen
  let logoutText = 'Abmelden';
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('idp_config');
    if (row) {
      const config = JSON.parse(row.value);
      if (config.logoutText) logoutText = config.logoutText;
    }
  } catch (e) {
    // ignorieren
  }

  try {
    const user = db.prepare('SELECT id, email, role, name, avatar_url as avatarUrl FROM users WHERE id = ?').get(sessionUser.id);
    if (user && user.avatarUrl && !user.avatarUrl.startsWith('/helpdesk')) {
      user.avatarUrl = `/helpdesk${user.avatarUrl}`;
    }
    return NextResponse.json({ user, logoutText });
  } catch (err) {
    console.error('Fehler bei /api/auth/me:', err);
    return NextResponse.json({ user: sessionUser, logoutText });
  }
}

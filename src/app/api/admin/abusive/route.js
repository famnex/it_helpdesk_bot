import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { reconstructIdentityTrace } from '@/lib/identityTrace';
import { checkIpBanned } from '@/lib/abuse';

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    // Holt alle Chats, die als missbräuchlich markiert wurden
    const abusiveChats = db.prepare(`
      SELECT id, user_email as userEmail, user_name as userName, user_ip as userIp, user_session_id as userSessionId, user_fingerprint as userFingerprint, abusive_flagged_at as flaggedAt
      FROM chats
      WHERE is_abusive = 1
      ORDER BY abusive_flagged_at DESC
    `).all();

    // Für jeden Chat den kompletten Verlauf und die erweiterte Identitäts-Spur laden
    const enrichedChats = abusiveChats.map(chat => {
      const messages = db.prepare(`
        SELECT id, sender, text, image_url as imageUrl, created_at as createdAt
        FROM chat_messages
        WHERE chat_id = ?
        ORDER BY id ASC
        LIMIT 30
      `).all(chat.id);

      const messagesWithPrefix = messages.map(m => {
        if (m.imageUrl) {
          let clean = m.imageUrl.replace(/^\/helpdesk/, '');
          if (!clean.startsWith('/')) clean = '/' + clean;
          m.imageUrl = `/helpdesk${clean}`;
        }
        return m;
      });

      const identityTrace = reconstructIdentityTrace(chat.id);
      const ipBanInfo = checkIpBanned(chat.userIp, chat.userFingerprint);

      return {
        ...chat,
        messages: messagesWithPrefix,
        identityTrace,
        ipBanInfo
      };
    });

    return NextResponse.json({ abusiveChats: enrichedChats });
  } catch (err) {
    console.error('Fehler beim Laden missbräuchlicher Chats:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { chatId, action } = await request.json();
    if (!chatId) {
      return NextResponse.json({ error: 'Chat-ID fehlt.' }, { status: 400 });
    }

    if (action === 'resolve' || action === 'unflag') {
      db.prepare(`
        UPDATE chats 
        SET is_abusive = 0, abusive_flagged_at = NULL 
        WHERE id = ?
      `).run(chatId);
      return NextResponse.json({ success: true });
    }

    if (action === 'flag') {
      db.prepare(`
        UPDATE chats 
        SET is_abusive = 1, abusive_flagged_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(chatId);
      const identityTrace = reconstructIdentityTrace(chatId);
      return NextResponse.json({ success: true, identityTrace });
    }

    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 });
  } catch (err) {
    console.error('Fehler beim Ändern des Missbrauchs-Status:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    // Holt alle Chats, die als missbräuchlich markiert wurden
    const abusiveChats = db.prepare(`
      SELECT id, user_email as userEmail, user_name as userName, user_ip as userIp, user_session_id as userSessionId, abusive_flagged_at as flaggedAt
      FROM chats
      WHERE is_abusive = 1
      ORDER BY abusive_flagged_at DESC
    `).all();

    // Für jeden Chat den kompletten Verlauf laden
    const enrichedChats = abusiveChats.map(chat => {
      const messages = db.prepare(`
        SELECT id, sender, text, image_url as imageUrl, created_at as createdAt
        FROM chat_messages
        WHERE chat_id = ?
        ORDER BY id ASC
        LIMIT 20
      `).all(chat.id);

      const messagesWithPrefix = messages.map(m => {
        if (m.imageUrl && !m.imageUrl.startsWith('/helpdesk')) {
          m.imageUrl = `/helpdesk${m.imageUrl.startsWith('/') ? '' : '/'}${m.imageUrl}`;
        }
        return m;
      });

      // Rekonstruieren früherer Anmeldungen/Identitäten über die Session ID
      let linkedIdentities = [];
      if (chat.userSessionId) {
        linkedIdentities = db.prepare(`
          SELECT DISTINCT user_email as email, user_name as name
          FROM chats
          WHERE user_session_id = ? AND user_email IS NOT NULL AND user_email != ''
        `).all(chat.userSessionId);
      }

      return {
        ...chat,
        messages: messagesWithPrefix,
        linkedIdentities
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

    if (action === 'resolve') {
      db.prepare(`
        UPDATE chats 
        SET is_abusive = 0, abusive_flagged_at = NULL 
        WHERE id = ?
      `).run(chatId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 });
  } catch (err) {
    console.error('Fehler beim Auflösen des missbräuchlichen Chats:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    // Holt alle geflaggten Nachrichten, sortiert nach flagged_at absteigend
    const flaggedMessages = db.prepare(`
      SELECT m.id, m.chat_id as chatId, m.text, m.flagged_at as flaggedAt,
             m.flagged_reason as flaggedReason, m.base_knowledge as baseKnowledge, c.user_email as userEmail
      FROM chat_messages m
      JOIN chats c ON m.chat_id = c.id
      WHERE m.is_flagged = 1 AND m.sender = 'bot'
      ORDER BY m.flagged_at DESC
    `).all();

    // Für jede geflaggte Nachricht laden wir die letzten 5 Nachrichten dieses Chats zur Einordnung für den Admin
    const enrichedMessages = flaggedMessages.map(msg => {
      const context = db.prepare(`
        SELECT sender, text, image_url as imageUrl, created_at as createdAt
        FROM chat_messages
        WHERE chat_id = ? AND id <= ?
        ORDER BY id DESC
        LIMIT 5
      `).all(msg.chatId, msg.id);

      const contextWithPrefix = context.map(m => {
        if (m.imageUrl) {
          let clean = m.imageUrl.replace(/^\/helpdesk/, '');
          if (!clean.startsWith('/')) clean = '/' + clean;
          m.imageUrl = `/helpdesk${clean}`;
        }
        return m;
      });

      // Zugehörige Wissenseinträge auflösen
      let resolvedKnowledge = [];
      if (msg.baseKnowledge) {
        const ids = msg.baseKnowledge.split(',').map(id => id.trim()).filter(Boolean);
        if (ids.length > 0) {
          // SQL IN-Klausel vorbereiten
          const placeholders = ids.map(() => '?').join(',');
          try {
            resolvedKnowledge = db.prepare(`
              SELECT id, title, fact 
              FROM knowledge 
              WHERE id IN (${placeholders})
            `).all(...ids);
          } catch (dbErr) {
            console.error('Fehler beim Auflösen des Wissens für geflaggte Nachricht:', dbErr);
          }
        }
      }

      return {
        ...msg,
        resolvedKnowledge,
        context: contextWithPrefix.reverse()
      };
    });

    return NextResponse.json({ flaggedMessages: enrichedMessages });
  } catch (err) {
    console.error('Fehler beim Laden geflaggter Nachrichten:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { messageId, action } = await request.json();
    if (!messageId) {
      return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });
    }

    if (action === 'resolve') {
      db.prepare(`
        UPDATE chat_messages 
        SET is_flagged = 0, flagged_at = NULL 
        WHERE id = ?
      `).run(messageId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 });
  } catch (err) {
    console.error('Fehler beim Auflösen der geflaggten Nachricht:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

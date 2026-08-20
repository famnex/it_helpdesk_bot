import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { analyzeChatQuality } from '@/lib/gemini';
import { reconstructIdentityTrace } from '@/lib/identityTrace';

/**
 * GET: Alle gespeicherten Chats für den Administrator auflisten
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  try {
    if (chatId) {
      // Details eines bestimmten Chats laden (inklusive exaktem Ticket, Nachrichten & Identitäts-Spur)
      const chat = db.prepare(`
        SELECT c.id, c.user_email as userEmail, c.user_name as userName,
               c.is_abusive as isAbusive, c.user_ip as userIp, c.user_session_id as userSessionId,
               c.category, c.categorized_at as categorizedAt, c.customer_last_active_at as customerLastActiveAt,
               c.last_active_at as lastActiveAt, c.created_at as createdAt,
               t.id as exactTicketId,
               t.title as exactTicketTitle,
               t.status as exactTicketStatus,
               CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END as ticketCreated
        FROM chats c
        LEFT JOIN tickets t ON t.chat_id = c.id
        WHERE c.id = ?
      `).get(chatId);

      if (!chat) {
        return NextResponse.json({ error: 'Chat nicht gefunden.' }, { status: 404 });
      }

      const messages = db.prepare(`
        SELECT id, sender, text, image_url as imageUrl, base_knowledge as baseKnowledge, is_flagged as isFlagged, created_at as createdAt
        FROM chat_messages
        WHERE chat_id = ?
        ORDER BY created_at ASC
      `).all(chatId);

      const messagesWithPrefix = messages.map(m => {
        if (m.imageUrl) {
          let clean = m.imageUrl.replace(/^\/helpdesk/, '');
          if (!clean.startsWith('/')) clean = '/' + clean;
          m.imageUrl = `/helpdesk${clean}`;
        }
        return m;
      });

      // Identitäts-Spur rekonstruieren
      const identityTrace = reconstructIdentityTrace(chatId);

      return NextResponse.json({ chat, messages: messagesWithPrefix, identityTrace });
    }

    // Alle Chats abfragen (nur solche, in denen auch eine Konversation stattfand)
    const chats = db.prepare(`
      SELECT c.id, c.user_email as userEmail, c.user_name as userName,
             c.is_abusive as isAbusive, c.user_ip as userIp, c.user_session_id as userSessionId,
             c.category, c.categorized_at as categorizedAt, c.customer_last_active_at as customerLastActiveAt,
             c.last_active_at as lastActiveAt, c.created_at as createdAt,
             t.id as exactTicketId,
             t.title as exactTicketTitle,
             t.status as exactTicketStatus,
             CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END as ticketCreated
      FROM chats c
      LEFT JOIN tickets t ON t.chat_id = c.id
      WHERE c.id NOT LIKE 'link-%' AND EXISTS (
        SELECT 1 FROM chat_messages WHERE chat_messages.chat_id = c.id
      )
      ORDER BY c.created_at DESC
    `).all();

    return NextResponse.json({ chats });
  } catch (err) {
    console.error('Fehler beim Abrufen der Admin-Chats:', err);
    return NextResponse.json({ error: 'Serverfehler beim Abrufen der Chats.' }, { status: 500 });
  }
}

/**
 * POST: Aktionen für Admin-Chats durchführen (z. B. KI-Analyse des Chats, Missbrauch markieren / aufheben)
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { chatId, action } = await request.json();
    if (!chatId) {
      return NextResponse.json({ error: 'Ungültige Parameter: chatId fehlt.' }, { status: 400 });
    }

    if (action === 'analyze') {
      const analysis = await analyzeChatQuality(chatId);
      return NextResponse.json({ success: true, analysis });
    }

    if (action === 'flag_abusive') {
      db.prepare(`
        UPDATE chats
        SET is_abusive = 1, abusive_flagged_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(chatId);

      const identityTrace = reconstructIdentityTrace(chatId);
      return NextResponse.json({ success: true, isAbusive: true, identityTrace });
    }

    if (action === 'unflag_abusive') {
      db.prepare(`
        UPDATE chats
        SET is_abusive = 0, abusive_flagged_at = NULL
        WHERE id = ?
      `).run(chatId);

      return NextResponse.json({ success: true, isAbusive: false });
    }

    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 });
  } catch (err) {
    console.error('Fehler bei der Chat-Aktion:', err);
    return NextResponse.json({ error: err.message || 'Serverfehler bei der Chat-Aktion.' }, { status: 500 });
  }
}

/**
 * DELETE: Einen Chat und alle zugehörigen Nachrichten löschen
 */
export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'Chat-ID fehlt.' }, { status: 400 });
    }

    const result = db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Chat nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Löschen des Chats:', err);
    return NextResponse.json({ error: 'Serverfehler beim Löschen.' }, { status: 500 });
  }
}

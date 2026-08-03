import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { analyzeChatQuality } from '@/lib/gemini';

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
      // Details eines bestimmten Chats laden (inklusive Nachrichten)
      const chat = db.prepare(`
        SELECT id, user_email as userEmail, user_name as userName, ticket_created as ticketCreated,
               is_abusive as isAbusive, user_ip as userIp, user_session_id as userSessionId, created_at as createdAt
        FROM chats
        WHERE id = ?
      `).get(chatId);

      if (!chat) {
        return NextResponse.json({ error: 'Chat nicht gefunden.' }, { status: 404 });
      }

      const messages = db.prepare(`
        SELECT id, sender, text, image_url as imageUrl, created_at as createdAt
        FROM chat_messages
        WHERE chat_id = ?
        ORDER BY created_at ASC
      `).all(chatId);

      const messagesWithPrefix = messages.map(m => {
        if (m.imageUrl && !m.imageUrl.startsWith('/helpdesk')) {
          m.imageUrl = `/helpdesk${m.imageUrl.startsWith('/') ? '' : '/'}${m.imageUrl}`;
        }
        return m;
      });

      return NextResponse.json({ chat, messages: messagesWithPrefix });
    }

    // Alle Chats abfragen
    const chats = db.prepare(`
      SELECT id, user_email as userEmail, user_name as userName, ticket_created as ticketCreated,
             is_abusive as isAbusive, user_ip as userIp, user_session_id as userSessionId, created_at as createdAt
      FROM chats
      ORDER BY created_at DESC
    `).all();

    return NextResponse.json({ chats });
  } catch (err) {
    console.error('Fehler beim Abrufen der Admin-Chats:', err);
    return NextResponse.json({ error: 'Serverfehler beim Abrufen der Chats.' }, { status: 500 });
  }
}

/**
 * POST: Aktionen für Admin-Chats durchführen (z. B. KI-Analyse des Chats)
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { chatId, action } = await request.json();
    if (!chatId || action !== 'analyze') {
      return NextResponse.json({ error: 'Ungültige Parameter.' }, { status: 400 });
    }

    const analysis = await analyzeChatQuality(chatId);
    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    console.error('Fehler bei der Chat-Analyse:', err);
    return NextResponse.json({ error: err.message || 'Serverfehler bei der Analyse.' }, { status: 500 });
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

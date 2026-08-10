import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

// In-Memory-Speicher für Tipp-Heartbeats
if (!global._liveTypingStore) {
  global._liveTypingStore = new Map();
}

/**
 * GET: Prüft auf neue Nachrichten und Tipp-Aktivitäten der Gegenseite
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const roomType = searchParams.get('roomType') || 'ticket'; // 'ticket' oder 'chat'
  const roomId = searchParams.get('roomId');
  const lastMsgId = parseInt(searchParams.get('lastMsgId') || '0', 10);
  const lastTicketMsgId = parseInt(searchParams.get('lastTicketMsgId') || '0', 10);
  const myRole = searchParams.get('myRole') || ''; // 'customer', 'agent', 'admin', 'bot'
  const myEmail = (searchParams.get('myEmail') || '').toLowerCase();

  if (!roomId) {
    return NextResponse.json({ error: 'roomId fehlt.' }, { status: 400 });
  }

  try {
    let newMessages = [];
    let newTicketMessages = [];
    const getCleanImageUrl = (url) => {
      if (!url) return '';
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
      let clean = url.replace(/^\/helpdesk/, '');
      if (!clean.startsWith('/')) clean = '/' + clean;
      return `/helpdesk${clean}`;
    };

    if (roomType === 'ticket') {
      // Abfragen neuer Ticket-Nachrichten ab lastMsgId
      const rows = db.prepare(`
        SELECT m.id, m.ticket_id as ticketId, m.sender_email as senderEmail, 
               m.sender_role as senderRole, m.text, m.is_internal as isInternal, 
               m.created_at as createdAt, u.name as senderName, u.avatar_url as senderAvatarUrl
        FROM ticket_messages m
        LEFT JOIN users u ON m.sender_email = u.email
        WHERE m.ticket_id = ? AND m.id > ?
        ORDER BY m.id ASC
      `).all(roomId, lastMsgId);

      newMessages = rows.map(m => {
        if (m.senderAvatarUrl && !m.senderAvatarUrl.startsWith('/helpdesk')) {
          m.senderAvatarUrl = `/helpdesk${m.senderAvatarUrl}`;
        }
        return m;
      });
    } else if (roomType === 'chat') {
      // Abfragen neuer Chat-Nachrichten ab lastMsgId
      const rows = db.prepare(`
        SELECT id, chat_id as chatId, sender, text, image_url as imageUrl, 
               is_flagged as isFlagged, created_at as createdAt
        FROM chat_messages
        WHERE chat_id = ? AND id > ?
        ORDER BY id ASC
      `).all(roomId, lastMsgId);

      newMessages = rows.map(m => {
        if (m.imageUrl) {
          m.imageUrl = getCleanImageUrl(m.imageUrl);
        }
        return m;
      });

      // Zusätzlich prüfen, ob für diese chat_id ein Ticket in der Datenbank verknüpft ist
      try {
        const ticket = db.prepare(`SELECT id FROM tickets WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1`).get(roomId);
        if (ticket) {
          const ticketRows = db.prepare(`
            SELECT m.id, m.ticket_id as ticketId, m.sender_email as senderEmail, 
                   m.sender_role as senderRole, m.text, m.is_internal as isInternal, 
                   m.created_at as createdAt, u.name as senderName, u.avatar_url as senderAvatarUrl
            FROM ticket_messages m
            LEFT JOIN users u ON m.sender_email = u.email
            WHERE m.ticket_id = ? AND m.id > ? AND m.is_internal = 0
            ORDER BY m.id ASC
          `).all(ticket.id, lastTicketMsgId);

          newTicketMessages = ticketRows.map(m => {
            if (m.senderAvatarUrl && !m.senderAvatarUrl.startsWith('/helpdesk')) {
              m.senderAvatarUrl = `/helpdesk${m.senderAvatarUrl}`;
            }
            return m;
          });
        }
      } catch (errTicket) {
        console.error('Fehler beim Abrufen verknüpfter Ticket-Nachrichten:', errTicket);
      }
    }

    // Tipp-Status der Gegenseite berechnen (letzte 3,5 Sekunden)
    const now = Date.now();
    let isOtherPartyTyping = false;

    // Raum-ID für verknüpftes Ticket finden (falls vorhanden)
    let linkedTicketId = null;
    if (roomType === 'chat') {
      try {
        const ticket = db.prepare(`SELECT id FROM tickets WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1`).get(roomId);
        if (ticket) linkedTicketId = ticket.id;
      } catch (e) {}
    }

    for (const [key, timestamp] of global._liveTypingStore.entries()) {
      if (now - timestamp > 3500) {
        global._liveTypingStore.delete(key);
        continue;
      }

      const [storeRoomType, storeRoomId, storeRole, storeEmail] = key.split(':');
      const isDirectMatch = storeRoomType === roomType && storeRoomId === roomId;
      const isLinkedTicketMatch = roomType === 'chat' && linkedTicketId && storeRoomType === 'ticket' && storeRoomId === linkedTicketId;

      if (isDirectMatch || isLinkedTicketMatch) {
        // Prüfen, ob der Tipp-Eintrag von einer anderen Person/Rolle stammt
        const isDifferentRole = storeRole !== myRole;
        const isDifferentEmail = myEmail && storeEmail ? storeEmail !== myEmail : true;

        if (isDifferentRole || isDifferentEmail) {
          isOtherPartyTyping = true;
          break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      newMessages,
      newTicketMessages,
      isOtherPartyTyping
    });
  } catch (err) {
    console.error('Fehler bei /api/live/sync GET:', err);
    return NextResponse.json({ error: 'Serverfehler bei Live-Sync.' }, { status: 500 });
  }
}

/**
 * POST: Aktualisiert den Tipp-Status einer Rolle/Person in einem Raum
 */
export async function POST(request) {
  try {
    const { roomType = 'ticket', roomId, role = 'customer', email = '', isTyping = true } = await request.json();

    if (!roomId) {
      return NextResponse.json({ error: 'roomId fehlt.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const storeKey = `${roomType}:${roomId}:${role}:${cleanEmail}`;

    if (isTyping) {
      global._liveTypingStore.set(storeKey, Date.now());
    } else {
      global._liveTypingStore.delete(storeKey);
    }

    // Falls roomType === 'chat', auch Heartbeat für das verknüpfte Ticket (falls vorhanden) setzen
    if (roomType === 'chat') {
      try {
        const ticket = db.prepare(`SELECT id FROM tickets WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1`).get(roomId);
        if (ticket) {
          const ticketStoreKey = `ticket:${ticket.id}:${role}:${cleanEmail}`;
          if (isTyping) {
            global._liveTypingStore.set(ticketStoreKey, Date.now());
          } else {
            global._liveTypingStore.delete(ticketStoreKey);
          }
        }
      } catch (e) {}
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler bei /api/live/sync POST:', err);
    return NextResponse.json({ error: 'Serverfehler bei Tipp-Status.' }, { status: 500 });
  }
}

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

    // Aktivität für den aktuellen Nutzer/Chat in der DB protokollieren
    if (myEmail) {
      db.prepare("UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER(?)").run(myEmail);
    }
    if (roomType === 'chat' && roomId && myRole === 'customer') {
      db.prepare("UPDATE chats SET customer_last_active_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP WHERE id = ?").run(roomId);
    }

    // Hilfsfunktion zum korrekten Parsen von UTC-Strings aus SQLite (verhindert 2-Stunden-Offset)
    const parseUtc = (dateStr) => {
      if (!dateStr) return null;
      if (typeof dateStr !== 'string') return new Date(dateStr);
      if (dateStr.endsWith('Z') || dateStr.includes('+')) return new Date(dateStr);
      return new Date(dateStr.replace(' ', 'T') + 'Z');
    };

    // Berechnung des Online-Status des Gesprächspartners
    let partnerPresence = null;
    const formatPresence = (lastActiveAt, partnerRole = 'Gesprächspartner') => {
      const dateObj = parseUtc(lastActiveAt);
      if (!dateObj || isNaN(dateObj.getTime())) {
        return { isOnline: false, statusText: `${partnerRole} offline`, label: 'Offline' };
      }
      const diffMs = Date.now() - dateObj.getTime();
      const diffMins = Math.floor(Math.max(0, diffMs) / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 2) {
        return { isOnline: true, statusText: `${partnerRole} ist online`, label: 'Online' };
      } else if (diffMins < 60) {
        return { isOnline: false, statusText: `${partnerRole} vor ${diffMins} Min. online`, label: `Vor ${diffMins} Min.` };
      } else if (diffHours < 24) {
        const hLabel = diffHours === 1 ? '1 Std.' : `${diffHours} Std.`;
        return { isOnline: false, statusText: `${partnerRole} vor ${hLabel} online`, label: `Vor ${hLabel}` };
      } else {
        const dLabel = diffDays === 1 ? '1 Tag' : `${diffDays} Tagen`;
        return { isOnline: false, statusText: `${partnerRole} vor ${dLabel} online`, label: `Vor ${dLabel}` };
      }
    };

    if (roomType === 'chat') {
      const chatRow = db.prepare('SELECT ticket_created as ticketCreated, user_email as userEmail, customer_last_active_at as custActive FROM chats WHERE id = ?').get(roomId);
      if (myRole === 'customer') {
        if (chatRow && chatRow.ticketCreated === 1) {
          const agentRow = db.prepare(`
            SELECT u.name, u.email, u.last_active_at as lastActiveAt 
            FROM tickets t 
            JOIN users u ON t.assigned_agent_id = u.id 
            WHERE t.chat_id = ?
          `).get(roomId);
          if (agentRow) {
            partnerPresence = formatPresence(agentRow.lastActiveAt, `IT-Support (${agentRow.name || 'Agent'})`);
          } else {
            partnerPresence = formatPresence(null, 'IT-Support-Team');
          }
        } else {
          // KI-Bot ist 24/7 online
          partnerPresence = { isOnline: true, statusText: 'KI-Bot online (24/7)', label: 'Online' };
        }
      } else {
        // Admin / Agent sieht den echten Kunden-Status
        let custActiveAt = chatRow ? chatRow.custActive : null;
        if (chatRow && chatRow.userEmail) {
          const uRow = db.prepare('SELECT last_active_at as lastActiveAt FROM users WHERE LOWER(email) = LOWER(?)').get(chatRow.userEmail);
          if (uRow && uRow.lastActiveAt) {
            const uTime = parseUtc(uRow.lastActiveAt)?.getTime() || 0;
            const cTime = parseUtc(custActiveAt)?.getTime() || 0;
            if (uTime > cTime) custActiveAt = uRow.lastActiveAt;
          }
        }

        // Fallback: Letzte Aktivität darf nicht älter sein als die letzte Kundennachricht
        try {
          const latestUserMsg = db.prepare(`
            SELECT created_at as createdAt FROM chat_messages 
            WHERE chat_id = ? AND sender = 'user' 
            ORDER BY created_at DESC LIMIT 1
          `).get(roomId);
          if (latestUserMsg && latestUserMsg.createdAt) {
            const msgTime = parseUtc(latestUserMsg.createdAt)?.getTime() || 0;
            const activeTime = parseUtc(custActiveAt)?.getTime() || 0;
            if (msgTime > activeTime) {
              custActiveAt = latestUserMsg.createdAt;
            }
          }
        } catch (e) {}

        partnerPresence = formatPresence(custActiveAt, 'Kunde');
      }
    } else if (roomType === 'ticket') {
      const ticketRow = db.prepare('SELECT creator_email as creatorEmail, assigned_agent_id as assignedAgentId, updated_at as updatedAt FROM tickets WHERE id = ?').get(roomId);
      if (myRole === 'customer') {
        if (ticketRow && ticketRow.assignedAgentId) {
          const agentRow = db.prepare('SELECT name, last_active_at as lastActiveAt FROM users WHERE id = ?').get(ticketRow.assignedAgentId);
          partnerPresence = formatPresence(agentRow ? agentRow.lastActiveAt : null, agentRow ? `IT-Support (${agentRow.name})` : 'IT-Support-Team');
        } else {
          partnerPresence = formatPresence(null, 'IT-Support-Team');
        }
      } else {
        let custActiveAt = null;
        if (ticketRow && ticketRow.creatorEmail) {
          const uRow = db.prepare('SELECT last_active_at as lastActiveAt FROM users WHERE LOWER(email) = LOWER(?)').get(ticketRow.creatorEmail);
          if (uRow && uRow.lastActiveAt) custActiveAt = uRow.lastActiveAt;
        }

        try {
          const cRow = db.prepare('SELECT customer_last_active_at as custActive FROM chats WHERE id = (SELECT chat_id FROM tickets WHERE id = ?)').get(roomId);
          if (cRow && cRow.custActive) {
            const cTime = parseUtc(cRow.custActive)?.getTime() || 0;
            const uTime = parseUtc(custActiveAt)?.getTime() || 0;
            if (cTime > uTime) custActiveAt = cRow.custActive;
          }
        } catch (e) {}

        try {
          const latestUserMsg = db.prepare(`
            SELECT created_at as createdAt FROM ticket_messages 
            WHERE ticket_id = ? AND sender_role = 'customer' 
            ORDER BY created_at DESC LIMIT 1
          `).get(roomId);
          if (latestUserMsg && latestUserMsg.createdAt) {
            const msgTime = parseUtc(latestUserMsg.createdAt)?.getTime() || 0;
            const activeTime = parseUtc(custActiveAt)?.getTime() || 0;
            if (msgTime > activeTime) {
              custActiveAt = latestUserMsg.createdAt;
            }
          }
        } catch (e) {}

        partnerPresence = formatPresence(custActiveAt, 'Kunde');
      }
    }

    return NextResponse.json({
      success: true,
      newMessages,
      newTicketMessages,
      isOtherPartyTyping,
      partnerPresence
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

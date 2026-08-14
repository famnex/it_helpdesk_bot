import db from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseUtc(dateStr) {
  if (!dateStr) return null;
  let str = String(dateStr).trim();
  if (str.includes(' ') && !str.includes('Z') && !str.includes('+')) {
    str = str.replace(' ', 'T') + 'Z';
  } else if (str.includes('T') && !str.includes('Z') && !str.includes('+')) {
    str = str + 'Z';
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatPresence(lastActiveAt, label) {
  if (!lastActiveAt) return { isOnline: false, statusText: 'Offline', label };
  const d = parseUtc(lastActiveAt);
  if (!d) return { isOnline: false, statusText: 'Offline', label };

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec <= 30) {
    return { isOnline: true, statusText: 'Gerade online', label };
  } else if (diffSec <= 120) {
    return { isOnline: true, statusText: 'Vor kurzem aktiv', label };
  } else if (diffSec < 3600) {
    const min = Math.floor(diffSec / 60);
    return { isOnline: false, statusText: `Zuletzt vor ${min} Min.`, label };
  } else {
    return { isOnline: false, statusText: `Zuletzt heute ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, label };
  }
}

/**
 * GET: Server-Sent Events (SSE) Stream für Echtzeit-Ereignisse
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const roomType = searchParams.get('roomType') || 'ticket'; // 'ticket', 'chat', 'dashboard'
  const roomId = searchParams.get('roomId') || '';
  const myRole = searchParams.get('myRole') || 'customer';
  const myEmail = (searchParams.get('myEmail') || '').toLowerCase().trim();

  let lastMsgId = parseInt(searchParams.get('lastMsgId') || '0', 10);
  let lastTicketMsgId = parseInt(searchParams.get('lastTicketMsgId') || '0', 10);
  let lastKnownStatus = '';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Initiales Connection-Event senden
      const initialEvent = `event: connected\ndata: ${JSON.stringify({ status: 'connected', time: Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(initialEvent));

      // 2. Heartbeat & Event-Ticker (alle 1.5 Sekunden)
      const interval = setInterval(() => {
        if (request.signal.aborted) {
          clearInterval(interval);
          return;
        }

        try {
          // Heartbeat für Online-Präsenz
          if (myRole && myEmail) {
            try {
              db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER(?)').run(myEmail);
            } catch (e) {}
          }

          if (roomType === 'ticket' && roomId) {
            // Neue Ticket-Nachrichten abfragen
            const rows = db.prepare(`
              SELECT m.id, m.ticket_id as ticketId, m.sender_email as senderEmail, 
                     m.sender_role as senderRole, m.text, m.is_internal as isInternal, 
                     m.image_url as imageUrl, m.created_at as createdAt,
                     u.name as senderName, u.avatar_url as senderAvatarUrl
              FROM ticket_messages m
              LEFT JOIN users u ON m.sender_email = u.email
              WHERE m.ticket_id = ? AND m.id > ?
              ORDER BY m.id ASC
            `).all(roomId, lastMsgId);

            if (rows.length > 0) {
              lastMsgId = Math.max(...rows.map(r => r.id));
              const eventMsg = `event: messages\ndata: ${JSON.stringify({ newMessages: rows })}\n\n`;
              controller.enqueue(encoder.encode(eventMsg));
            }

            // Ticket Status & Metadaten prüfen
            const tRow = db.prepare(`
              SELECT t.id, t.status, t.solution, t.assigned_agent_id as assignedAgentId,
                     u.name as assignedAgentName, u.email as assignedAgentEmail,
                     t.closed_at as closedAt, t.closed_by_name as closedByName,
                     t.rating, t.rating_feedback as ratingFeedback, t.rated_at as ratedAt
              FROM tickets t
              LEFT JOIN users u ON t.assigned_agent_id = u.id
              WHERE t.id = ?
            `).get(roomId);

            if (tRow && tRow.status !== lastKnownStatus) {
              lastKnownStatus = tRow.status;
              const eventStatus = `event: ticket_meta\ndata: ${JSON.stringify({ ticketMeta: tRow })}\n\n`;
              controller.enqueue(encoder.encode(eventStatus));
            }

            // Tipp-Status & Präsenz
            let isOtherPartyTyping = false;
            const now = Date.now();
            if (global._liveTypingStore) {
              for (const [key, timestamp] of global._liveTypingStore.entries()) {
                if (now - timestamp > 3500) continue;
                const [storeRoomType, storeRoomId, storeRole, storeEmail] = key.split(':');
                if (storeRoomType === 'ticket' && storeRoomId === roomId) {
                  if (storeRole !== myRole && (!myEmail || storeEmail !== myEmail)) {
                    isOtherPartyTyping = true;
                    break;
                  }
                }
              }
            }

            let partnerPresence = null;
            if (myRole === 'customer') {
              if (tRow && tRow.assignedAgentId) {
                const ag = db.prepare('SELECT last_active_at as lastActiveAt FROM users WHERE id = ?').get(tRow.assignedAgentId);
                partnerPresence = formatPresence(ag?.lastActiveAt, `IT-Support (${tRow.assignedAgentName || 'Agent'})`);
              } else {
                partnerPresence = formatPresence(null, 'IT-Support-Team');
              }
            } else {
              // Agent sieht Kunden-Status
              const creatorRow = db.prepare('SELECT creator_email FROM tickets WHERE id = ?').get(roomId);
              if (creatorRow) {
                const u = db.prepare('SELECT last_active_at as lastActiveAt FROM users WHERE LOWER(email) = LOWER(?)').get(creatorRow.creator_email);
                partnerPresence = formatPresence(u?.lastActiveAt, 'Kunde');
              }
            }

            const eventSync = `event: sync\ndata: ${JSON.stringify({ isOtherPartyTyping, partnerPresence })}\n\n`;
            controller.enqueue(encoder.encode(eventSync));

          } else if (roomType === 'dashboard') {
            // Dashboard Heartbeat & Zähler
            const pingEvent = `event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`;
            controller.enqueue(encoder.encode(pingEvent));
          } else {
            // Chat room ping
            const pingEvent = `event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`;
            controller.enqueue(encoder.encode(pingEvent));
          }
        } catch (err) {
          // Stream error ignore
        }
      }, 1500);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}

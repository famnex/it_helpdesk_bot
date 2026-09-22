import { withAttachmentMetadata } from '@/lib/uploads';
import { cookies, headers } from 'next/headers';
import { getSessionUser, validateSessionToken } from '@/lib/auth';
import { canAccessRoom, isStaff, guestHash } from '@/lib/access';
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
  const initialUser = await getSessionUser();
  const sessionToken = (await cookies()).get('session')?.value || (await headers()).get('authorization')?.replace(/^Bearer /,'');
  const guest = await guestHash();
  if (!(roomType === 'dashboard' ? isStaff(initialUser) : await canAccessRoom(roomType,roomId,initialUser))) return new Response(null,{status:403});
  let myRole = initialUser?.role || 'customer';
  let myEmail = initialUser?.email?.toLowerCase() || '';

  let lastMsgId = parseInt(searchParams.get('lastMsgId') || '0', 10);
  let lastTicketMsgId = parseInt(searchParams.get('lastTicketMsgId') || '0', 10);
  let lastKnownStatus = '';

  const encoder = new TextEncoder();

  let interval;
  const stream = new ReadableStream({
    cancel() { clearInterval(interval); },
    start(controller) {
      // 1. Initiales Connection-Event senden
      const initialEvent = `event: connected\ndata: ${JSON.stringify({ status: 'connected', time: Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(initialEvent));

      // 2. Heartbeat & Event-Ticker (alle 1.5 Sekunden)
      interval = setInterval(() => {
        if (request.signal.aborted) {
          clearInterval(interval);
          return;
        }

        try {
          const user = sessionToken ? validateSessionToken(sessionToken) : null;
          const chat = roomType === 'chat' ? db.prepare('SELECT * FROM chats WHERE id=?').get(roomId) : null;
          const ticket = roomType === 'ticket' ? db.prepare('SELECT * FROM tickets WHERE id=?').get(roomId) : roomType === 'chat' ? db.prepare('SELECT * FROM tickets WHERE chat_id=?').get(roomId) : null;
          const guestChat = ticket?.chat_id ? db.prepare('SELECT guest_secret_hash FROM chats WHERE id=?').get(ticket.chat_id) : chat;
          const allowed = isStaff(user) || (user && (chat?.owner_user_id === user.id || ticket?.creator_email?.toLowerCase() === user.email.toLowerCase())) || (!sessionToken && guestChat && guest && guestChat.guest_secret_hash === guest);
          if (!allowed || (sessionToken && !user)) { clearInterval(interval); controller.close(); return; }
          myRole = user?.role || 'customer'; myEmail = user?.email?.toLowerCase() || '';
          // Heartbeat für Online-Präsenz
          if (myRole && myEmail) {
            try {
              db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER(?)').run(myEmail);
            } catch (e) {}
          }

          if (roomType === 'ticket' && roomId) {
            // Neue Ticket-Nachrichten abfragen
            const rows = db.prepare(`
              SELECT m.id, m.ticket_id as ticketId, m.chat_message_id as sourceChatMessageId, m.sender_email as senderEmail,
                     m.sender_role as senderRole, m.text, m.is_internal as isInternal, 
                     m.image_url as imageUrl, m.created_at as createdAt,
                     u.name as senderName, u.avatar_url as senderAvatarUrl
              FROM ticket_messages m
              LEFT JOIN users u ON m.sender_email = u.email
              WHERE m.ticket_id = ? AND m.id > ? AND (m.is_internal=0 OR ?)
              ORDER BY m.id ASC
            `).all(roomId, lastMsgId, isStaff(user) ? 1 : 0);

            if (rows.length > 0) {
              lastMsgId = Math.max(...rows.map(r => r.id));
              const eventMsg = `event: messages\ndata: ${JSON.stringify({ newMessages: rows.map(withAttachmentMetadata) })}\n\n`;
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

          } else if (roomType === 'chat') {
            const newMessages = db.prepare('SELECT id,sender,text,image_url as imageUrl,created_at as createdAt,is_flagged as isFlagged FROM chat_messages WHERE chat_id=? AND id>? ORDER BY id').all(roomId,lastMsgId);
            const linked = db.prepare('SELECT id FROM tickets WHERE chat_id=? ORDER BY created_at DESC LIMIT 1').get(roomId);
            const newTicketMessages = linked ? db.prepare('SELECT id,chat_message_id as sourceChatMessageId,sender_email as senderEmail,sender_role as senderRole,text,image_url as imageUrl,created_at as createdAt FROM ticket_messages WHERE ticket_id=? AND id>? AND is_internal=0 ORDER BY id').all(linked.id,lastTicketMsgId) : [];
            if (newMessages.length) lastMsgId = newMessages.at(-1).id;
            if (newTicketMessages.length) lastTicketMsgId = newTicketMessages.at(-1).id;
            controller.enqueue(encoder.encode(`event: messages\ndata: ${JSON.stringify({newMessages:newMessages.map(withAttachmentMetadata),newTicketMessages:newTicketMessages.map(withAttachmentMetadata)})}\n\n`));
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

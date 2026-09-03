import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { sendAgentReplyNotification, sendCustomerReplyNotification } from '@/lib/mailer';
import { queueTicketNotification } from '@/lib/notifications';
import { checkSelfResolutionIntent } from '@/lib/gemini';

/**
 * GET: Ticket-Details und Nachrichten laden
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  try {
    // Ticket laden
    const ticket = db.prepare(`
      SELECT t.id, t.title, t.status, t.creator_email as creatorEmail, 
             t.assigned_agent_id as assignedAgentId, u.email as assignedAgentEmail,
             t.closed_by_email as closedByEmail, t.closed_by_name as closedByName,
             t.closed_by_user_id as closedByUserId, t.closed_at as closedAt,
             t.chat_id as chatId, t.is_authenticated_creator as isAuthenticatedCreator,
             t.solution, t.created_at as createdAt, t.updated_at as updatedAt,
             COALESCE(cu.name, ch.user_name) as creatorName,
             (CASE 
                WHEN t.is_authenticated_creator = 1 THEN 1
                WHEN cu.id IS NOT NULL AND (cu.role IN ('agent', 'admin') OR cu.id LIKE 'usr-%' OR cu.id LIKE 'user-%') THEN 1
                ELSE 0 
              END) as isRegisteredUser
      FROM tickets t
      LEFT JOIN users u ON t.assigned_agent_id = u.id
      LEFT JOIN users cu ON LOWER(t.creator_email) = LOWER(cu.email)
      LEFT JOIN chats ch ON t.chat_id = ch.id
      WHERE t.id = ?
    `).get(id);

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    // Rechteprüfung: Kunden dürfen nur ihre eigenen Tickets sehen
    if (user.role === 'customer' && ticket.creatorEmail !== user.email) {
      return NextResponse.json({ error: 'Keine Berechtigung für dieses Ticket.' }, { status: 403 });
    }

    // Wenn ein Agent oder Admin das Ticket liest, Lesebestätigung (Zeitstempel) aktualisieren
    if (user.role === 'agent' || user.role === 'admin') {
      try {
        db.prepare('UPDATE tickets SET last_agent_read_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      } catch (readErr) {
        console.error('Fehler beim Aktualisieren von last_agent_read_at:', readErr);
      }
    }

    // Nachrichten laden (Kunden dürfen keine internen Vermerke sehen)
    let messages;
    if (user.role === 'customer') {
      messages = db.prepare(`
        SELECT m.id, m.sender_email as senderEmail, m.sender_role as senderRole, 
               m.text, m.image_url as imageUrl, m.created_at as createdAt,
               u.name as senderName, u.avatar_url as senderAvatarUrl
        FROM ticket_messages m
        LEFT JOIN users u ON LOWER(m.sender_email) = LOWER(u.email)
        WHERE m.ticket_id = ? AND m.is_internal = 0
        ORDER BY m.created_at ASC
      `).all(id);
    } else {
      messages = db.prepare(`
        SELECT m.id, m.sender_email as senderEmail, m.sender_role as senderRole, 
               m.text, m.is_internal as isInternal, m.image_url as imageUrl, m.created_at as createdAt,
               u.name as senderName, u.avatar_url as senderAvatarUrl
        FROM ticket_messages m
        LEFT JOIN users u ON LOWER(m.sender_email) = LOWER(u.email)
        WHERE m.ticket_id = ?
        ORDER BY m.created_at ASC
      `).all(id);
    }

    const messagesWithPrefix = messages.map(m => {
      if (m.senderAvatarUrl && !m.senderAvatarUrl.startsWith('/helpdesk')) {
        m.senderAvatarUrl = `/helpdesk${m.senderAvatarUrl}`;
      }
      return m;
    });

    return NextResponse.json({ ticket, messages: messagesWithPrefix });
  } catch (err) {
    console.error('Fehler beim Abrufen des Tickets:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * POST: Nachricht an Ticket senden
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  try {
    const { text, is_internal, imageUrl, image_url } = await request.json();
    const finalImageUrl = imageUrl || image_url || null;

    if (!text && !finalImageUrl) {
      return NextResponse.json({ error: 'Nachrichtentext oder Dateianhang fehlt.' }, { status: 400 });
    }

    // Ticket laden
    const ticket = db.prepare('SELECT title, creator_email, assigned_agent_id FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    // Rechteprüfung: Kunden dürfen nur auf ihre eigenen Tickets antworten
    if (user.role === 'customer' && ticket.creator_email !== user.email) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const isInternal = user.role !== 'customer' && is_internal ? 1 : 0;

    // Nachricht einfügen
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text, is_internal, image_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, user.email, user.role, text || '', isInternal, finalImageUrl);

    // Zeitstempel des Tickets und Lesebestätigung für Agenten aktualisieren
    if (user.role === 'agent' || user.role === 'admin') {
      db.prepare('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP, last_agent_read_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    }

    // E-Mail-Benachrichtigungen über den 5-Minuten-Puffer einreihen (Debouncing)
    if (user.role === 'customer') {
      if (ticket.assigned_agent_id) {
        const agent = db.prepare('SELECT email, name FROM users WHERE id = ?').get(ticket.assigned_agent_id);
        if (agent) {
          await queueTicketNotification({
            ticketId: id,
            recipientEmail: agent.email,
            recipientRole: 'agent',
            senderName: user.name || user.email,
            messageText: text || '(Anhang gesendet)'
          });
        }
      } else {
        // Falls Ticket noch nicht zugewiesen ist: Alle Agenten/Admins benachrichtigen
        const supportTeam = db.prepare("SELECT email FROM users WHERE role IN ('agent', 'admin')").all();
        for (const member of supportTeam) {
          await queueTicketNotification({
            ticketId: id,
            recipientEmail: member.email,
            recipientRole: 'agent',
            senderName: user.name || user.email,
            messageText: text || '(Anhang gesendet)'
          });
        }
      }
    } else if (!isInternal) {
      // Agent hat geantwortet: Ausstehende E-Mail-Puffer an den Agenten verwerfen, da er live im Portal geantwortet hat
      db.prepare("DELETE FROM pending_ticket_notifications WHERE ticket_id = ? AND recipient_role = 'agent' AND sent_at IS NULL").run(id);

      await queueTicketNotification({
        ticketId: id,
        recipientEmail: ticket.creator_email,
        recipientRole: 'customer',
        senderName: user.name || 'IT-Support-Team',
        messageText: text || '(Anhang gesendet)'
      });
    }

    // Prüfen, ob der Kunde mitteilt, dass sich das Ticket erledigt hat / storniert werden soll
    if (user.role === 'customer' && text) {
      try {
        const resolutionCheck = await checkSelfResolutionIntent(text);
        if (resolutionCheck.isResolved) {
          const resolutionNote = `Vom Kunden als erledigt/storniert gemeldet: "${text}"`;
          const autoBotReply = "Vielen Dank für die Rückmeldung! Das Ticket wurde als erledigt geschlossen. Solltest du später erneut Hilfe benötigen, kannst du dich jederzeit wieder bei uns melden.";

          db.prepare(`
            UPDATE tickets 
            SET status = 'closed',
                solution = ?,
                closed_at = CURRENT_TIMESTAMP,
                closed_by_name = ?,
                closed_by_email = ?,
                closed_by_user_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(resolutionNote, user.name || user.email || 'Kunde', user.email, user.id || 'customer', id);

          db.prepare(`
            INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
            VALUES (?, 'IT-Support-Team', 'bot', ?)
          `).run(id, autoBotReply);

          db.prepare(`
            INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
            VALUES (?, 'system', 'system', ?)
          `).run(id, `[SYSTEM_EVENT: TICKET_CLOSED_BY_CUSTOMER] Ticket wurde durch den Kunden als erledigt/storniert gemeldet ("${text}").`);

          // Agenten benachrichtigen
          if (ticket.assigned_agent_id) {
            const agent = db.prepare('SELECT email, name FROM users WHERE id = ?').get(ticket.assigned_agent_id);
            if (agent) {
              await queueTicketNotification({
                ticketId: id,
                recipientEmail: agent.email,
                recipientRole: 'agent',
                senderName: user.name || user.email,
                messageText: `[Ticket durch Kunden als erledigt geschlossen]: ${text}`
              });
            }
          }

          return NextResponse.json({ 
            success: true, 
            isClosedByCustomer: true,
            message: 'Ticket wurde als erledigt geschlossen.' 
          });
        }
      } catch (resErr) {
        console.error('Fehler bei Self-Resolution-Check in Ticket-Route:', resErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Hinzufügen der Ticketnachricht:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * DELETE: Ticket dauerhaft löschen (nur für Admins)
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const ticket = db.prepare('SELECT id, chat_id FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    // 1. Ticketnachrichten löschen
    db.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').run(id);

    // 2. Ticket löschen
    db.prepare('DELETE FROM tickets WHERE id = ?').run(id);

    // 3. Falls verknüpfter Chat existiert: ticket_created zurücksetzen
    if (ticket.chat_id) {
      db.prepare('UPDATE chats SET ticket_created = 0 WHERE id = ?').run(ticket.chat_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Löschen des Tickets:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * PUT: Ticket-Metadaten (z.B. Thema/Titel) aktualisieren oder Ticket wieder öffnen (nur für Mitarbeiter)
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user || !['agent', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // 1. Ticket wieder öffnen
    if (body.action === 'reopen' || body.status === 'open' || body.status === 'assigned' || body.reopen) {
      const ticket = db.prepare('SELECT id, title, assigned_agent_id, status FROM tickets WHERE id = ?').get(id);
      if (!ticket) {
        return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
      }

      const reopenStatus = ticket.assigned_agent_id ? 'assigned' : 'open';
      db.prepare(`
        UPDATE tickets 
        SET status = ?, 
            closed_at = NULL, 
            closed_by_name = NULL, 
            closed_by_email = NULL, 
            closed_by_user_id = NULL,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(reopenStatus, id);

      const agentName = user.name || user.email.split('@')[0];
      db.prepare(`
        INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
        VALUES (?, 'system', 'system', ?)
      `).run(id, `Ticket wurde durch Mitarbeiter ${agentName} (${user.email}) wieder geöffnet.`);

      return NextResponse.json({ success: true, status: reopenStatus });
    }

    // 2. Thema / Titel bearbeiten
    const { title } = body;
    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: 'Titel darf nicht leer sein.' }, { status: 400 });
    }

    const ticket = db.prepare('SELECT title FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    const oldTitle = ticket.title;
    const newTitle = title.trim();

    if (oldTitle !== newTitle) {
      // Titel in DB aktualisieren
      db.prepare('UPDATE tickets SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newTitle, id);

      // Systemnachricht im Ticket hinterlassen
      db.prepare(`
        INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text, is_internal)
        VALUES (?, 'system', 'system', ?, 0)
      `).run(id, `Thema des Tickets wurde von "${oldTitle}" in "${newTitle}" geändert.`);
    }

    return NextResponse.json({ success: true, title: newTitle });
  } catch (err) {
    console.error('Fehler beim Aktualisieren des Tickets:', err);
    return NextResponse.json({ error: 'Serverfehler beim Aktualisieren.' }, { status: 500 });
  }
}

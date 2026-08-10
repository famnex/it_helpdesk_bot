import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { sendAgentReplyNotification, sendCustomerReplyNotification } from '@/lib/mailer';

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
             t.chat_id as chatId, t.is_authenticated_creator as isAuthenticatedCreator,
             t.solution, t.created_at as createdAt, t.updated_at as updatedAt,
             cu.name as creatorName,
             (CASE 
                WHEN t.is_authenticated_creator = 1 THEN 1
                WHEN cu.id IS NOT NULL AND (cu.role IN ('agent', 'admin') OR cu.id LIKE 'usr-%') THEN 1
                ELSE 0 
              END) as isRegisteredUser
      FROM tickets t
      LEFT JOIN users u ON t.assigned_agent_id = u.id
      LEFT JOIN users cu ON t.creator_email = cu.email
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
               m.text, m.created_at as createdAt,
               u.name as senderName, u.avatar_url as senderAvatarUrl
        FROM ticket_messages m
        LEFT JOIN users u ON m.sender_email = u.email
        WHERE m.ticket_id = ? AND m.is_internal = 0
        ORDER BY m.created_at ASC
      `).all(id);
    } else {
      messages = db.prepare(`
        SELECT m.id, m.sender_email as senderEmail, m.sender_role as senderRole, 
               m.text, m.is_internal as isInternal, m.created_at as createdAt,
               u.name as senderName, u.avatar_url as senderAvatarUrl
        FROM ticket_messages m
        LEFT JOIN users u ON m.sender_email = u.email
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
    const { text, is_internal } = await request.json();
    if (!text) {
      return NextResponse.json({ error: 'Nachrichtentext fehlt.' }, { status: 400 });
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
      INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text, is_internal)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, user.email, user.role, text, isInternal);

    // Zeitstempel des Tickets und Lesebestätigung für Agenten aktualisieren
    if (user.role === 'agent' || user.role === 'admin') {
      db.prepare('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP, last_agent_read_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    }

    // E-Mail-Benachrichtigungen senden
    if (user.role === 'customer') {
      // Wenn der Kunde antwortet, den zugewiesenen Agenten informieren
      if (ticket.assigned_agent_id) {
        const agent = db.prepare('SELECT email FROM users WHERE id = ?').get(ticket.assigned_agent_id);
        if (agent) {
          await sendCustomerReplyNotification(agent.email, id, ticket.title);
        }
      }
    } else if (!isInternal) {
      // Wenn der Agent öffentlich antwortet, den Kunden informieren
      await sendAgentReplyNotification(ticket.creator_email, id, ticket.title);
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
    const result = db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Löschen des Tickets:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * PUT: Ticket-Metadaten (z.B. Thema/Titel) aktualisieren (nur für Mitarbeiter)
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user || !['agent', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { title } = await request.json();
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

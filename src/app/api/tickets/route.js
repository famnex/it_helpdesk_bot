import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET: Gibt die Tickets aus.
 * - Kunden sehen nur ihre eigenen Tickets.
 * - Agenten/Admins sehen alle Tickets.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  try {
    let tickets;
    if (user.role === 'customer') {
      // Nur eigene Tickets holen
      tickets = db.prepare(`
        SELECT t.id, t.title, t.status, t.creator_email as creatorEmail, 
               t.assigned_agent_id as assignedAgentId, u.email as assignedAgentEmail,
               t.chat_id as chatId,
               t.created_at as createdAt, t.updated_at as updatedAt
        FROM tickets t
        LEFT JOIN users u ON t.assigned_agent_id = u.id
        WHERE t.creator_email = ?
        ORDER BY t.created_at DESC
      `).all(user.email);
    } else {
      // Alle Tickets für Agenten und Admins holen
      tickets = db.prepare(`
        SELECT t.id, t.title, t.status, t.creator_email as creatorEmail, 
               t.assigned_agent_id as assignedAgentId, u.email as assignedAgentEmail,
               t.chat_id as chatId,
               t.created_at as createdAt, t.updated_at as updatedAt
        FROM tickets t
        LEFT JOIN users u ON t.assigned_agent_id = u.id
        ORDER BY t.created_at DESC
      `).all();
    }

    return NextResponse.json({ tickets });
  } catch (err) {
    console.error('Fehler beim Laden der Tickets:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * POST: Erstellt ein neues Ticket.
 * - Wenn nicht angemeldet, muss eine E-Mail-Adresse übergeben werden.
 */
export async function POST(request) {
  try {
    const user = await getSessionUser();
    const data = await request.json();
    
    let email = user ? user.email : data.creator_email;
    
    if (!email) {
      return NextResponse.json({ 
        error: 'E-Mail-Adresse ist erforderlich.', 
        emailRequired: true 
      }, { status: 400 });
    }

    const title = data.title || 'Support-Anfrage über Chat-Assistent';

    // Eindeutige Ticket-ID generieren (TK-XXXX)
    let ticketId;
    let isUnique = false;
    const checkStmt = db.prepare('SELECT id FROM tickets WHERE id = ?');
    
    while (!isUnique) {
      ticketId = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = checkStmt.get(ticketId);
      if (!existing) {
        isUnique = true;
      }
    }

    const chatId = data.chat_id || null;

    // Ticket anlegen
    db.prepare(`
      INSERT INTO tickets (id, title, status, creator_email, chat_id) 
      VALUES (?, ?, 'open', ?, ?)
    `).run(ticketId, title, email, chatId);

    // Initiale System-Nachricht einfügen
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) 
      VALUES (?, 'system', 'system', ?)
    `).run(ticketId, 'System', `Ticket ${ticketId} wurde erstellt.`);

    return NextResponse.json({ 
      success: true, 
      ticketId, 
      title, 
      creator_email: email 
    });

  } catch (err) {
    console.error('Fehler beim Erstellen des Tickets:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

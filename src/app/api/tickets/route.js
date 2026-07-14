import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateTicketTitle, determineAgentAssignment } from '@/lib/gemini';
import { sendAssignmentNotification, sendUnassignedTicketNotification } from '@/lib/mailer';

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
               t.created_at as createdAt, t.updated_at as updatedAt,
               cu.name as creatorName
        FROM tickets t
        LEFT JOIN users u ON t.assigned_agent_id = u.id
        LEFT JOIN users cu ON t.creator_email = cu.email
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

    let title = data.title || 'Support-Anfrage über Chat-Assistent';
    const chatId = data.chat_id || null;

    // Wenn ein Chat verknüpft ist, generiere den Titel per KI
    if (chatId) {
      try {
        const chatMessages = db.prepare(`
          SELECT sender, text FROM chat_messages 
          WHERE chat_id = ? 
          ORDER BY created_at ASC
        `).all(chatId);
        
        if (chatMessages.length > 0) {
          const aiTitle = await generateTicketTitle(chatMessages);
          if (aiTitle) {
            title = aiTitle;
          }
        }
      } catch (e) {
        console.error('Fehler bei KI-Titelgenerierung:', e);
      }
    }

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

    // 1. Alle Agenten/Admins mit hinterlegten Zuständigkeiten holen
    const potentialAgents = db.prepare(`
      SELECT id, email, name, responsibilities 
      FROM users 
      WHERE (role = 'agent' OR role = 'admin') 
        AND responsibilities IS NOT NULL 
        AND responsibilities != ''
    `).all();

    let matchedAgentId = null;
    let chatMessages = [];
    if (chatId) {
      chatMessages = db.prepare(`
        SELECT sender, text FROM chat_messages 
        WHERE chat_id = ? 
        ORDER BY created_at ASC
      `).all(chatId);
    }

    if (potentialAgents.length > 0) {
      try {
        matchedAgentId = await determineAgentAssignment(title, chatMessages, potentialAgents);
      } catch (err) {
        console.error('Fehler bei der automatischen Ticket-Zuweisung:', err);
      }
    }

    let status = 'open';
    let assignedAgentId = null;
    let matchedAgent = null;

    if (matchedAgentId) {
      matchedAgent = potentialAgents.find(a => a.id === matchedAgentId);
      if (matchedAgent) {
        status = 'assigned';
        assignedAgentId = matchedAgentId;
      }
    }

    // Ticket anlegen
    db.prepare(`
      INSERT INTO tickets (id, title, status, creator_email, assigned_agent_id, chat_id) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ticketId, title, status, email, assignedAgentId, chatId);

    // Chat als ticket_created markieren und System-Event im Chatverlauf speichern, falls nicht bereits vorhanden
    if (chatId) {
      db.prepare('UPDATE chats SET ticket_created = 1 WHERE id = ?').run(chatId);
      
      const eventText = `[SYSTEM_EVENT: TICKET_CREATED: ${ticketId}]`;
      const exists = db.prepare('SELECT id FROM chat_messages WHERE chat_id = ? AND text = ?').get(chatId, eventText);
      if (!exists) {
        db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'user\', ?)')
          .run(chatId, eventText);
      }
    }

    // Initiale System-Nachricht einfügen
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) 
      VALUES (?, 'system', 'system', ?)
    `).run(ticketId, 'System', `Ticket ${ticketId} wurde erstellt.`);

    // Zuweisungsnachricht und E-Mail-Benachrichtigungen
    if (matchedAgent) {
      db.prepare(`
        INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) 
        VALUES (?, 'system', 'system', ?)
      `).run(ticketId, 'System', `Ticket wurde automatisch ${matchedAgent.email} zugewiesen.`);
      
      // Benachrichtige den zugewiesenen Agenten
      try {
        await sendAssignmentNotification(matchedAgent.email, ticketId, title);
      } catch (mailErr) {
        console.error('Fehler beim Senden der Zuweisungs-Mail:', mailErr);
      }
    } else {
      // Wenn nicht zugewiesen, alle Agenten und Admins informieren
      try {
        const allAgents = db.prepare("SELECT email FROM users WHERE role = 'agent' OR role = 'admin'").all();
        const agentEmails = allAgents.map(a => a.email);
        if (agentEmails.length > 0) {
          await sendUnassignedTicketNotification(agentEmails, ticketId, title);
        }
      } catch (mailErr) {
        console.error('Fehler beim Senden der Unzugewiesen-Mails:', mailErr);
      }
    }

    return NextResponse.json({ 
      success: true, 
      ticketId, 
      title, 
      creator_email: email,
      assignedAgentId
    });

  } catch (err) {
    console.error('Fehler beim Erstellen des Tickets:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

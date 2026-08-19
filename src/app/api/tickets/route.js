import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateTicketTitle, determineAgentAssignment } from '@/lib/gemini';
import { sendAssignmentNotification, sendUnassignedTicketNotification, sendTicketCreatedNotification } from '@/lib/mailer';

/**
 * GET: Gibt die Tickets aus.
 * - Kunden sehen nur ihre eigenen Tickets.
 * - Agenten/Admins sehen alle Tickets.
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status') || 'active'; // 'active' (default, status != 'closed'), 'closed', 'all'

  try {
    let tickets;
    const params = [];

    if (user.role === 'customer') {
      let customerWhere = 'WHERE t.creator_email = ?';
      params.push(user.email);
      if (statusFilter === 'active') {
        customerWhere += " AND t.status != 'closed'";
      } else if (statusFilter === 'closed') {
        customerWhere += " AND t.status = 'closed'";
      }

      tickets = db.prepare(`
        SELECT t.id, t.title, t.status, t.creator_email as creatorEmail, 
               t.assigned_agent_id as assignedAgentId, u.email as assignedAgentEmail,
               t.closed_by_email as closedByEmail, t.closed_by_name as closedByName,
               t.closed_by_user_id as closedByUserId, t.closed_at as closedAt,
               t.chat_id as chatId, t.is_authenticated_creator as isAuthenticatedCreator,
               t.created_at as createdAt, t.updated_at as updatedAt
        FROM tickets t
        LEFT JOIN users u ON t.assigned_agent_id = u.id
        ${customerWhere}
        ORDER BY t.created_at DESC
      `).all(...params);
    } else {
      let agentWhere = '';
      if (statusFilter === 'active') {
        agentWhere = "WHERE t.status != 'closed'";
      } else if (statusFilter === 'closed') {
        agentWhere = "WHERE t.status = 'closed'";
      }

      tickets = db.prepare(`
        SELECT t.id, t.title, t.status, t.creator_email as creatorEmail, 
               t.assigned_agent_id as assignedAgentId, u.email as assignedAgentEmail,
               t.closed_by_email as closedByEmail, t.closed_by_name as closedByName,
               t.closed_by_user_id as closedByUserId, t.closed_at as closedAt,
               t.chat_id as chatId, t.is_authenticated_creator as isAuthenticatedCreator,
               t.last_agent_read_at as lastAgentReadAt,
               t.created_at as createdAt, t.updated_at as updatedAt,
               cu.name as creatorName,
               (CASE 
                  WHEN t.is_authenticated_creator = 1 THEN 1
                  WHEN cu.id IS NOT NULL AND (cu.role IN ('agent', 'admin') OR cu.id LIKE 'usr-%') THEN 1
                  ELSE 0 
                END) as isRegisteredUser,
               (CASE
                  WHEN t.last_agent_read_at IS NULL THEN 1
                  WHEN EXISTS (
                    SELECT 1 FROM ticket_messages tm 
                    WHERE tm.ticket_id = t.id 
                      AND tm.sender_role = 'customer' 
                      AND tm.created_at > t.last_agent_read_at
                  ) THEN 1
                  WHEN t.chat_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM chat_messages cm 
                    WHERE cm.chat_id = t.chat_id 
                      AND cm.sender = 'user' 
                      AND cm.created_at > t.last_agent_read_at
                  ) THEN 1
                  ELSE 0
                END) as hasUnread
        FROM tickets t
        LEFT JOIN users u ON t.assigned_agent_id = u.id
        LEFT JOIN users cu ON t.creator_email = cu.email
        ${agentWhere}
        ORDER BY t.created_at DESC
      `).all();
    }

    let counts = { active: 0, closed: 0, unassigned: 0, mine: 0, unread: 0 };

    if (user.role === 'customer') {
      const countsRow = db.prepare(`
        SELECT 
          SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
        FROM tickets
        WHERE creator_email = ?
      `).get(user.email);

      counts = {
        active: countsRow?.active || 0,
        closed: countsRow?.closed || 0,
        unassigned: 0,
        mine: 0,
        unread: 0
      };
    } else {
      const countsRow = db.prepare(`
        SELECT 
          SUM(CASE WHEN t.status != 'closed' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN t.status = 'closed' THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN t.status != 'closed' AND (t.assigned_agent_id IS NULL OR t.assigned_agent_id = '') THEN 1 ELSE 0 END) as unassigned,
          SUM(CASE WHEN t.status != 'closed' AND t.assigned_agent_id = ? THEN 1 ELSE 0 END) as mine,
          SUM(CASE WHEN t.status != 'closed' AND (
            t.last_agent_read_at IS NULL OR EXISTS (
              SELECT 1 FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.sender_role = 'customer' AND tm.created_at > t.last_agent_read_at
            ) OR (
              t.chat_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM chat_messages cm WHERE cm.chat_id = t.chat_id AND cm.sender = 'user' AND cm.created_at > t.last_agent_read_at
              )
            )
          ) THEN 1 ELSE 0 END) as unread
        FROM tickets t
      `).get(user.id);

      counts = {
        active: countsRow?.active || 0,
        closed: countsRow?.closed || 0,
        unassigned: countsRow?.unassigned || 0,
        mine: countsRow?.mine || 0,
        unread: countsRow?.unread || 0
      };
    }

    return NextResponse.json({ tickets, counts });
  } catch (err) {
    console.error('Fehler beim Laden der Tickets:', err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
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
    
    const isAgent = user && (user.role === 'agent' || user.role === 'admin');
    let email = (isAgent && data.creator_email) ? data.creator_email : (user ? user.email : data.creator_email);
    
    if (!email) {
      return NextResponse.json({ 
        error: 'E-Mail-Adresse ist erforderlich.', 
        emailRequired: true 
      }, { status: 400 });
    }

    // Falls der Kunde noch nicht in der Tabelle 'users' existiert, direkt anlegen
    if (email) {
      const userExists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (!userExists) {
        const customerId = `user-${Math.floor(100000 + Math.random() * 900000)}`;
        const customerName = data.creator_name || email.split('@')[0];
        db.prepare('INSERT INTO users (id, email, role, name) VALUES (?, ?, \'customer\', ?)')
          .run(customerId, email, customerName);
      }
    }

    let title = data.title || 'Support-Anfrage';
    const chatId = data.chat_id || null;

    // Wenn ein Chat verknüpft ist, generiere den Titel per KI aus dem Verlauf (auch im Direktmodus)
    if (chatId) {
      try {
        const chatMessages = db.prepare(`
          SELECT sender, text FROM chat_messages 
          WHERE chat_id = ? 
          ORDER BY created_at ASC
        `).all(chatId);
        
        if (chatMessages.length > 0) {
          const aiTitle = await generateTicketTitle(chatMessages);
          if (aiTitle && aiTitle.trim()) {
            title = aiTitle.trim();
          }
        }
      } catch (e) {
        console.error('Fehler bei KI-Titelgenerierung:', e);
      }
    }

    // Fallback: Falls kein KI-Titel erzeugt werden konnte und der Titel zu lang / mehrzeilig ist (z. B. ganze Problembeschreibung)
    if (title.length > 60 || title.includes('\n')) {
      const firstLine = title.split('\n')[0].trim();
      title = firstLine.length > 55 ? firstLine.substring(0, 55).trim() + '...' : firstLine;
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
    // Sicherstellen, dass der Chat in der Datenbank existiert, falls übergeben (Fremdschlüssel-Sicherheit)
    if (chatId) {
      const chatExists = db.prepare('SELECT id FROM chats WHERE id = ?').get(chatId);
      if (!chatExists) {
        const chatUserName = (data.creator_email && data.creator_name) 
          ? data.creator_name 
          : (user && user.email === email ? user.name : null);
        db.prepare('INSERT INTO chats (id, user_email, user_name) VALUES (?, ?, ?)')
          .run(chatId, email, chatUserName);
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

    let requestedAssignee = data.assignedAgentId || data.assigned_agent_id;

    // Wenn der Ersteller explizit 'me' wählt, direkt ihm selbst zuweisen
    if (requestedAssignee === 'me' && isAgent) {
      requestedAssignee = user.id;
    }

    if (requestedAssignee && requestedAssignee !== 'auto' && requestedAssignee !== 'unassigned') {
      const explicitAgent = db.prepare("SELECT id, email, name FROM users WHERE id = ? AND (role = 'agent' OR role = 'admin')").get(requestedAssignee);
      if (explicitAgent) {
        status = 'assigned';
        assignedAgentId = explicitAgent.id;
        matchedAgent = explicitAgent;
      }
    } else if (requestedAssignee !== 'unassigned') {
      // 'auto' oder keine explizite Angabe -> Automatische KI-/Keyword-Zuweisung anwenden
      if (matchedAgentId) {
        matchedAgent = potentialAgents.find(a => a.id === matchedAgentId);
        if (matchedAgent) {
          status = 'assigned';
          assignedAgentId = matchedAgentId;
        }
      } else if (isAgent && requestedAssignee !== 'auto') {
        // Fallback für Agenten im Backend, wenn keine automatische Zuweisung passt
        status = 'assigned';
        assignedAgentId = user.id;
        matchedAgent = user;
      }
    }

    const isAuthenticatedCreator = (user && user.email === email) ? 1 : 0;

    // Ticket anlegen
    db.prepare(`
      INSERT INTO tickets (id, title, status, creator_email, assigned_agent_id, chat_id, is_authenticated_creator) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ticketId, title, status, email, assignedAgentId, chatId, isAuthenticatedCreator);

    // Chat als ticket_created markieren, System-Event und Chat-Verlauf im Ticket speichern
    if (chatId) {
      db.prepare('UPDATE chats SET ticket_created = 1 WHERE id = ?').run(chatId);
      
      const eventText = `[SYSTEM_EVENT: TICKET_CREATED: ${ticketId}]`;
      const exists = db.prepare('SELECT id FROM chat_messages WHERE chat_id = ? AND text = ?').get(chatId, eventText);
      if (!exists) {
        db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'user\', ?)')
          .run(chatId, eventText);
        
        // Handover-Mitteilung des Bots einfügen
        const handoverText = "Dein Anliegen wurde an die IT-Abteilung übergeben. Der Bot antwortet in diesem Chat ab jetzt nicht mehr, da ein menschlicher Support-Mitarbeiter zuständig ist. Antwortzeiten können etwas dauern. Du kannst hier jederzeit weitere Informationen ergänzen – diese werden automatisch an die IT-Abteilung weitergeleitet.";
        db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'bot\', ?)')
          .run(chatId, handoverText);
      }

      // Chat-Verlauf vollständig in die Ticket-Nachrichten importieren
      try {
        const rawChatMsgs = db.prepare(`
          SELECT sender, text, image_url, created_at 
          FROM chat_messages 
          WHERE chat_id = ? AND text NOT LIKE '[SYSTEM_EVENT:%'
          ORDER BY created_at ASC
        `).all(chatId);

        const insertTmStmt = db.prepare(`
          INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text, image_url, created_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        `);

        for (const cMsg of rawChatMsgs) {
          const sRole = cMsg.sender === 'user' ? 'customer' : 'bot';
          const sEmail = cMsg.sender === 'user' ? email : 'IT-Support-Bot';
          insertTmStmt.run(ticketId, sEmail, sRole, cMsg.text, cMsg.image_url || null, cMsg.created_at || null);
        }
      } catch (importErr) {
        console.error('Fehler beim Importieren des Chat-Verlaufs ins Ticket:', importErr);
      }
    }

    // Initiale System-Nachricht einfügen
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) 
      VALUES (?, 'system', 'system', ?)
    `).run(ticketId, `Ticket ${ticketId} wurde erstellt.`);

    // Zuweisungsnachricht und E-Mail-Benachrichtigungen
    if (matchedAgent) {
      db.prepare(`
        INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) 
        VALUES (?, 'system', 'system', ?)
      `).run(ticketId, `Ticket wurde automatisch ${matchedAgent.email} zugewiesen.`);
      
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

    // Kunden über die erfolgreiche Ticket-Erstellung per E-Mail benachrichtigen
    if (email) {
      try {
        await sendTicketCreatedNotification(email, ticketId, title);
      } catch (custMailErr) {
        console.error('Fehler beim Senden der Ticket-Erstellungs-Mail an Kunden:', custMailErr);
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

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { extractKnowledgeChunks, processAndSaveChunks, generateSolutionContext } from '@/lib/gemini';
import { sendTicketResolvedNotification } from '@/lib/mailer';
import { flushTicketNotificationsNow } from '@/lib/notifications';

export async function POST(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user || !['agent', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { solution, message, learnBotKnowledge } = await request.json();
    const closingMessage = (message || solution || '').trim();

    if (!closingMessage) {
      return NextResponse.json({ error: 'Eine Abschlussnachricht an den Kunden ist erforderlich.' }, { status: 400 });
    }

    // Ticket laden
    const ticket = db.prepare('SELECT title, status, creator_email as creatorEmail FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    if (ticket.status === 'closed') {
      return NextResponse.json({ error: 'Ticket ist bereits geschlossen.' }, { status: 400 });
    }

    // Ausstehende gepufferte Benachrichtigungen für dieses Ticket sofort versenden
    try {
      await flushTicketNotificationsNow(id);
    } catch (flushErr) {
      console.error('Fehler beim sofortigen Flashen der Benachrichtigungen vor Ticket-Schließung:', flushErr);
    }

    const closingName = user.name || user.email.split('@')[0];
    const closingEmail = user.email.toLowerCase();
    const closingUserId = user.id;

    // Status aktualisieren und Schließungs-Informationen eintragen
    db.prepare(`
      UPDATE tickets 
      SET status = 'closed', 
          solution = ?, 
          closed_by_email = ?, 
          closed_by_name = ?, 
          closed_by_user_id = ?, 
          closed_at = CURRENT_TIMESTAMP, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(closingMessage, closingEmail, closingName, closingUserId, id);

    const closingUserText = user.name ? `${user.name} (${user.email})` : user.email;

    // Abschlussnachricht als Agentennachricht einfügen (sichtbar für Kunde und Agent)
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) 
      VALUES (?, ?, ?, ?)
    `).run(id, user.email, user.role, closingMessage);

    // Systemkommentar zur Schließung einfügen
    const systemText = ticket.creatorEmail 
      ? `Ticket wurde von ${closingUserText} geschlossen. Abschlussnachricht und Bewertungsaufforderung wurden an den Kunden gesendet.` 
      : `Ticket wurde von ${closingUserText} geschlossen.`;
    db.prepare('INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) VALUES (?, \'system\', \'system\', ?)')
      .run(id, systemText);

    // Benachrichtige den Kunden über die Abschlussnachricht & 1-Klick-Sternebewertung per E-Mail
    if (ticket.creatorEmail) {
      try {
        await sendTicketResolvedNotification(ticket.creatorEmail, id, ticket.title, closingMessage);
      } catch (mailErr) {
        console.error('Fehler beim Senden der Abschluss-Benachrichtigung per E-Mail:', mailErr);
      }
    }

    // --- KI Wissens-Extraktion & Deduplizierung NUR wenn learnBotKnowledge === true ---
    let savedChunks = [];
    let computedContext = null;
    if (learnBotKnowledge === true) {
      const messages = db.prepare('SELECT sender_role, text FROM ticket_messages WHERE ticket_id = ? AND is_internal = 0 ORDER BY created_at ASC').all(id);
      
      let ticketHistoryText = `TICKET: ${id}\nTHEMA: ${ticket.title}\n\nVERLAUF:\n`;
      messages.forEach(m => {
        ticketHistoryText += `${m.sender_role.toUpperCase()}: ${m.text}\n`;
      });
      ticketHistoryText += `\nLÖSUNG / ABSCHLUSS: ${closingMessage}`;

      try {
        // 0. Kurze Zusammenfassung des Problems erstellen
        computedContext = await generateSolutionContext(ticketHistoryText);
        db.prepare('UPDATE tickets SET solution_context = ? WHERE id = ?').run(computedContext, id);

        // 1. Chunks extrahieren (Gemini 2.5 Flash)
        const extractedChunks = await extractKnowledgeChunks(ticketHistoryText);
        
        // 2. Chunks deduplizieren und speichern (Gemini 2.5 Flash)
        savedChunks = await processAndSaveChunks(extractedChunks, 'ticket');
      } catch (kiErr) {
        console.error('Fehler bei der KI-Chunkextraktion beim Schließen:', kiErr);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Ticket wurde erfolgreich geschlossen.',
      solutionContext: computedContext,
      savedChunks 
    });

  } catch (err) {
    console.error('Fehler beim Schließen des Tickets:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

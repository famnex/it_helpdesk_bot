import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { extractKnowledgeChunks, processAndSaveChunks } from '@/lib/gemini';
import { sendTicketResolvedNotification } from '@/lib/mailer';

export async function POST(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user || !['agent', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { solution } = await request.json();
    if (!solution || solution.trim().length === 0) {
      return NextResponse.json({ error: 'Eine Lösung ist zum Schließen des Tickets erforderlich.' }, { status: 400 });
    }

    // Ticket laden
    const ticket = db.prepare('SELECT title, status, creator_email as creatorEmail FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    if (ticket.status === 'closed') {
      return NextResponse.json({ error: 'Ticket ist bereits geschlossen.' }, { status: 400 });
    }

    // Status aktualisieren und Lösung eintragen
    db.prepare('UPDATE tickets SET status = \'closed\', solution = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(solution, id);

    // Systemkommentar einfügen
    const systemText = ticket.creatorEmail 
      ? `Ticket wurde geschlossen mit Lösung: ${solution} (Kunde per E-Mail benachrichtigt.)` 
      : `Ticket wurde geschlossen mit Lösung: ${solution}`;
    db.prepare('INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) VALUES (?, \'system\', \'system\', ?)')
      .run(id, systemText);

    // Benachrichtige den Kunden über die Lösung per E-Mail
    if (ticket.creatorEmail) {
      try {
        await sendTicketResolvedNotification(ticket.creatorEmail, id, ticket.title, solution);
      } catch (mailErr) {
        console.error('Fehler beim Senden der Lösungs-Benachrichtigung per E-Mail:', mailErr);
      }
    }

    // --- KI Wissens-Extraktion & Deduplizierung im Hintergrund (bzw. asynchron) ---
    // Wir holen alle öffentlichen Nachrichten des Tickets
    const messages = db.prepare('SELECT sender_role, text FROM ticket_messages WHERE ticket_id = ? AND is_internal = 0 ORDER BY created_at ASC').all(id);
    
    let ticketHistoryText = `TICKET: ${id}\nTHEMA: ${ticket.title}\n\nVERLAUF:\n`;
    messages.forEach(m => {
      ticketHistoryText += `${m.sender_role.toUpperCase()}: ${m.text}\n`;
    });
    ticketHistoryText += `\nLÖSUNG: ${solution}`;

    let savedChunks = [];
    try {
      // 1. Chunks extrahieren (Gemini 2.5 Flash)
      const extractedChunks = await extractKnowledgeChunks(ticketHistoryText);
      
      // 2. Chunks deduplizieren und speichern (Gemini 2.5 Flash)
      savedChunks = await processAndSaveChunks(extractedChunks, 'ticket');
    } catch (kiErr) {
      console.error('Fehler bei der KI-Chunkextraktion beim Schließen:', kiErr);
      // Wir werfen hier keinen Fehler, da das Ticket bereits geschlossen wurde
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Ticket wurde geschlossen.',
      savedChunks 
    });

  } catch (err) {
    console.error('Fehler beim Schließen des Tickets:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateSolutionContext } from '@/lib/gemini';

/**
 * GET: Alle gespeicherten Ticket-Lösungen laden.
 * Dies lädt alle Tickets mit gelöstem Status, die eine eingetragene Lösung haben und nicht "vergessen" wurden.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const solutions = db.prepare(`
      SELECT id, title, solution, solution_context as solutionContext, creator_email as creatorEmail, updated_at as updatedAt
      FROM tickets
      WHERE status = 'closed' 
        AND solution IS NOT NULL 
        AND solution != '' 
        AND solution != 'Ohne Lösung geschlossen'
        AND LOWER(solution) NOT LIKE 'ticket wurde%geschlossen%'
        AND (solution_forgotten IS NULL OR solution_forgotten = 0)
      ORDER BY updated_at DESC
    `).all();

    return NextResponse.json({ solutions });
  } catch (err) {
    console.error('Fehler beim Abrufen der gespeicherten Lösungen:', err);
    return NextResponse.json({ error: 'Serverfehler beim Laden der Lösungen.' }, { status: 500 });
  }
}

/**
 * POST (Aktion 'forget' oder 'generate-context'): Ermöglicht das "Vergessen" oder das nachträgliche Generieren einer Zusammenfassung.
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { ticketId, action } = await request.json();
    if (!ticketId || !['forget', 'generate-context'].includes(action)) {
      return NextResponse.json({ error: 'Ungültige Parameter.' }, { status: 400 });
    }

    if (action === 'forget') {
      // Lösung vergessen: Spalte solution in Tabelle tickets leeren bzw. auf neutralen Text setzen und solution_forgotten flaggen
      db.prepare("UPDATE tickets SET solution = 'Ohne Lösung geschlossen', solution_forgotten = 1 WHERE id = ?").run(ticketId);

      // Einen Systemkommentar im Verlauf des Tickets anlegen
      db.prepare(`
        INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) 
        VALUES (?, 'system', 'system', 'Die hinterlegte Lösung dieses Tickets wurde von einem Administrator aus der Wissensbasis gelöscht (Vergessen-Funktion).')
      `).run(ticketId);

      return NextResponse.json({ success: true });
    }

    if (action === 'generate-context') {
      // Ticket laden
      const ticket = db.prepare('SELECT title, solution FROM tickets WHERE id = ?').get(ticketId);
      if (!ticket) {
        return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
      }

      // Ticket-Verlauf laden
      const messages = db.prepare('SELECT sender_role, text FROM ticket_messages WHERE ticket_id = ? AND is_internal = 0 ORDER BY created_at ASC').all(ticketId);
      
      let ticketHistoryText = `TICKET: ${ticketId}\nTHEMA: ${ticket.title}\n\nVERLAUF:\n`;
      messages.forEach(m => {
        ticketHistoryText += `${m.sender_role.toUpperCase()}: ${m.text}\n`;
      });
      ticketHistoryText += `\nLÖSUNG: ${ticket.solution}`;

      // Zusammenfassung erstellen
      const computedContext = await generateSolutionContext(ticketHistoryText);
      db.prepare('UPDATE tickets SET solution_context = ? WHERE id = ?').run(computedContext, ticketId);

      return NextResponse.json({ success: true, solutionContext: computedContext });
    }

  } catch (err) {
    console.error('Fehler bei der Solutions-Aktion:', err);
    return NextResponse.json({ error: 'Serverfehler bei der Ausführung der Aktion.' }, { status: 500 });
  }
}

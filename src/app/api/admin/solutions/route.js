import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET: Alle gespeicherten Ticket-Lösungen laden.
 * Dies lädt alle Tickets mit gelöstem Status, die eine eingetragene Lösung haben.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const solutions = db.prepare(`
      SELECT id, title, solution, creator_email as creatorEmail, updated_at as updatedAt
      FROM tickets
      WHERE status = 'closed' AND solution IS NOT NULL AND solution != ''
      ORDER BY updated_at DESC
    `).all();

    return NextResponse.json({ solutions });
  } catch (err) {
    console.error('Fehler beim Abrufen der gespeicherten Lösungen:', err);
    return NextResponse.json({ error: 'Serverfehler beim Laden der Lösungen.' }, { status: 500 });
  }
}

/**
 * POST (Aktion 'forget'): Ermöglicht das "Vergessen" (Löschen der hinterlegten Lösung / Zurücksetzen auf neutralen Text).
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { ticketId, action } = await request.json();
    if (!ticketId || action !== 'forget') {
      return NextResponse.json({ error: 'Ungültige Parameter.' }, { status: 400 });
    }

    // Lösung vergessen: Spalte solution in Tabelle tickets leeren bzw. auf neutralen Text setzen
    db.prepare("UPDATE tickets SET solution = 'Ohne Lösung geschlossen' WHERE id = ?").run(ticketId);

    // Optional: Einen Systemkommentar im Verlauf des Tickets anlegen, damit es dokumentiert ist
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) 
      VALUES (?, 'system', 'system', 'Die hinterlegte Lösung dieses Tickets wurde von einem Administrator aus der Wissensbasis gelöscht (Vergessen-Funktion).')
    `).run(ticketId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Vergessen der Lösung:', err);
    return NextResponse.json({ error: 'Serverfehler beim Vergessen der Lösung.' }, { status: 500 });
  }
}

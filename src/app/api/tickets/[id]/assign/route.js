import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { sendAssignmentNotification } from '@/lib/mailer';

export async function POST(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user || !['agent', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { assigned_agent_id } = await request.json();
    if (!assigned_agent_id) {
      return NextResponse.json({ error: 'Agenten-ID fehlt.' }, { status: 400 });
    }

    // Agenten verifizieren
    const targetAgent = db.prepare('SELECT email, role FROM users WHERE id = ?').get(assigned_agent_id);
    if (!targetAgent || !['agent', 'admin'].includes(targetAgent.role)) {
      return NextResponse.json({ error: 'Ungültiger Agent.' }, { status: 400 });
    }

    // Ticket laden
    const ticket = db.prepare('SELECT title FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    // Zuweisung aktualisieren und Status auf 'assigned' setzen
    db.prepare('UPDATE tickets SET assigned_agent_id = ?, status = \'assigned\', updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(assigned_agent_id, id);

    // Systemkommentar einfügen
    db.prepare('INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) VALUES (?, \'system\', \'system\', ?)')
      .run(id, `Ticket wurde ${targetAgent.email} zugewiesen.`);

    // E-Mail an den zugewiesenen Agenten senden
    await sendAssignmentNotification(targetAgent.email, id, ticket.title);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler bei der Ticket-Zuweisung:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request) {
  try {
    const { messageId, reason } = await request.json();
    if (!messageId) {
      return NextResponse.json({ error: 'Nachrichten-ID fehlt.' }, { status: 400 });
    }

    // Nachricht aktualisieren
    const result = db.prepare(`
      UPDATE chat_messages 
      SET is_flagged = 1, flagged_at = CURRENT_TIMESTAMP, flagged_reason = ?
      WHERE id = ? AND sender = 'bot'
    `).run(reason || null, messageId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Nachricht nicht gefunden oder kein Bot-Sender.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Flaggen der Nachricht:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

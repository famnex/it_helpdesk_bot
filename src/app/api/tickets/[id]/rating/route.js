import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * POST: Speichert das Kundenzufriedenheits-Rating (1-5 Sterne) für ein Ticket
 */
export async function POST(request, context) {
  try {
    const { id } = await context.params;
    const { rating, feedback } = await request.json();

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Ungültige Bewertung. Erlaubt sind 1 bis 5 Sterne.' }, { status: 400 });
    }

    const ticket = db.prepare('SELECT id, status, creator_email FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    db.prepare(`
      UPDATE tickets 
      SET rating = ?, rating_feedback = ?, rated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(rating, feedback ? String(feedback).trim() : null, id);

    return NextResponse.json({
      success: true,
      rating,
      feedback,
      message: 'Vielen Dank für dein Feedback!'
    });
  } catch (err) {
    console.error('Fehler beim Speichern des Ratings:', err);
    return NextResponse.json({ error: 'Serverfehler beim Speichern der Bewertung.' }, { status: 500 });
  }
}

/**
 * GET: Gibt die bestehende Bewertung des Tickets zurück
 */
export async function GET(request, context) {
  try {
    const { id } = await context.params;
    const ticket = db.prepare('SELECT rating, rating_feedback as ratingFeedback, rated_at as ratedAt FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({
      rating: ticket.rating || null,
      ratingFeedback: ticket.ratingFeedback || null,
      ratedAt: ticket.ratedAt || null
    });
  } catch (err) {
    console.error('Fehler beim Abrufen des Ratings:', err);
    return NextResponse.json({ error: 'Serverfehler beim Laden der Bewertung.' }, { status: 500 });
  }
}

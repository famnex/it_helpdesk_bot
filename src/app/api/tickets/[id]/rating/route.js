import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyMagicLinkToken } from '@/lib/auth';
import { getBaseAppUrl } from '@/lib/mailer';

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
 * GET: Gibt die bestehende Bewertung des Tickets zurück ODER führt 1-Klick-Rating aus E-Mail aus
 */
export async function GET(request, context) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const scoreParam = searchParams.get('score');
    const tokenParam = searchParams.get('token');

    // 1-Klick-Rating direkt aus E-Mail
    if (scoreParam) {
      const score = parseInt(scoreParam, 10);
      if (score >= 1 && score <= 5) {
        const ticket = db.prepare('SELECT id, creator_email FROM tickets WHERE id = ?').get(id);
        if (ticket) {
          let isValid = true;
          if (tokenParam) {
            const tokenEmail = verifyMagicLinkToken(tokenParam);
            if (!tokenEmail || (ticket.creator_email && tokenEmail.toLowerCase() !== ticket.creator_email.toLowerCase())) {
              isValid = false;
            }
          }

          if (isValid) {
            db.prepare(`
              UPDATE tickets 
              SET rating = ?, rated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `).run(score, id);

            const baseUrl = getBaseAppUrl();
            if (tokenParam) {
              return NextResponse.redirect(`${baseUrl}/api/auth/magic?token=${tokenParam}&redirect=/tickets/${id}?rated=true%26score=${score}`);
            }
            return NextResponse.redirect(`${baseUrl}/tickets/${id}?rated=true&score=${score}`);
          }
        }
      }
    }

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
    console.error('Fehler beim Abrufen/Speichern des Ratings:', err);
    return NextResponse.json({ error: 'Serverfehler beim Laden der Bewertung.' }, { status: 500 });
  }
}

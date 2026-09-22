import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { canAccessTicket } from '@/lib/access';
import { getBaseAppUrl } from '@/lib/appUrl';
export async function POST(request, context) {
  const { id } = await context.params;
  const user = await getSessionUser();
  if (!await canAccessTicket(id,user)) return NextResponse.json({error:'Kein Zugriff.'},{status:403});
  const { rating, feedback } = await request.json();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({error:'Bitte 1 bis 5 Sterne auswählen.'},{status:400});
  db.prepare('UPDATE tickets SET rating=?, rating_feedback=?, rated_at=CURRENT_TIMESTAMP WHERE id=?').run(rating,typeof feedback === 'string' ? feedback.trim().slice(0,10000) : null,id);
  return NextResponse.json({success:true,rating});
}
export async function GET(request, context) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  // Links only open the rating form. Mail scanners must not submit ratings.
  if (query.has('score')) {
    const redirect = `/tickets/${encodeURIComponent(id)}?score=${Number(query.get('score')) || 0}`;
    const target = query.get('token') ? `/api/auth/magic?token=${encodeURIComponent(query.get('token'))}&redirect=${encodeURIComponent(redirect)}` : redirect;
    return NextResponse.redirect(getBaseAppUrl()+target);
  }
  if (!await canAccessTicket(id,await getSessionUser())) return NextResponse.json({error:'Kein Zugriff.'},{status:403});
  return NextResponse.json(db.prepare('SELECT rating,rating_feedback as ratingFeedback,rated_at as ratedAt FROM tickets WHERE id=?').get(id));
}

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ user: null });
  }

  try {
    const user = db.prepare('SELECT id, email, role, name, avatar_url as avatarUrl FROM users WHERE id = ?').get(sessionUser.id);
    return NextResponse.json({ user });
  } catch (err) {
    console.error('Fehler bei /api/auth/me:', err);
    return NextResponse.json({ user: sessionUser });
  }
}

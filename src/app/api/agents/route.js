import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user || !['agent', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const agents = db.prepare("SELECT id, email, name, role FROM users WHERE role IN ('agent', 'admin') ORDER BY name ASC, email ASC").all();
    return NextResponse.json({ agents });
  } catch (err) {
    console.error('Fehler beim Abrufen der Agenten:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET: Profil des angemeldeten Benutzers laden
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  try {
    const profile = db.prepare('SELECT id, email, role, name, avatar_url as avatarUrl FROM users WHERE id = ?').get(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Profil nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ profile });
  } catch (err) {
    console.error('Fehler beim Laden des Profils:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * PUT: Anzeigename aktualisieren
 */
export async function PUT(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  try {
    const { name } = await request.json();
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Ein Name ist erforderlich.' }, { status: 400 });
    }

    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Aktualisieren des Profilnamens:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

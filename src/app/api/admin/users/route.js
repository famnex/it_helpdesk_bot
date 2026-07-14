import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET: Alle registrierten Benutzer auflisten
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const users = db.prepare(`
      SELECT id, email, role, name, responsibilities, avatar_url as avatarUrl, created_at as createdAt 
      FROM users 
      ORDER BY role ASC, email ASC
    `).all();
    
    const usersWithAvatars = users.map(u => {
      if (u.avatarUrl && !u.avatarUrl.startsWith('/helpdesk')) {
        u.avatarUrl = `/helpdesk${u.avatarUrl}`;
      }
      return u;
    });
    
    return NextResponse.json({ users: usersWithAvatars });
  } catch (err) {
    console.error('Fehler beim Abrufen der Benutzerliste:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * PUT: Rolle eines Benutzers aktualisieren
 */
export async function PUT(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { userId, role, responsibilities } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'Benutzer-ID ist erforderlich.' }, { status: 400 });
    }

    if (role) {
      if (!['customer', 'agent', 'admin'].includes(role)) {
        return NextResponse.json({ error: 'Ungültige Rolle.' }, { status: 400 });
      }

      // Selbst-Herabstufung verhindern
      if (user.id === userId) {
        return NextResponse.json({ error: 'Sie können Ihre eigene Rolle nicht ändern.' }, { status: 400 });
      }

      const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
      if (result.changes === 0) {
        return NextResponse.json({ error: 'Benutzer nicht gefunden.' }, { status: 404 });
      }
    }

    if (responsibilities !== undefined) {
      db.prepare('UPDATE users SET responsibilities = ? WHERE id = ?').run(responsibilities || null, userId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Aktualisieren der Rolle:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * DELETE: Einen Benutzer löschen
 */
export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Benutzer-ID fehlt.' }, { status: 400 });
    }

    // Selbst-Löschung verhindern
    if (user.id === userId) {
      return NextResponse.json({ error: 'Sie können Ihr eigenes Konto nicht löschen.' }, { status: 400 });
    }

    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Benutzer nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Löschen des Benutzers:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

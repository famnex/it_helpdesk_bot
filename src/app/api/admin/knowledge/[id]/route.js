import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * PUT: Wissenseintrag bearbeiten
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { title, description, fact, category, isPrivate } = await request.json();
    const desc = (description || fact || '').trim();
    if (!title || !desc) {
      return NextResponse.json({ error: 'Titel und Beschreibung sind erforderlich.' }, { status: 400 });
    }

    const cat = category || 'Sonstiges';
    const priv = isPrivate ? 1 : 0;

    const result = db.prepare('UPDATE knowledge SET title = ?, fact = ?, description = ?, category = ?, is_private = ? WHERE id = ?').run(title, desc, desc, cat, priv, id);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Eintrag nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Aktualisieren des Wissens:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * DELETE: Wissenseintrag löschen
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const result = db.prepare('DELETE FROM knowledge WHERE id = ?').run(id);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Eintrag nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Löschen des Wissens:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

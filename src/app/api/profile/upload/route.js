import { randomUUID } from 'crypto';
import { saveAttachment, uploadRoot } from '@/lib/uploads';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });
    }

    // Dateityp prüfen
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Ungültiges Dateiformat. Erlaubt sind JPG, PNG, GIF und WEBP.' }, { status: 400 });
    }

    // Dateigröße validieren (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Die Datei ist zu groß (maximal 10 MB).' }, { status: 400 });
    }

    const saved = await saveAttachment(file,{user});
    const stored = saved.split('/').pop();
    const uploadsDir = path.join(uploadRoot(),'avatars');
    fs.mkdirSync(uploadsDir,{recursive:true});
    const filename = `${randomUUID()}${path.extname(stored)}`;
    fs.renameSync(path.join(uploadRoot(),'private',stored),path.join(uploadsDir,filename));
    db.prepare('DELETE FROM private_uploads WHERE id=?').run(stored);

    // avatar_url in Datenbank speichern
    const relativeUrl = `/uploads/avatars/${filename}?t=${Date.now()}`; // Timestamp verhindert Browser-Caching
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(relativeUrl, user.id);

    return NextResponse.json({ success: true, avatarUrl: relativeUrl });

  } catch (err) {
    console.error('Fehler beim Upload des Profilbilds:', err);
    return NextResponse.json({ error: 'Interner Serverfehler beim Datei-Upload.' }, { status: 500 });
  }
}

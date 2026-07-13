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

    // Dateigröße validieren (max 2 MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Die Datei ist zu groß (maximal 2 MB).' }, { status: 400 });
    }

    // Datei einlesen
    const buffer = Buffer.from(await file.arrayBuffer());

    // Pfad für Upload-Ordner sicherstellen
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Dateiname erzeugen (avatar-[user-id].[ext])
    const fileExtension = file.name.split('.').pop() || 'png';
    const filename = `avatar-${user.id}.${fileExtension}`;
    const filePath = path.join(uploadsDir, filename);

    // Datei auf Server schreiben
    fs.writeFileSync(filePath, buffer);

    // avatar_url in Datenbank speichern
    const relativeUrl = `/uploads/avatars/${filename}?t=${Date.now()}`; // Timestamp verhindert Browser-Caching
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(relativeUrl, user.id);

    return NextResponse.json({ success: true, avatarUrl: relativeUrl });

  } catch (err) {
    console.error('Fehler beim Upload des Profilbilds:', err);
    return NextResponse.json({ error: 'Interner Serverfehler beim Datei-Upload.' }, { status: 500 });
  }
}

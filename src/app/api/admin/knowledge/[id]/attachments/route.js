import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';

/**
 * GET: Alle Anhänge für einen Wissenschunk auflisten
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const attachments = db.prepare(`
      SELECT id, filename, file_path as filePath, file_size as fileSize 
      FROM knowledge_attachments 
      WHERE knowledge_id = ?
      ORDER BY created_at ASC
    `).all(id);

    return NextResponse.json({ attachments });
  } catch (err) {
    console.error('Fehler beim Laden der Anhänge:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * POST: Datei als Anhang für einen Wissenschunk hochladen
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });
    }

    // Dateigröße validieren (max. 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Die Datei ist zu groß (maximal 5 MB).' }, { status: 400 });
    }

    // Datei einlesen
    const buffer = Buffer.from(await file.arrayBuffer());

    // Pfad für Upload-Ordner sicherstellen
    const attachmentsDir = path.join(process.cwd(), 'public', 'uploads', 'attachments');
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }

    // Eindeutigen Dateinamen erzeugen, um Überschreiben zu verhindern
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${id}-${timestamp}-${sanitizedFilename}`;
    const filePath = path.join(attachmentsDir, filename);

    // Datei auf Server schreiben
    fs.writeFileSync(filePath, buffer);

    // Relativen Pfad für die Auslieferung über Next.js /public generieren
    const relativeUrl = `/uploads/attachments/${filename}`;

    // In der Datenbank speichern
    const info = db.prepare(`
      INSERT INTO knowledge_attachments (knowledge_id, filename, file_path, file_size)
      VALUES (?, ?, ?, ?)
    `).run(id, file.name, relativeUrl, file.size);

    return NextResponse.json({
      success: true,
      attachment: {
        id: info.lastInsertRowid,
        filename: file.name,
        filePath: relativeUrl,
        fileSize: file.size
      }
    });

  } catch (err) {
    console.error('Fehler beim Upload des Anhangs:', err);
    return NextResponse.json({ error: 'Interner Serverfehler beim Datei-Upload.' }, { status: 500 });
  }
}

/**
 * DELETE: Einen bestimmten Anhang löschen
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get('attachmentId');
  
  const user = await getSessionUser();

  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  if (!attachmentId) {
    return NextResponse.json({ error: 'Keine Anhangs-ID übergeben.' }, { status: 400 });
  }

  try {
    // Anhang in der DB suchen
    const attachment = db.prepare(`
      SELECT file_path 
      FROM knowledge_attachments 
      WHERE id = ? AND knowledge_id = ?
    `).get(attachmentId, id);

    if (!attachment) {
      return NextResponse.json({ error: 'Anhang nicht gefunden.' }, { status: 404 });
    }

    // Datei von der Festplatte löschen
    const absolutePath = path.join(process.cwd(), 'public', attachment.file_path);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }

    // Eintrag in Datenbank löschen
    db.prepare('DELETE FROM knowledge_attachments WHERE id = ?').run(attachmentId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Löschen des Anhangs:', err);
    return NextResponse.json({ error: 'Interner Serverfehler beim Löschen.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import path from 'path';
import fs from 'fs';

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

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Zielverzeichnis
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'tickets');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Sicherer Dateiname
    const fileExt = path.extname(file.name) || '.bin';
    const cleanBase = path.basename(file.name, fileExt).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${Date.now()}_${cleanBase}${fileExt}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/tickets/${filename}`;

    return NextResponse.json({
      success: true,
      url: relativeUrl,
      filename: file.name
    });
  } catch (err) {
    console.error('Fehler beim Hochladen der Datei für Ticket:', err);
    return NextResponse.json({ error: 'Serverfehler beim Dateiupload.' }, { status: 500 });
  }
}

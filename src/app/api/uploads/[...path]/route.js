import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Dynamischer File-Server API Route
 * Ersetzt das statische Next.js Public-Serving für zur Laufzeit hochgeladene Dateien.
 * Garantiert 100% Zuverlässigkeit ohne 404-Fehler in Production Mode (next start).
 */
export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path || [];
    const relativePath = pathSegments.join('/');

    // Schutz vor Pfad-Traversal (Security Check)
    if (relativePath.includes('..')) {
      return new NextResponse('Verboten', { status: 403 });
    }

    // Pfade auf dem Server prüfen (public/uploads/ vs uploads/)
    let filePath = path.join(process.cwd(), 'public', 'uploads', relativePath);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), 'uploads', relativePath);
    }

    if (!fs.existsSync(filePath)) {
      return new NextResponse('Datei nicht gefunden', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const contentTypeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.cer': 'application/x-x509-ca-cert',
      '.txt': 'text/plain'
    };

    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (err) {
    console.error('Fehler beim dynamischen Ausliefern der Upload-Datei:', err);
    return new NextResponse('Server-Fehler', { status: 500 });
  }
}

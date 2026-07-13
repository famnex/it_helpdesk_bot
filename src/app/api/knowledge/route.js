import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * GET: Gibt die gesamte Wissensdatenbank öffentlich für Kunden frei.
 * Unterstützt auch optionale Suchanfragen (?q=...)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  try {
    let chunks;
    if (query && query.trim().length > 0) {
      const sqlPattern = `%${query.trim()}%`;
      chunks = db.prepare(`
        SELECT id, title, fact, description, category 
        FROM knowledge 
        WHERE title LIKE ? OR fact LIKE ? OR description LIKE ? OR category LIKE ?
        ORDER BY title ASC
      `).all(sqlPattern, sqlPattern, sqlPattern, sqlPattern);
    } else {
      chunks = db.prepare('SELECT id, title, fact, description, category FROM knowledge ORDER BY title ASC').all();
    }

    // Für jeden Wissenschunk die verknüpften Anhänge laden
    const chunksWithAttachments = chunks.map(c => {
      const attachments = db.prepare(`
        SELECT id, filename, file_path as filePath, file_size as fileSize 
        FROM knowledge_attachments 
        WHERE knowledge_id = ?
        ORDER BY created_at ASC
      `).all(c.id);
      return { ...c, attachments };
    });
    
    return NextResponse.json({ chunks: chunksWithAttachments });
  } catch (err) {
    console.error('Fehler beim Abrufen der öffentlichen Wissensdatenbank:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

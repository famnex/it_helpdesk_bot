import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { checkDuplicate } from '@/lib/gemini';

/**
 * GET: Alle Wissenseinträge für Admins auflisten
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const knowledge = db.prepare('SELECT id, title, fact, description, category, source, created_at as createdAt FROM knowledge ORDER BY title ASC').all();
    
    // Für jeden Wissenschunk die verknüpften Anhänge laden
    const knowledgeWithAttachments = knowledge.map(k => {
      const attachments = db.prepare(`
        SELECT id, filename, file_path as filePath, file_size as fileSize 
        FROM knowledge_attachments 
        WHERE knowledge_id = ?
        ORDER BY created_at ASC
      `).all(k.id);
      return { ...k, attachments };
    });

    return NextResponse.json({ knowledge: knowledgeWithAttachments });
  } catch (err) {
    console.error('Fehler beim Abrufen der Wissensdatenbank:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * POST: Einen einzelnen Wissenschunk manuell anlegen (mit Duplikatsprüfung)
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { title, fact, description, category } = await request.json();
    if (!title || !fact) {
      return NextResponse.json({ error: 'Titel und Fakt sind erforderlich.' }, { status: 400 });
    }

    const desc = description || fact;
    const cat = category || 'Sonstiges';

    const existingChunks = db.prepare('SELECT id, title, fact FROM knowledge').all();
    
    // Duplikatsprüfung via Gemini
    const duplicateResult = await checkDuplicate({ title, fact }, existingChunks);
    
    if (duplicateResult !== 'NEIN') {
      return NextResponse.json({ 
        success: false, 
        duplicate: true, 
        duplicateId: duplicateResult,
        message: 'Dieser Wissenseintrag existiert inhaltlich bereits.' 
      }, { status: 409 });
    }

    const chunkId = `chunk-${Math.floor(100000 + Math.random() * 900000)}`;
    db.prepare('INSERT INTO knowledge (id, title, fact, description, category, source) VALUES (?, ?, ?, ?, ?, \'manual\')')
      .run(chunkId, title, fact, desc, cat);

    return NextResponse.json({ 
      success: true, 
      chunk: { id: chunkId, title, fact, description: desc, category: cat, source: 'manual' } 
    });

  } catch (err) {
    console.error('Fehler beim Erstellen des Wissens:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

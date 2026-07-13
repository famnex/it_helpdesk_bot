import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { extractKnowledgeChunks, processAndSaveChunks } from '@/lib/gemini';

function cleanHtml(html) {
  // Script- und Style-Tags inklusive Inhalt entfernen
  let text = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
  text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
  // Alle restlichen HTML-Tags entfernen
  text = text.replace(/<[^>]+>/g, ' ');
  // Mehrfach-Leerzeichen und Zeilenumbrüche reduzieren
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    let textToAnalyze = '';
    let source = 'file';

    if (contentType.includes('application/json')) {
      // Import per URL
      const { url } = await request.json();
      if (!url) {
        return NextResponse.json({ error: 'URL ist erforderlich.' }, { status: 400 });
      }

      source = 'url';
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IT-Helpdesk-Bot'
          }
        });

        if (!response.ok) {
          return NextResponse.json({ error: `Webseite konnte nicht geladen werden (${response.status})` }, { status: 400 });
        }

        const html = await response.text();
        textToAnalyze = cleanHtml(html);
        
        if (textToAnalyze.length < 50) {
          return NextResponse.json({ error: 'Die geladene Webseite enthält zu wenig Textinhalt.' }, { status: 400 });
        }
      } catch (fetchErr) {
        console.error('Fehler beim Laden der URL:', fetchErr);
        return NextResponse.json({ error: 'Verbindungsfehler beim Laden der URL.' }, { status: 400 });
      }

    } else if (contentType.includes('multipart/form-data')) {
      // Import per Datei-Upload
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return NextResponse.json({ error: 'Datei fehlt.' }, { status: 400 });
      }

      textToAnalyze = await file.text();
      source = 'file';

      if (textToAnalyze.trim().length < 10) {
        return NextResponse.json({ error: 'Die hochgeladene Datei ist leer oder ungültig.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Ungültiger Content-Type.' }, { status: 400 });
    }

    // --- KI Wissensextraktion & Deduplizierung ---
    // 1. Chunks extrahieren
    const extractedChunks = await extractKnowledgeChunks(textToAnalyze);
    
    if (extractedChunks.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'Es konnten keine IT-relevanten Informationen extrahiert werden.', 
        chunks: [] 
      });
    }

    // 2. Deduplizieren und Speichern
    const processedChunks = await processAndSaveChunks(extractedChunks, source);

    return NextResponse.json({
      success: true,
      message: `${processedChunks.filter(c => c.isNew).length} neue Wissenseinträge importiert. (${processedChunks.filter(c => !c.isNew).length} Duplikate ignoriert)`,
      chunks: processedChunks
    });

  } catch (err) {
    console.error('Fehler beim Importieren von Wissen:', err);
    return NextResponse.json({ error: 'Interner Serverfehler beim Import.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateChatResponse, generateTicketTitle, extractAgentBehalfDetails } from '@/lib/gemini';
import fs from 'fs';
import path from 'path';

/**
 * GET: Holt den Verlauf eines bestimmten Chats oder alle alten Chats eines angemeldeten Benutzers.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  const user = await getSessionUser();

  try {
    if (chatId) {
      // Verlauf eines bestimmten Chats laden
      const messages = db.prepare(`
        SELECT id, sender, text, image_url as imageUrl, is_flagged as isFlagged, created_at as createdAt 
        FROM chat_messages 
        WHERE chat_id = ? 
        ORDER BY created_at ASC
      `).all(chatId);
      
      const messagesWithPrefix = messages.map(m => {
        if (m.imageUrl && !m.imageUrl.startsWith('/helpdesk')) {
          m.imageUrl = `/helpdesk${m.imageUrl}`;
        }
        return m;
      });
      
      return NextResponse.json({ messages: messagesWithPrefix });
    }

    if (user && user.email) {
      // Alle Chats eines angemeldeten Benutzers auflisten
      const userChats = db.prepare(`
        SELECT id, created_at as createdAt 
        FROM chats 
        WHERE user_email = ? 
        ORDER BY created_at DESC
      `).all(user.email);
      
      return NextResponse.json({ chats: userChats });
    }

    return NextResponse.json({ messages: [] });
  } catch (err) {
    console.error('Fehler beim Laden des Chats:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * POST: Nimmt eine neue Nachricht entgegen, ruft Gemini auf und speichert die Antwort.
 */
export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let chatId = '';
    let text = '';
    let relativePath = null;

    let isAgentOnBehalf = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      chatId = formData.get('chatId');
      text = formData.get('text') || '';
      isAgentOnBehalf = formData.get('isAgentOnBehalf') === 'true';
      
      const photoFile = formData.get('photo'); // File-Objekt
      
      if (photoFile && photoFile.size > 0) {
        // Validierung der Dateigröße (max. 4 MB) und des Dateityps
        if (photoFile.size > 4 * 1024 * 1024) {
          return NextResponse.json({ error: 'Das Bild darf maximal 4 MB groß sein.' }, { status: 400 });
        }
        
        if (!photoFile.type.startsWith('image/')) {
          return NextResponse.json({ error: 'Es sind nur Bilder erlaubt.' }, { status: 400 });
        }

        // Zielverzeichnis erstellen falls nicht vorhanden
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'chat');
        fs.mkdirSync(uploadDir, { recursive: true });

        // Eindeutigen Dateinamen generieren
        const origExt = path.extname(photoFile.name) || '.jpg';
        const fileName = `chat-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}${origExt.toLowerCase()}`;
        
        relativePath = `/uploads/chat/${fileName}`;
        const absolutePath = path.join(uploadDir, fileName);

        // Datei schreiben
        const buffer = Buffer.from(await photoFile.arrayBuffer());
        fs.writeFileSync(absolutePath, buffer);
      }
    } else {
      const body = await request.json();
      chatId = body.chatId;
      text = body.text;
      isAgentOnBehalf = !!body.isAgentOnBehalf;
    }

    if (!text && !relativePath) {
      return NextResponse.json({ error: 'Nachrichtentext oder Foto fehlt.' }, { status: 400 });
    }

    const user = await getSessionUser();
    const email = user ? user.email : null;

    // 1. Sicherstellen, dass der Chat existiert
    let chat = db.prepare('SELECT id, ticket_created as ticketCreated, user_email as userEmail, user_name as userName, is_agent_on_behalf as isAgentOnBehalf FROM chats WHERE id = ?').get(chatId);
    if (!chat) {
      db.prepare('INSERT INTO chats (id, user_email, user_name, is_agent_on_behalf) VALUES (?, ?, ?, ?)').run(chatId, email, user ? user.name : null, isAgentOnBehalf ? 1 : 0);
      chat = { id: chatId, ticketCreated: 0, isAgentOnBehalf: isAgentOnBehalf ? 1 : 0 };
    } else {
      // Immer versuchen, E-Mail und Name des angemeldeten Benutzers zu aktualisieren/ergänzen (außer bei On-Behalf-Chats)
      if (chat.isAgentOnBehalf !== 1) {
        db.prepare('UPDATE chats SET user_email = ?, user_name = ? WHERE id = ?')
          .run(email || chat.userEmail || null, (user ? user.name : null) || chat.userName || null, chatId);
      }
    }

    // 2. Benutzernachricht speichern (mit eventuellem Foto)
    const isSystemEvent = text && text.startsWith('[SYSTEM_EVENT:');
    let shouldInsert = true;
    if (isSystemEvent) {
      // Wenn das System-Event bereits existiert, nicht doppelt speichern
      const exists = db.prepare('SELECT id FROM chat_messages WHERE chat_id = ? AND text = ?').get(chatId, text);
      if (exists) {
        shouldInsert = false;
      }
    }

    if (shouldInsert) {
      db.prepare('INSERT INTO chat_messages (chat_id, sender, text, image_url) VALUES (?, ?, ?, ?)')
        .run(chatId, 'user', text, relativePath);
    }

    // Falls ein Ticket mit dieser chatId verknüpft ist, Nachricht dort spiegeln (System-Events ausgenommen)
    if (!isSystemEvent) {
      try {
        const ticket = db.prepare('SELECT id, creator_email FROM tickets WHERE chat_id = ?').get(chatId);
        if (ticket) {
          db.prepare(`
            INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
            VALUES (?, ?, 'customer', ?)
          `).run(ticket.id, ticket.creator_email || 'Kunde', text || '(Foto hochgeladen)');
        }
      } catch (e) {
        console.error('Fehler beim Spiegeln der Benutzernachricht im Ticket:', e);
      }
    }

    // 3. Letzten Verlauf laden (inklusive image_url)
    const chatHistory = db.prepare(`
      SELECT sender, text, image_url as imageUrl 
      FROM chat_messages 
      WHERE chat_id = ? 
      ORDER BY created_at ASC
    `).all(chatId);

    // 4. Gemini aufrufen
    const isAgentOnBehalfMode = chat ? chat.isAgentOnBehalf === 1 : false;
    let aiResponse = await generateChatResponse(chatHistory, chat ? chat.ticketCreated : 0, isAgentOnBehalfMode);
 
    // 5. Auf Ticket-Erstellung prüfen
    let ticketCreated = false;
    let proposedTitle = null;
    let extractedData = null;
    if (aiResponse.includes('[TICKET_CREATED]')) {
      ticketCreated = true;
      aiResponse = aiResponse.replace('[TICKET_CREATED]', '').trim();
      
      if (isAgentOnBehalfMode) {
        try {
          extractedData = await extractAgentBehalfDetails(chatHistory);
        } catch (err) {
          console.error('Fehler bei extractAgentBehalfDetails:', err);
        }
      } else {
        try {
          proposedTitle = await generateTicketTitle(chatHistory);
        } catch (err) {
          console.error('Fehler bei der proposedTitle-Generierung:', err);
        }
      }
    }

    // Auf Missbrauch (Beleidigung) prüfen
    let isAbusive = false;
    if (aiResponse.includes('[CHAT_ABUSE_DETECTED]')) {
      isAbusive = true;
      aiResponse = aiResponse.replace('[CHAT_ABUSE_DETECTED]', '').trim();
      try {
        db.prepare(`
          UPDATE chats 
          SET is_abusive = 1, abusive_flagged_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(chatId);
        console.log(`Chat ${chatId} wurde als missbräuchlich markiert.`);
      } catch (err) {
        console.error('Fehler beim Markieren von Missbrauch:', err);
      }
    }

    // 6. Botnachricht speichern
    const insertResult = db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, ?, ?)')
      .run(chatId, 'bot', aiResponse);
    const botMessageId = insertResult.lastInsertRowid;

    // Falls ein Ticket mit dieser chatId verknüpft ist, Botnachricht dort spiegeln
    try {
      const ticket = db.prepare('SELECT id, creator_email FROM tickets WHERE chat_id = ?').get(chatId);
      if (ticket) {
        db.prepare(`
          INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
          VALUES (?, ?, 'bot', ?)
        `).run(ticket.id, 'KI-Bot (Chat)', aiResponse);
      }
    } catch (e) {
      console.error('Fehler beim Spiegeln der Botnachricht im Ticket:', e);
    }

    return NextResponse.json({
      text: aiResponse,
      ticketCreated,
      proposedTitle,
      extractedData,
      isAgentOnBehalf: isAgentOnBehalfMode,
      botMessageId,
      isAbusive
    });

  } catch (err) {
    console.error('Fehler bei der Chat-Verarbeitung:', err);
    return NextResponse.json({ error: 'Fehler bei der Antwortgenerierung.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { 
  generateChatResponse, 
  generateTicketTitle, 
  extractAgentBehalfDetails,
  detectDuplicateTopic,
  checkSelfResolutionIntent
} from '@/lib/gemini';
import { queueTicketNotification } from '@/lib/notifications';
import { reconstructIdentityTrace } from '@/lib/identityTrace';
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
        if (m.imageUrl) {
          let clean = m.imageUrl.replace(/^\/helpdesk/, '');
          if (!clean.startsWith('/')) clean = '/' + clean;
          m.imageUrl = `/helpdesk${clean}`;
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
      
      let skipBotVal = formData.get('skipBot');
      if (skipBotVal === null) {
        // support both skip_bot and skipBot
        skipBotVal = formData.get('skip_bot');
      }
      var skipBot = skipBotVal === 'true';
      
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
      var skipBot = !!body.skipBot || !!body.skip_bot;
    }

    if (!text && !relativePath) {
      return NextResponse.json({ error: 'Nachrichtentext oder Foto fehlt.' }, { status: 400 });
    }

    const user = await getSessionUser();
    const email = user ? user.email : null;

    // IP-Adresse extrahieren
    const xForwardedFor = request.headers.get('x-forwarded-for');
    let userIp = '';
    if (xForwardedFor) {
      userIp = xForwardedFor.split(',')[0].trim();
    } else {
      userIp = request.headers.get('x-real-ip') || '';
    }

    // Persistente Session ID aus Header extrahieren
    const userSessionId = request.headers.get('x-user-session-id') || '';

    // 1. Sicherstellen, dass der Chat existiert
    let chat = db.prepare('SELECT id, ticket_created as ticketCreated, user_email as userEmail, user_name as userName, is_agent_on_behalf as isAgentOnBehalf FROM chats WHERE id = ?').get(chatId);
    if (!chat) {
      db.prepare('INSERT INTO chats (id, user_email, user_name, is_agent_on_behalf, user_ip, user_session_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(chatId, email, user ? user.name : null, isAgentOnBehalf ? 1 : 0, userIp, userSessionId);
      chat = { id: chatId, ticketCreated: 0, isAgentOnBehalf: isAgentOnBehalf ? 1 : 0 };
    } else {
      // Immer versuchen, E-Mail, Name, IP und Session-ID des angemeldeten Benutzers zu aktualisieren/ergänzen (außer bei On-Behalf-Chats)
      if (chat.isAgentOnBehalf !== 1) {
        db.prepare('UPDATE chats SET user_email = ?, user_name = ?, user_ip = ?, user_session_id = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(email || chat.userEmail || null, (user ? user.name : null) || chat.userName || null, userIp || null, userSessionId || null, chatId);
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

    let cleanRelativePath = null;
    if (relativePath) {
      let clean = relativePath.replace(/^\/helpdesk/, '');
      if (!clean.startsWith('/')) clean = '/' + clean;
      cleanRelativePath = `/helpdesk${clean}`;
    }

    if (shouldInsert) {
      db.prepare('INSERT INTO chat_messages (chat_id, sender, text, image_url) VALUES (?, ?, ?, ?)')
        .run(chatId, 'user', text, relativePath);
    }

    // Falls skipBot wahr ist, an dieser Stelle direkt Erfolg zurückmelden (keine KI-Generierung!)
    if (skipBot) {
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
      return NextResponse.json({ success: true, imageUrl: cleanRelativePath });
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

    // -----------------------------------------------------------------------------
    // PRÜFUNG 1: Handover an IT-Abteilung (Bot-Stummschaltung & KI-Mitlesen auf Selbst-Erledigung)
    // -----------------------------------------------------------------------------
    const isTicketHandedOver = chat && chat.ticketCreated === 1;
    if (isTicketHandedOver && !isSystemEvent) {
      const ticket = db.prepare('SELECT id, title, creator_email, assigned_agent_id FROM tickets WHERE chat_id = ?').get(chatId);

      // KI liest mit: Prüfen, ob der Nutzer sagt, dass sich das Problem erledigt hat
      const resolutionCheck = await checkSelfResolutionIntent(text);

      if (resolutionCheck.isResolved && ticket) {
        const botReply = "Super, freut mich, dass sich dein Anliegen erledigt hat! Ich habe das Support-Ticket für dich geschlossen. Falls du wieder Unterstützung benötigst, bin ich jederzeit für dich da.";

        db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'bot\', ?)').run(chatId, botReply);
        db.prepare(`
          INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
          VALUES (?, 'IT-Support-Bot', 'bot', ?)
        `).run(ticket.id, botReply);

        db.prepare(`
          UPDATE tickets 
          SET status = 'closed', 
              closed_at = CURRENT_TIMESTAMP, 
              closed_by_name = 'Bot', 
              closed_by_email = 'bot@system', 
              closed_by_user_id = 'bot' 
          WHERE id = ?
        `).run(ticket.id);

        db.prepare(`
          INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
          VALUES (?, 'system', 'system', '[SYSTEM_EVENT: TICKET_CLOSED_BY_BOT] Ticket wurde durch Benutzerbestätigung vom Bot geschlossen.')
        `).run(ticket.id);

        return NextResponse.json({
          text: botReply,
          isHandedOver: true,
          isClosedByBot: true,
          imageUrl: cleanRelativePath
        });
      } else {
        // Bot bleibt stumm bezüglich Fachfragen, gibt aber eine kurze Bestätigung zum Anhängen ans Ticket aus
        const botAck = "Danke! Ich habe deine Information direkt an das Ticket der IT-Abteilung weitergeleitet.";
        db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'bot\', ?)').run(chatId, botAck);

        if (ticket && ticket.assigned_agent_id) {
          const agent = db.prepare('SELECT email, name FROM users WHERE id = ?').get(ticket.assigned_agent_id);
          if (agent) {
            await queueTicketNotification({
              ticketId: ticket.id,
              recipientEmail: agent.email,
              recipientRole: 'agent',
              senderName: user ? user.name : 'Benutzer',
              messageText: text || '(Anhang gesendet)'
            });
          }
        }

        return NextResponse.json({
          text: botAck,
          isHandedOver: true,
          imageUrl: cleanRelativePath
        });
      }
    }

    // -----------------------------------------------------------------------------
    // PRÜFUNG 2: Wiederholungsanfragen (Themen-Übereinstimmung mit früheren Chats/Tickets)
    // -----------------------------------------------------------------------------
    const textLower = (text || '').trim().toLowerCase();
    const pendingTargetId = chat ? chat.pending_merge_target_id : null;

    if (pendingTargetId && (textLower.startsWith('ja') || textLower.includes('ja_zum_chat'))) {
      const targetTicket = db.prepare('SELECT id FROM tickets WHERE chat_id = ?').get(pendingTargetId);
      const mergeText = chat.pending_merge_info || text;

      db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'user\', ?)').run(pendingTargetId, `[Ergänzung aus neuem Chat]: ${mergeText}`);
      if (targetTicket) {
        db.prepare('INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) VALUES (?, ?, \'customer\', ?)')
          .run(targetTicket.id, email || 'Kunde', `[Zusatzinformation]: ${mergeText}`);
      }

      const ackBot = "Danke! Ich habe deine Informationen zu deiner bestehenden Konversation hinzugefügt und das Gespräch fortgeführt.";
      db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'bot\', ?)').run(pendingTargetId, ackBot);

      db.prepare('UPDATE chats SET is_merged = 1, pending_merge_target_id = NULL WHERE id = ?').run(chatId);

      return NextResponse.json({
        text: ackBot,
        isMerged: true,
        targetChatId: pendingTargetId,
        imageUrl: cleanRelativePath
      });
    } else if (pendingTargetId && (textLower.startsWith('nein') || textLower.includes('nein_neues_thema'))) {
      db.prepare('UPDATE chats SET pending_merge_target_id = NULL, pending_merge_info = NULL WHERE id = ?').run(chatId);
    } else if (!isSystemEvent && !pendingTargetId) {
      const msgCountRes = db.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE chat_id = ?').get(chatId);
      const currentMsgCount = msgCountRes ? msgCountRes.count : 0;

      if (currentMsgCount <= 2) {
        // 1. Identitäts-Spur nutzen, um alle verknüpften E-Mails, Session-IDs und IPs abzufragen
        const trace = reconstructIdentityTrace(chatId);
        const userEmails = new Set();
        const userSessions = new Set();
        const userIps = new Set();

        if (email) userEmails.add(email.toLowerCase());
        if (userSessionId) userSessions.add(userSessionId);
        if (userIp) userIps.add(userIp);

        if (trace && trace.identityTrail) {
          trace.identityTrail.forEach(ident => {
            if (ident.email) userEmails.add(ident.email.toLowerCase());
          });
        }

        const emailList = Array.from(userEmails);
        const sessionList = Array.from(userSessions);
        const ipList = Array.from(userIps);

        let candidateChats = db.prepare(`
          SELECT c.id, c.category, c.created_at as createdAt, t.id as ticketId, t.title as ticketTitle,
                 (SELECT text FROM chat_messages WHERE chat_id = c.id AND sender = 'user' ORDER BY created_at ASC LIMIT 1) as snippet
          FROM chats c
          LEFT JOIN tickets t ON t.chat_id = c.id
          WHERE c.id != ? AND c.is_merged = 0 AND (
            LOWER(c.user_email) IN (${emailList.length > 0 ? emailList.map(() => '?').join(',') : "''"})
            OR c.user_session_id IN (${sessionList.length > 0 ? sessionList.map(() => '?').join(',') : "''"})
            OR c.user_ip IN (${ipList.length > 0 ? ipList.map(() => '?').join(',') : "''"})
          )
          ORDER BY c.created_at DESC LIMIT 10
        `).all(chatId, ...emailList, ...sessionList, ...ipList);

        if (candidateChats.length > 0) {
          const candidateData = candidateChats.map(c => ({
            id: c.id,
            ticketId: c.ticketId,
            title: c.ticketTitle || c.category || 'Anfrage',
            snippet: c.snippet || '',
            createdAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString('de-DE') : 'kürzlich'
          }));

          const dupResult = await detectDuplicateTopic(text, candidateData);
          if (dupResult.isDuplicate && dupResult.matchedChatId) {
            db.prepare('UPDATE chats SET pending_merge_target_id = ?, pending_merge_info = ? WHERE id = ?')
              .run(dupResult.matchedChatId, text, chatId);

            const matchedItem = candidateData.find(c => c.id === dupResult.matchedChatId);
            const matchedDate = matchedItem ? matchedItem.createdAt : 'kürzlich';

            const botAsk = `Ich habe gesehen, dass du am ${matchedDate} bereits eine Anfrage zum Thema "${dupResult.matchedTopic}" gestartet hast. Handelt es sich um genau dieses Thema?`;

            db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'bot\', ?)').run(chatId, botAsk);

            return NextResponse.json({
              text: botAsk,
              isDuplicatePrompt: true,
              matchedChatId: dupResult.matchedChatId,
              matchedTopic: dupResult.matchedTopic,
              imageUrl: cleanRelativePath
            });
          }
        }
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
    const aiResult = await generateChatResponse(chatHistory, chat ? chat.ticketCreated : 0, isAgentOnBehalfMode);
    let aiResponse = aiResult.text;
    const usedKnowledgeIds = aiResult.usedKnowledgeIds;
 
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

        // E-Mail-Benachrichtigung an alle Admins senden
        try {
          const admins = db.prepare("SELECT email FROM users WHERE role = 'admin'").all();
          const adminEmails = admins.map(a => a.email).filter(Boolean);
          if (adminEmails.length > 0) {
            const { sendMail } = await import('@/lib/mailer');
            const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const link = `${host}/admin`;

            const subject = `⚠️ Systemwarnung: Missbrauch im Chat-Bot erkannt (${chatId})`;
            const text = `Hallo,\n\nder KI-Bot hat soeben im Chat "${chatId}" missbräuchliches, beleidigendes oder unangemessenes Verhalten erkannt.\n\nDer betroffene Chat wurde gesperrt und zur Überprüfung freigegeben.\n\nNutzer-Name: ${chat ? chat.userName || 'Gast' : 'Gast'}\nNutzer-E-Mail: ${email || 'Keine (nicht angemeldet)'}\nIP-Adresse: ${userIp || 'Unbekannt'}\nSitzungs-ID: ${userSessionId || 'Unbekannt'}\n\nBitte prüfen Sie den Fall im Admin-Backend:\n${link}`;
            const html = `
              <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 12px; background-color: #fef2f2;">
                <h2 style="color: #dc2626; margin-top: 0; display: flex; items-center: center; gap: 8px;">
                  <span>⚠️</span> Missbrauch im Chat-Bot erkannt
                </h2>
                <p>Hallo Admin-Team,</p>
                <p>der KI-Bot hat soeben im Chat <strong style="font-family: monospace;">${chatId}</strong> missbräuchliches, beleidigendes oder unangemessenes Verhalten erkannt und das Gespräch beendet.</p>
                
                <div style="background-color: #ffffff; border: 1px solid #fca5a5; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 13px;">
                  <strong style="color: #991b1b; display: block; margin-bottom: 8px;">Details zum Vorfall:</strong>
                  <table style="width: 100%; font-size: 13px; color: #374151;">
                    <tr><td style="font-weight: bold; width: 120px; padding: 4px 0;">Nutzer-Name:</td><td>${chat ? chat.userName || 'Gast' : 'Gast'}</td></tr>
                    <tr><td style="font-weight: bold; padding: 4px 0;">Nutzer-E-Mail:</td><td>${email || 'Keine (nicht angemeldet)'}</td></tr>
                    <tr><td style="font-weight: bold; padding: 4px 0;">IP-Adresse:</td><td style="font-family: monospace;">${userIp || 'Unbekannt'}</td></tr>
                    <tr><td style="font-weight: bold; padding: 4px 0;">Sitzungs-ID:</td><td style="font-family: monospace;">${userSessionId || 'Unbekannt'}</td></tr>
                  </table>
                </div>
                
                <p style="margin: 30px 0; text-align: center;">
                  <a href="${link}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Admin-Backend aufrufen</a>
                </p>
              </div>
            `;

            for (const adminEmail of adminEmails) {
              await sendMail({ to: adminEmail, subject, html, text });
            }
          }
        } catch (mailErr) {
          console.error('Fehler beim Versenden der Missbrauchs-Admin-Mail:', mailErr);
        }
      } catch (err) {
        console.error('Fehler beim Markieren von Missbrauch:', err);
      }
    }

    // 6. Botnachricht speichern
    const insertResult = db.prepare('INSERT INTO chat_messages (chat_id, sender, text, base_knowledge) VALUES (?, ?, ?, ?)')
      .run(chatId, 'bot', aiResponse, usedKnowledgeIds);
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
      isAbusive,
      imageUrl: cleanRelativePath
    });

  } catch (err) {
    console.error('Fehler bei der Chat-Verarbeitung:', err);
    return NextResponse.json({ error: 'Fehler bei der Antwortgenerierung.' }, { status: 500 });
  }
}

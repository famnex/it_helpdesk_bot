import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { 
  generateChatResponse, 
  generateTicketTitle, 
  extractAgentBehalfDetails,
  checkSelfResolutionIntent,
  determineAgentAssignment
} from '@/lib/gemini';
import { queueTicketNotification } from '@/lib/notifications';
import { sendAssignmentNotification, sendUnassignedTicketNotification, sendTicketCreatedNotification } from '@/lib/mailer';
import { checkIpBanned, recordAbuseViolation } from '@/lib/abuse';
import fs from 'fs';
import path from 'path';

/**
 * GET: Holt den Verlauf eines bestimmten Chats oder alle alten Chats eines angemeldeten Benutzers.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  const user = await getSessionUser();
  const isStaff = user && (user.role === 'agent' || user.role === 'admin');

  // IP-Adresse extrahieren
  const xForwardedFor = request.headers.get('x-forwarded-for');
  let userIp = '';
  if (xForwardedFor) {
    userIp = xForwardedFor.split(',')[0].trim();
  } else {
    userIp = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || request.ip || '127.0.0.1';
  }

  const banStatus = isStaff ? { isBanned: false, bannedUntil: null } : checkIpBanned(userIp);

  try {
    if (chatId) {
      const chat = db.prepare('SELECT id, is_abusive as isAbusive FROM chats WHERE id = ?').get(chatId);

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
      
      return NextResponse.json({ 
        messages: messagesWithPrefix,
        isAbusive: chat ? chat.isAbusive === 1 : false,
        isIpBanned: banStatus.isBanned,
        bannedUntil: banStatus.bannedUntil
      });
    }

    if (user && user.email) {
      // Alle echten Chats eines angemeldeten Benutzers auflisten (ohne Session-Link-Zeilen)
      const userChats = db.prepare(`
        SELECT id, created_at as createdAt 
        FROM chats 
        WHERE user_email = ? AND id NOT LIKE 'link-%'
        ORDER BY created_at DESC
      `).all(user.email);
      
      return NextResponse.json({ 
        chats: userChats,
        isIpBanned: banStatus.isBanned,
        bannedUntil: banStatus.bannedUntil
      });
    }

    return NextResponse.json({ 
      messages: [],
      isIpBanned: banStatus.isBanned,
      bannedUntil: banStatus.bannedUntil
    });
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
        // Validierung der Dateigröße (max. 10 MB) und des Dateityps
        if (photoFile.size > 10 * 1024 * 1024) {
          return NextResponse.json({ error: 'Das Bild darf maximal 10 MB groß sein.' }, { status: 400 });
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

    if ((!text || !text.trim()) && !relativePath) {
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
      userIp = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || request.ip || '127.0.0.1';
    }

    // Persistente Session ID aus Header extrahieren
    const userSessionId = request.headers.get('x-user-session-id') || '';

    const isStaff = user && (user.role === 'agent' || user.role === 'admin');

    // IP-Sperre prüfen (nur für reguläre Chatnutzer, niemals für Agenten/Admins)
    if (!isStaff) {
      const banStatus = checkIpBanned(userIp);
      if (banStatus.isBanned) {
        return NextResponse.json({
          error: 'Deine IP-Adresse ist für Chateingaben gesperrt.',
          isIpBanned: true,
          bannedUntil: banStatus.bannedUntil
        }, { status: 403 });
      }
    }

function extractEmailFromText(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  return match ? match[1].toLowerCase() : null;
}

function extractEmailFromHistory(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i]?.text || '';
    const email = extractEmailFromText(text);
    if (email) return email;
  }
  return null;
}

    // E-Mail aus aktuellem Nachrichtentext extrahieren, falls vorhanden
    const incomingEmail = extractEmailFromText(text);

    // 1. Sicherstellen, dass der Chat existiert
    let chat = db.prepare('SELECT id, ticket_created as ticketCreated, user_email as userEmail, user_name as userName, is_agent_on_behalf as isAgentOnBehalf, is_abusive as isAbusive FROM chats WHERE id = ?').get(chatId);
    const resolvedEmail = email || incomingEmail || (chat ? chat.userEmail : null);

    if (!chat) {
      db.prepare('INSERT INTO chats (id, user_email, user_name, is_agent_on_behalf, user_ip, user_session_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(chatId, resolvedEmail, user ? user.name : null, isAgentOnBehalf ? 1 : 0, userIp, userSessionId);
      chat = { id: chatId, ticketCreated: 0, userEmail: resolvedEmail, isAgentOnBehalf: isAgentOnBehalf ? 1 : 0, isAbusive: 0 };
    } else {
      // Wenn der Chat bereits wegen Missbrauchs beendet wurde, keine weiteren Nachrichten annehmen!
      if (!isStaff && chat.isAbusive === 1) {
        return NextResponse.json({
          error: 'Dieses Gespräch wurde wegen eines Richtlinienverstoßes beendet und kann nicht fortgeführt werden.',
          isAbusive: true
        }, { status: 403 });
      }

      // Immer versuchen, E-Mail, Name, IP und Session-ID des Benutzers zu aktualisieren/ergänzen (außer bei On-Behalf-Chats)
      if (chat.isAgentOnBehalf !== 1) {
        db.prepare('UPDATE chats SET user_email = ?, user_name = ?, user_ip = ?, user_session_id = ?, customer_last_active_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(resolvedEmail || chat.userEmail || null, (user ? user.name : null) || chat.userName || null, userIp || null, userSessionId || null, chatId);
        if (resolvedEmail) {
          chat.userEmail = resolvedEmail;
        }
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

    // Falls es sich um ein System-Event handelt (z.B. [SYSTEM_EVENT: TICKET_CREATED:...]), keine KI anwerfen
    if (isSystemEvent) {
      return NextResponse.json({ 
        success: true, 
        text: null, 
        isSystemEvent: true, 
        imageUrl: cleanRelativePath 
      });
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
    const ticket = db.prepare('SELECT id, title, status, creator_email, assigned_agent_id FROM tickets WHERE chat_id = ?').get(chatId);
    const isTicketHandedOver = (chat && chat.ticketCreated === 1) || Boolean(ticket);
    if (isTicketHandedOver && !isSystemEvent) {

      // KI liest mit: Prüfen, ob der Nutzer sagt, dass sich das Problem erledigt hat
      const resolutionCheck = await checkSelfResolutionIntent(text);

      if (resolutionCheck.isResolved && ticket) {
        const botReply = `Alles klar! Ich habe das Support-Ticket (#${ticket.id}) für dich geschlossen. Freut mich, dass sich dein Anliegen erledigt hat! Falls du wieder Unterstützung benötigst, bin ich jederzeit für dich da.`;
        const resolutionNote = `Vom Benutzer im Chat als erledigt/storniert gemeldet: "${text}"`;

        db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'bot\', ?)').run(chatId, botReply);
        db.prepare(`
          INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
          VALUES (?, 'IT-Support-Bot', 'bot', ?)
        `).run(ticket.id, botReply);

        db.prepare(`
          UPDATE tickets 
          SET status = 'closed',
              solution = ?,
              closed_at = CURRENT_TIMESTAMP, 
              closed_by_name = ?, 
              closed_by_email = ?, 
              closed_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(resolutionNote, user ? (user.name || user.email) : (chat?.user_name || ticket.creator_email || 'Kunde'), user ? user.email : (ticket.creator_email || 'kunde@system'), user ? user.id : 'customer', ticket.id);

        db.prepare(`
          INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
          VALUES (?, 'system', 'system', ?)
        `).run(ticket.id, `[SYSTEM_EVENT: TICKET_CLOSED_BY_CUSTOMER] Ticket wurde durch Benutzer im Chat als erledigt/storniert gemeldet ("${text}").`);

        // Falls Ticket einem Agenten zugewiesen war, diesen benachrichtigen
        if (ticket.assigned_agent_id) {
          const agent = db.prepare('SELECT email, name FROM users WHERE id = ?').get(ticket.assigned_agent_id);
          if (agent) {
            await queueTicketNotification({
              ticketId: ticket.id,
              recipientEmail: agent.email,
              recipientRole: 'agent',
              senderName: user ? (user.name || user.email) : 'Kunde',
              messageText: `[Ticket durch Kunden im Chat als erledigt geschlossen]: ${text}`
            });
          }
        }

        return NextResponse.json({
          text: botReply,
          isHandedOver: true,
          isClosedByBot: true,
          imageUrl: cleanRelativePath
        });
      } else {
        // Falls das Ticket bereits geschlossen war, automatisch wiedereröffnen!
        if (ticket && ticket.status === 'closed') {
          const reopenStatus = ticket.assigned_agent_id ? 'assigned' : 'open';
          db.prepare(`
            UPDATE tickets 
            SET status = ?, 
                closed_at = NULL, 
                closed_by_name = NULL, 
                closed_by_email = NULL, 
                closed_by_user_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(reopenStatus, ticket.id);

          db.prepare(`
            INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text)
            VALUES (?, 'system', 'system', '[SYSTEM_EVENT: TICKET_REOPENED] Ticket wurde durch neue Kundennachricht im Chat automatisch wieder geöffnet.')
          `).run(ticket.id);
        }

        // Sobald das Ticket existiert / übergeben ist, bleibt der Bot grundsätzlich stumm,
        // beantwortet aber typische Orientierungsfragen (z. B. "Wie mache ich das jetzt mit dem Ticket", "Wo melde ich mich an")
        let botAck = null;
        const orientationPatterns = [
          /wie mache ich das.*ticket/i,
          /wo (melde|muss) ich mich.*an/i,
          /wo logge ich mich.*ein/i,
          /was (muss|soll) ich (jetzt )?tun/i,
          /wie geht es (jetzt )?weiter/i,
          /wann meldet sich.*(it|jemand|admin)/i
        ];

        const textCheck = (text || '').trim().toLowerCase();
        if (orientationPatterns.some(p => p.test(textCheck))) {
          botAck = "Dein Support-Ticket wurde direkt an unser IT-Team übermittelt. Du musst dich nirgendwo extra anmelden oder etwas tun – ein Mitarbeiter prüft dein Anliegen und du wirst per E-Mail bzw. hier im Chat benachrichtigt, sobald es Neuigkeiten gibt.";
          db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, \'bot\', ?)').run(chatId, botAck);
          if (ticket) {
            db.prepare('INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) VALUES (?, \'IT-Support-Bot\', \'bot\', ?)')
              .run(ticket.id, botAck);
          }
        }

        if (ticket) {
          if (ticket.assigned_agent_id) {
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
          } else {
            const supportTeam = db.prepare("SELECT email FROM users WHERE role IN ('agent', 'admin')").all();
            for (const member of supportTeam) {
              await queueTicketNotification({
                ticketId: ticket.id,
                recipientEmail: member.email,
                recipientRole: 'agent',
                senderName: user ? user.name : 'Benutzer',
                messageText: text || '(Anhang gesendet)'
              });
            }
          }
        }

        return NextResponse.json({
          text: botAck,
          isHandedOver: true,
          isSilent: !botAck,
          imageUrl: cleanRelativePath
        });
      }
    }

    // 2. Letzten Verlauf laden (inklusive image_url)
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
    let autoTicketId = null;

    const aiTextLower = aiResponse.toLowerCase();

    // Sätze, die eine bereits ERFOLGTE Ticket-Erstellung in der Vergangenheit beschreiben
    const completedPhrases = [
      'ich habe ein ticket', 
      'ich habe dir ein ticket', 
      'ich habe ein support-ticket', 
      'ticket wurde erstellt', 
      'ticket wurde angelegt', 
      'ticket wurde eröffnet', 
      'support-ticket wurde erfolgreich', 
      'ich habe soeben ein ticket'
    ];

    // Phrasen, die bloße ANGEBOTE, OPTIONEN oder FRAGEN sind (dürfen NIEMALS automatisch ein Ticket triggern!)
    const offerPhrases = [
      'möchtest du', 
      'soll ich', 
      'kann ich gerne', 
      'kann gerne', 
      'sag mir', 
      'sag einfach', 
      'falls du', 
      'wenn du', 
      'erstellen?', 
      'anlegen?', 
      'eröffnen?'
    ];

    const hasExplicitTag = aiResponse.includes('[TICKET_CREATED]');
    const isOfferOrQuestion = offerPhrases.some(p => aiTextLower.includes(p));
    const claimsCompletedAction = completedPhrases.some(p => aiTextLower.includes(p));

    if (hasExplicitTag || (claimsCompletedAction && !isOfferOrQuestion)) {
      ticketCreated = true;
      aiResponse = aiResponse.replace('[TICKET_CREATED]', '').trim();
      
      // Ticket-Erstellung:
      if (isAgentOnBehalfMode) {
        // Im On-Behalf-Modus wird das Ticket NICHT automatisch unter der E-Mail des Agenten angelegt,
        // sondern über das Bestätigungs-Formular im Modal (Frontend)
        ticketCreated = true;
        try {
          extractedData = await extractAgentBehalfDetails(chatHistory);
        } catch (err) {
          console.error('Fehler bei extractAgentBehalfDetails:', err);
        }
      } else {
        let userEmailForTicket = email || (chat ? chat.userEmail : null) || incomingEmail || extractEmailFromHistory(chatHistory);

        if (userEmailForTicket) {
          // Sicherstellen, dass die E-Mail im Chat gespeichert ist
          if (chat && !chat.userEmail) {
            db.prepare('UPDATE chats SET user_email = ? WHERE id = ?').run(userEmailForTicket, chatId);
            chat.userEmail = userEmailForTicket;
          }

          ticketCreated = true;
          try {
            proposedTitle = await generateTicketTitle(chatHistory);
          } catch (err) {
            console.error('Fehler bei der proposedTitle-Generierung:', err);
          }

          try {
            const finalTitle = proposedTitle || 'Support-Anfrage über Chat-Assistent';
            const existingTicket = db.prepare('SELECT id FROM tickets WHERE chat_id = ?').get(chatId);
            if (!existingTicket) {
              // Eindeutige Ticket-ID (TK-XXXX) generieren
              let newTicketId;
              let isUnique = false;
              const checkStmt = db.prepare('SELECT id FROM tickets WHERE id = ?');
              while (!isUnique) {
                newTicketId = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
                if (!checkStmt.get(newTicketId)) isUnique = true;
              }

              // Automatische Agenten-Zuweisung prüfen
              const potentialAgents = db.prepare(`
                SELECT id, email, name, responsibilities 
                FROM users 
                WHERE (role = 'agent' OR role = 'admin') 
                  AND responsibilities IS NOT NULL 
                  AND responsibilities != ''
              `).all();

              let matchedAgentId = null;
              let matchedAgent = null;
              if (potentialAgents.length > 0) {
                try {
                  const chatHistoryMsgs = db.prepare(`
                    SELECT sender, text FROM chat_messages 
                    WHERE chat_id = ? 
                    ORDER BY created_at ASC
                  `).all(chatId);
                  matchedAgentId = await determineAgentAssignment(finalTitle, chatHistoryMsgs, potentialAgents);
                  if (matchedAgentId) {
                    matchedAgent = potentialAgents.find(a => a.id === matchedAgentId);
                  }
                } catch (assignErr) {
                  console.error('Fehler bei automatischer Ticket-Zuweisung im Bot:', assignErr);
                }
              }

              const ticketStatus = matchedAgent ? 'assigned' : 'open';
              const assignedId = matchedAgent ? matchedAgent.id : null;

              db.prepare('INSERT INTO tickets (id, title, creator_email, chat_id, status, assigned_agent_id, is_authenticated_creator) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(newTicketId, finalTitle, userEmailForTicket, chatId, ticketStatus, assignedId, user ? 1 : 0);
              
              autoTicketId = newTicketId;
              db.prepare('UPDATE chats SET ticket_created = 1 WHERE id = ?').run(chatId);

              db.prepare('INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) VALUES (?, \'system\', \'system\', ?)')
                .run(newTicketId, `[Ticket aus Chat #${chatId}]: ${finalTitle}`);

              if (matchedAgent) {
                db.prepare('INSERT INTO ticket_messages (ticket_id, sender_email, sender_role, text) VALUES (?, \'system\', \'system\', ?)')
                  .run(newTicketId, `Ticket wurde automatisch ${matchedAgent.email} zugewiesen.`);
                try {
                  await sendAssignmentNotification(matchedAgent.email, newTicketId, finalTitle);
                } catch (mailErr) {
                  console.error('Fehler beim Senden der Zuweisungs-Mail aus Chat:', mailErr);
                }
              } else {
                try {
                  const allAgents = db.prepare("SELECT email FROM users WHERE role = 'agent' OR role = 'admin'").all();
                  const agentEmails = allAgents.map(a => a.email);
                  if (agentEmails.length > 0) {
                    await sendUnassignedTicketNotification(agentEmails, newTicketId, finalTitle);
                  }
                } catch (mailErr) {}
              }

              try {
                await sendTicketCreatedNotification(userEmailForTicket, newTicketId, finalTitle);
              } catch (mailErr) {}

              // Falls Gemini keine Antwort formuliert hat, Bestätigungstext setzen
              if (!aiResponse || !aiResponse.trim()) {
                aiResponse = `Ich habe dein Support-Ticket #${newTicketId} erfolgreich für dich angelegt. Unser IT-Team kümmert sich zeitnah darum.`;
              }
            } else {
              autoTicketId = existingTicket.id;
            }
          } catch (dbErr) {
            console.error('Fehler bei automatischer DB-Ticket-Erstellung:', dbErr);
          }
        } else {
          // Anonymer Nutzer ohne E-Mail: Keine Ticket-Erstellung in DB möglich -> Nach E-Mail fragen
          ticketCreated = false;
          aiResponse = "Damit ich ein Support-Ticket für dich erstellen und an unser IT-Team übergeben kann, benötige ich bitte noch deine E-Mail-Adresse (z. B. deine schulische oder private E-Mail). Wie lautet deine E-Mail-Adresse?";
        }
      }
    }

    // Auf Missbrauch (Beleidigung / Trolling) prüfen
    let isAbusive = false;
    let isIpBanned = false;
    let bannedUntil = null;
    let isWarning = false;

    if (aiResponse.includes('[CHAT_ABUSE_DETECTED]')) {
      isAbusive = true;
      aiResponse = aiResponse.replace('[CHAT_ABUSE_DETECTED]', '').trim();
      
      try {
        db.prepare(`
          UPDATE chats 
          SET is_abusive = 1, abusive_flagged_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(chatId);

        // 2-Stufen-Modell anwenden: 1. Verstoß = Verwarnung, 2. Verstoß (innerhalb 24h) = 24h-IP-Sperre
        const abuseResult = recordAbuseViolation({
          ip: userIp,
          sessionId: userSessionId,
          userEmail: email,
          reason: 'Trolling / Richtlinienverstoß im Chat'
        });

        if (abuseResult.action === 'banned') {
          isIpBanned = true;
          bannedUntil = abuseResult.bannedUntil;
          aiResponse += "\n\n🚫 **Sperre aktiviert:** Aufgrund wiederholter Verstöße gegen die Nutzungsrichtlinien wurde deine IP-Adresse für **24 Stunden** für alle Chateingaben gesperrt.";
        } else {
          isWarning = true;
          aiResponse += "\n\n⚠️ **Verwarnung:** Deine Nachricht verstößt gegen die Nutzungsrichtlinien unseres IT-Support-Systems. Dieses Gespräch wird hiermit beendet. Bei einem weiteren Verstoß wird deine IP-Adresse für 24 Stunden für Chateingaben gesperrt.";
        }

        console.log(`Chat ${chatId} (${userIp}) als missbräuchlich eingestuft: ${abuseResult.action} (Verstoß #${abuseResult.warningCount})`);

        // E-Mail-Benachrichtigung an alle Admins senden
        try {
          const admins = db.prepare("SELECT email FROM users WHERE role = 'admin'").all();
          const adminEmails = admins.map(a => a.email).filter(Boolean);
          if (adminEmails.length > 0) {
            const { sendMail } = await import('@/lib/mailer');
            const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const link = `${host}/admin`;

            const subject = isIpBanned 
              ? `🚫 Systemwarnung: 24h IP-Sperre verhängt für ${userIp} (${chatId})` 
              : `⚠️ Systemwarnung: Verwarnung wegen Missbrauch im Chat-Bot (${chatId})`;

            const text = `Hallo,\n\nder KI-Bot hat soeben im Chat "${chatId}" missbräuchliches Verhalten erkannt.\n\nStatus: ${isIpBanned ? '24-STUNDEN IP-SPERRE AKTIVIERT' : '1. VERWARNUNG AUSGESPROCHEN'}\n\nNutzer-Name: ${chat ? chat.userName || 'Gast' : 'Gast'}\nNutzer-E-Mail: ${email || 'Keine (nicht angemeldet)'}\nIP-Adresse: ${userIp || 'Unbekannt'}\nSitzungs-ID: ${userSessionId || 'Unbekannt'}\n\nDetails im Admin-Backend:\n${link}`;
            
            const html = `
              <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 12px; background-color: #fef2f2;">
                <h2 style="color: #dc2626; margin-top: 0; display: flex; items-center: center; gap: 8px;">
                  <span>${isIpBanned ? '🚫' : '⚠️'}</span> ${isIpBanned ? '24h IP-Sperre verhängt' : 'Verwarnung wegen Missbrauch'}
                </h2>
                <p>Hallo Admin-Team,</p>
                <p>im Chat <strong style="font-family: monospace;">${chatId}</strong> wurde missbräuchliches Verhalten erkannt. Das Gespräch wurde sofort beendet.</p>
                
                <div style="background-color: #ffffff; border: 1px solid #fca5a5; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 13px;">
                  <strong style="color: #991b1b; display: block; margin-bottom: 8px;">Details zur Maßnahme:</strong>
                  <table style="width: 100%; font-size: 13px; color: #374151;">
                    <tr><td style="font-weight: bold; width: 140px; padding: 4px 0;">Maßnahme:</td><td style="font-weight: bold; color: ${isIpBanned ? '#dc2626' : '#d97706'};">${isIpBanned ? '24h IP-Sperre aktiv' : '1. Verwarnung erteilt'}</td></tr>
                    <tr><td style="font-weight: bold; padding: 4px 0;">Nutzer-Name:</td><td>${chat ? chat.userName || 'Gast' : 'Gast'}</td></tr>
                    <tr><td style="font-weight: bold; padding: 4px 0;">Nutzer-E-Mail:</td><td>${email || 'Keine (nicht angemeldet)'}</td></tr>
                    <tr><td style="font-weight: bold; padding: 4px 0;">IP-Adresse:</td><td style="font-family: monospace; font-weight: bold;">${userIp || 'Unbekannt'}</td></tr>
                    <tr><td style="font-weight: bold; padding: 4px 0;">Sitzungs-ID:</td><td style="font-family: monospace;">${userSessionId || 'Unbekannt'}</td></tr>
                    ${bannedUntil ? `<tr><td style="font-weight: bold; padding: 4px 0;">Gesperrt bis:</td><td>${new Date(bannedUntil).toLocaleString('de-DE')} Uhr</td></tr>` : ''}
                  </table>
                </div>
                
                <p style="margin: 30px 0; text-align: center;">
                  <a href="${link}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Im Admin-Backend verwalten</a>
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
    const finalBaseKnowledge = Array.isArray(usedKnowledgeIds) 
      ? (usedKnowledgeIds.length > 0 ? usedKnowledgeIds.join(',') : null) 
      : (usedKnowledgeIds || null);

    const insertResult = db.prepare('INSERT INTO chat_messages (chat_id, sender, text, base_knowledge) VALUES (?, ?, ?, ?)')
      .run(chatId, 'bot', aiResponse, finalBaseKnowledge);
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
      autoTicketId,
      proposedTitle,
      extractedData,
      isAgentOnBehalf: isAgentOnBehalfMode,
      botMessageId,
      isAbusive,
      isWarning,
      isIpBanned,
      bannedUntil,
      imageUrl: cleanRelativePath
    });

  } catch (err) {
    console.error('Fehler bei der Chat-Verarbeitung:', err);
    return NextResponse.json({ error: 'Fehler bei der Antwortgenerierung.' }, { status: 500 });
  }
}

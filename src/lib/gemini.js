import db from './db';
import fs from 'fs';
import path from 'path';

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Holt den Gemini API-Key vorrangig aus der Datenbank-Konfiguration,
 * andernfalls aus der Umgebungsvariablen.
 */
function getApiKey() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('gemini_config');
    if (row) {
      const config = JSON.parse(row.value);
      if (config.apiKey) return config.apiKey;
    }
  } catch (e) {
    // ignorieren
  }
  return process.env.GEMINI_API_KEY || '';
}

/**
 * Ruft die konfigurierten Modellnamen aus der Datenbank ab oder nutzt Standardwerte.
 */
function getModelNames() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('gemini_config');
    if (row) {
      const config = JSON.parse(row.value);
      return {
        chatModel: config.chatModel || 'gemini-3.5-flash',
        extractionModel: config.extractionModel || 'gemini-3.5-flash'
      };
    }
  } catch (e) {
    // ignorieren
  }
  return {
    chatModel: 'gemini-3.5-flash',
    extractionModel: 'gemini-3.5-flash'
  };
}

/**
 * Allgemeine Hilfsfunktion für Aufrufe an die Gemini API.
 */
async function callGemini(modelName, payload) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY ist nicht konfiguriert.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Fehler (${response.status}): ${errText}`);
  }

  const data = await response.json();
  try {
    return data.candidates[0].content.parts[0].text;
  } catch (err) {
    throw new Error('Ungültiges Antwortformat von der Gemini API.');
  }
}

/**
 * Generiert eine Antwort im Bot-Chat basierend auf dem aktuellen Chatverlauf
 * und den passenden Wissenseinträgen aus der Datenbank.
 */
export async function generateChatResponse(chatMessagesState, ticketAlreadyCreated = false) {
  const { chatModel } = getModelNames();
  
  // 1. Wissensdatenbank auslesen
  let knowledgeString = "";
  try {
    const chunks = db.prepare('SELECT id, title, fact FROM knowledge').all();
    if (chunks.length > 0) {
      knowledgeString = "\n\nDEINE WISSENSDATENBANK (WICHTIG: Nutze diese Lösungen zwingend, wenn das Problem dazu passt!):\n";
      chunks.forEach(c => {
        const attachments = db.prepare(`
          SELECT filename, file_path as filePath 
          FROM knowledge_attachments 
          WHERE knowledge_id = ?
        `).all(c.id);

        let attachmentInfo = "";
        if (attachments.length > 0) {
          attachmentInfo = " [WICHTIG: Biete dem Benutzer zwingend diese Links zum Download an, falls er danach fragt oder die Lösung vorschlägt: ";
          attachments.forEach((att, idx) => {
            if (idx > 0) attachmentInfo += ", ";
            attachmentInfo += `[${att.filename}](${att.filePath})`;
          });
          attachmentInfo += "]";
        }

        knowledgeString += `- WENN PROBLEM: "${c.title}" DANN LÖSUNG: "${c.fact}"${attachmentInfo}\n`;
      });
    } else {
      knowledgeString = "\n\nDeine Wissensdatenbank ist aktuell leer.";
    }
  } catch (e) {
    console.error('Fehler beim Laden des Wissens für Chat:', e);
  }

  // 2. System Instruction zusammenbauen
  const basePrompt = `Du bist ein freundlicher IT-Support-Chatbot für eine Schule. Du sprichst den Benutzer ausschließlich per Du ("du", "dir", "dein") an. Halte deine Antworten kurz, übersichtlich und präzise.
Verwende Markdown für Listen, Hervorhebungen und Links.
Falls der Benutzer ein unklares technisches Problem beschreibt (z.B. einen nicht funktionierenden Drucker, Bildschirmausfall oder eine Fehlermeldung), frage ihn freundlich, ob er das Problem genauer beschreiben oder ein Foto/Screenshot davon über die Büroklammer hochladen kann.`;
  
  let ticketInstruction = "";
  if (ticketAlreadyCreated) {
    ticketInstruction = `
ACHTUNG / ZWINGENDE REGEL:
Für diesen Chat wurde bereits erfolgreich ein Support-Ticket für die IT-Admins erstellt!
1. Biete dem Benutzer unter KEINEN Umständen eine weitere Ticket-Erstellung an!
2. Schreibe NIEMALS den Tag [TICKET_CREATED] in deine Antwort!
3. Wenn du ein System-Event im Verlauf siehst wie "[SYSTEM_EVENT: TICKET_CREATED: TK-XXXX]", reagiere darauf mit einer freundlichen Bestätigung und einer Verabschiedung.
4. Weise den Benutzer unbedingt darauf hin, dass er jederzeit weitere Informationen, Updates oder Fotos direkt über diesen Chat senden kann. Erkläre ihm auch, dass er dies über den Ticket-Link tun kann, den er automatisch per E-Mail erhält.`;
  } else {
    ticketInstruction = `
REGELN FÜR DIE ERSTELLUNG VON IT-SUPPORT-TICKETS:
1. Du darfst dem Benutzer die Erstellung eines IT-Support-Tickets NUR DANN anbieten und den Tag [TICKET_CREATED] NUR DANN am Ende deiner Antwort mitsenden, wenn du ALLE notwendigen Informationen vollständig gesammelt hast.
2. Bei allen physischen Geräten und Problemen vor Ort (z. B. Beamer, PC, Smartboard, Drucker, Monitor, Netzdose) ist die Raumnummer (Raum) eine ZWINGENDE Pflichtangabe!
3. Falls die Raumnummer noch nicht im bisherigen Chatverlauf genannt wurde, frage ZUERST gezielt danach (z. B. "In welchem Raum befindest du dich?").
4. WARNUNG: Wenn du noch auf die Antwort des Benutzers bezüglich des Raums oder der Fehlerdetails wartest (d.h. wenn du eine Frage an ihn stellst), darfst du den Tag [TICKET_CREATED] unter KEINEN Umständen mitsenden!
5. Der Tag [TICKET_CREATED] darf ausschließlich und ZWINGEND nur dann gesendet werden, wenn die Raumnummer und alle Details geklärt sind und du bereit bist, das Ticket JETZT FINAL zu erstellen.`;
  }

  const systemInstruction = basePrompt + knowledgeString + "\n\n" + ticketInstruction;

  // 3. Letzte 10 Nachrichten für den Kontext aufbereiten
  const contents = chatMessagesState.slice(-10).map(msg => {
    const parts = [];
    
    // Textteil hinzufügen (falls leer, leerer String)
    parts.push({ text: msg.text || "" });
    
    // Bildteil hinzufügen, falls vorhanden
    if (msg.imageUrl) {
      try {
        const filePath = path.join(process.cwd(), 'public', msg.imageUrl);
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
          const base64Data = fileBuffer.toString('base64');
          const mimeType = getMimeType(filePath);
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          });
        }
      } catch (err) {
        console.error('Fehler beim Konvertieren des Chatbildes für Gemini:', err);
      }
    }
    
    return {
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: parts
    };
  });

  const payload = {
    contents: contents,
    systemInstruction: { parts: [{ text: systemInstruction }] }
  };

  return callGemini(chatModel, payload);
}

/**
 * Extrahiert Wissenschunks (Titel + Fakt) aus einem gelösten Ticket oder Dokument.
 */
export async function extractKnowledgeChunks(text) {
  const { extractionModel } = getModelNames();
  
  const prompt = `Analysiere den folgenden Text und extrahiere eigenständige IT-Wissenschunks. 
Jeder Chunk MUSS aus vier Feldern bestehen:
1. "title": Das Thema oder Problem (kurz und prägnant).
2. "fact": Eine sehr kurze, prägnante Zusammenfassung der Lösung (maximal 1-2 Sätze), die perfekt als kompakter Kontext für den Bot-Chat geeignet ist.
3. "description": Eine ausführliche, umfassende Beschreibung oder Schritt-für-Schritt-Anleitung der Lösung. Verwende sinnvolle Markdown-Formatierungen (wie Fettungen, Aufzählungen, Zeilenumbrüche), um den Text gut lesbar und strukturiert für ein öffentliches Hilfeportal zu machen.
4. "category": Der Name einer passenden Kategorie für dieses Thema (z. B. "WLAN", "Hardware", "Drucker", "Software", "E-Mail & Konten"). Wenn keines dieser Standardthemen zutrifft, wähle dynamisch einen aussagekräftigen, kurzen Kategorienamen in deutscher Sprache, der das Thema gut zusammenfasst (z. B. "Smartboard", "Webseiten", "iPad-Koffer").

Gib das Ergebnis ausschließlich als valides JSON-Array aus. Nutze keine Markdown-Formatierung um das JSON selbst (kein \`\`\`json ... \`\`\`), sondern gib nur den reinen JSON-String aus.

Format:
[
  { 
    "title": "WLAN-Verbindung für Gäste", 
    "fact": "Das Gästenetzwerk heißt 'Schule-Gast'. Der Zugangscode ist an der Pforte erhältlich.",
    "description": "Um sich mit dem Gästenetzwerk 'Schule-Gast' zu verbinden, führen Sie folgende Schritte aus:\\n\\n1. Suchen Sie nach dem Netzwerk **Schule-Gast**.\\n2. Gehen Sie zur **Pforte der Schule** und weisen Sie sich kurz aus.\\n3. Dort erhalten Sie einen Tages-Zugangscode.\\n4. Geben Sie den Code ein, um die Verbindung herzustellen.",
    "category": "WLAN"
  }
]

Text zum Analysieren:
${text}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const responseText = await callGemini(extractionModel, payload);
  try {
    // Eventuelle Markdown-Code-Blöcke säubern, falls Gemini sie trotz Anweisung mitsendet
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (err) {
    console.error('Fehler beim Parsen der extrahierten Chunks:', responseText);
    return [];
  }
}

/**
 * Generiert eine ausführliche Markdown-Beschreibung basierend auf Titel und Fakt.
 */
export async function generateDetailedDescription(title, fact) {
  const { extractionModel } = getModelNames();
  
  const prompt = `Du bist ein erfahrener IT-Support-Spezialist für Schulen.
Hier ist ein Wissenseintrag mit einem Titel und einer kurzen Zusammenfassung der Lösung:
TITEL: "${title}"
KURZ-INFO: "${fact}"

Bitte generiere daraus eine ausführliche, umfassende Beschreibung oder Schritt-für-Schritt-Anleitung der Lösung.
Die Anleitung soll leicht verständlich für Lehrer, Schüler oder andere Mitarbeiter sein.
Nutze sinnvolle Markdown-Formatierungen (wie Fettungen, Aufzählungen oder nummerierte Listen), um den Text gut lesbar und strukturiert für ein öffentliches Hilfeportal zu machen.
Antworte ausschließlich mit dem generierten Markdown-Text. Schreibe keine Begrüßungen, Erklärungen oder Einleitungen.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  return callGemini(extractionModel, payload);
}

/**
 * Generiert einen kurzen, prägnanten Ticket-Titel aus dem Chatverlauf.
 */
export async function generateTicketTitle(chatMessages) {
  const { extractionModel } = getModelNames();
  
  let chatText = "";
  chatMessages.slice(-10).forEach(m => {
    chatText += `${m.sender === 'user' ? 'Benutzer' : 'Support-Assistent'}: ${m.text}\n`;
  });

  const prompt = `Erstelle eine präzise, kurze Betreffzeile (in deutscher Sprache, maximal 5 Wörter) für ein IT-Support-Ticket, die das konkrete Problem des Benutzers aus dem folgenden Chatverlauf zusammenfasst.
Verwende eine sachliche Formulierung (eine Nominalphrase / Substantivgruppe, z. B. "Defektes Gerät", "Verbindungsproblem", etc.) und wiederhole NIEMALS wörtlich ganze Sätze des Benutzers oder Umgangssprache.

Beispiele:
- "Beamer defekt (blinkt rot)"
- "Moodle-Passwort zurücksetzen"
- "WLAN-Verbindung schlägt fehl (Android)"
- "Smartboard flackert in Raum 204"

Chatverlauf:
${chatText}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  try {
    const title = await callGemini(extractionModel, payload);
    return title.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    console.error('Fehler bei generateTicketTitle:', err);
    return 'Support-Anfrage über Chat-Assistent';
  }
}

/**
 * Prüft, ob ein neuer Chunk bereits in der Datenbank existiert (Deduplizierung).
 * Gibt die ID des Duplikats zurück oder 'NEIN', falls es sich um neues Wissen handelt.
 */
export async function checkDuplicate(newChunk, existingChunks) {
  if (existingChunks.length === 0) return 'NEIN';
  
  const { extractionModel } = getModelNames();
  
  // Vorhandenes Wissen für den Prompt aufbereiten
  let existingList = "";
  existingChunks.forEach(c => {
    existingList += `- ID: "${c.id}" | TITEL: "${c.title}" | FAKT: "${c.fact}"\n`;
  });

  const prompt = `Wir haben eine bestehende IT-Wissensdatenbank mit folgenden Einträgen:
${existingList}

Hier ist ein neuer Wissenschunk, der hinzugefügt werden soll:
TITEL: "${newChunk.title}"
FAKT: "${newChunk.fact}"

Prüfe, ob dieser neue Wissenschunk inhaltlich bereits durch einen oder mehrere vorhandene Chunks abgedeckt ist.
Wenn ja (das Wissen ist bereits vorhanden), antworte ausschließlich mit der ID des vorhandenen Chunks (z.B. "smartboard-chunk-1").
Wenn nein (es ist neues, eigenständiges Wissen), antworte ausschließlich mit dem Wort "NEIN".

Gib KEINE Erklärung ab. Deine Antwort darf nur die ID oder das Wort "NEIN" enthalten.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const responseText = await callGemini(extractionModel, payload);
  return responseText.trim();
}

/**
 * Führt den vollständigen Deduplizierungs- und Speicherprozess für ein Array von Chunks aus.
 */
export async function processAndSaveChunks(chunks, source) {
  const savedChunks = [];
  try {
    // Bestehendes Wissen laden
    const existingChunks = db.prepare('SELECT id, title, fact FROM knowledge').all();
    
    const insertStmt = db.prepare('INSERT INTO knowledge (id, title, fact, description, category, source) VALUES (?, ?, ?, ?, ?, ?)');
    
    for (const chunk of chunks) {
      if (!chunk.title || !chunk.fact) continue;
      
      const description = chunk.description || chunk.fact;
      const category = chunk.category || 'Sonstiges';
      
      // Duplikatsprüfung mit Gemini
      const duplicateResult = await checkDuplicate(chunk, existingChunks);
      
      if (duplicateResult === 'NEIN') {
        const chunkId = `chunk-${Math.floor(100000 + Math.random() * 900000)}`;
        insertStmt.run(chunkId, chunk.title, chunk.fact, description, category, source);
        savedChunks.push({ id: chunkId, title: chunk.title, fact: chunk.fact, description, category, isNew: true });
        // Das neu hinzugefügte Element für nachfolgende Iterationen in die Liste aufnehmen
        existingChunks.push({ id: chunkId, title: chunk.title, fact: chunk.fact });
      } else {
        console.log(`Deduplizierung: Chunk "${chunk.title}" übersprungen. Duplikat von ID: ${duplicateResult}`);
        savedChunks.push({ id: duplicateResult, title: chunk.title, fact: chunk.fact, description, category, isNew: false });
      }
    }
  } catch (err) {
    console.error('Fehler bei der Chunks-Verarbeitung:', err);
  }
  return savedChunks;
}

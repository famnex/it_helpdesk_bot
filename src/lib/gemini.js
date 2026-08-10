import db from './db.js';
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
export async function generateChatResponse(chatMessagesState, ticketAlreadyCreated = false, isAgentOnBehalf = false) {
  const { chatModel } = getModelNames();

  if (isAgentOnBehalf) {
    const systemInstruction = `Du bist ein hilfreicher IT-Assistent für Schul-Admins und Support-Agenten. Deine Aufgabe ist es, dem Agenten dabei zu helfen, ein Support-Ticket für einen anderen Benutzer (z. B. Lehrer oder Schüler) zu erstellen.
Deine Antworten müssen sehr kurz, sachlich und präzise sein. Du sprichst den Agenten per Du an.
Du musst strukturiert folgende Informationen abfragen und sammeln:
1. Für wen ist das Ticket? Name, E-Mail-Adresse und (falls bekannt) Telefonnummer des betroffenen Benutzers.
2. Problembeschreibung: Worum geht es konkret?
3. Bisherige Lösungsversuche: Was wurde bereits versucht?

Regeln für die Abfrage:
- Frage diese Punkte nacheinander kurz und präzise ab. Sende nie alle Fragen auf einmal!
- Biete KEINE Ratschläge, Diagnosen oder Fehlerbehebungen an, da der Agent selbst IT-Support leistet. Konzentriere dich rein auf das Sammeln der Informationen!
- Wenn der Agent dir eine Liste von Antworten oder alle Infos direkt gibt, akzeptiere das sofort.
- Sobald du alle 3 Punkte (Betroffener Benutzer mit Name/Mail, Problembeschreibung, bisherige Versuche) erfasst hast, gib ZWINGEND am Ende deiner Antwort exakt diesen Tag aus: [TICKET_CREATED]
- Stelle in der Nachricht mit [TICKET_CREATED] keine weiteren Fragen mehr.`;

    const payload = {
      contents: chatMessagesState.slice(-10).map(msg => {
        return {
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text || "" }]
        };
      }),
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    return callGemini(chatModel, payload);
  }
  
  // 1. Wissensdatenbank auslesen
  let knowledgeString = "";
  try {
    const chunks = db.prepare('SELECT id, title, description, fact FROM knowledge').all();
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

        const solutionContent = c.description || c.fact || '';
        knowledgeString += `- [ID: "${c.id}"] THEMA: "${c.title}" | LÖSUNG/ANLEITUNG: "${solutionContent}"${attachmentInfo}\n`;
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
WICHTIGSTE ANWEISUNG FÜR DIE WISSENSDATENBANK:
Wenn du Informationen aus der Wissensdatenbank nutzt, verweise NIEMALS nur faul auf den Namen oder Titel des Artikels (z. B. "Hast du die Schritte aus der Lösung 'Beamer-Signalquelle wechseln...' ausprobiert?"). Das ist strengstens untersagt!
Stattdessen musst du die konkreten Anweisungen, Lösungswege und Schritte aus dem Inhalt des Artikels immer direkt und verständlich selbst im Chat aufschreiben und erklären!

ERKENNUNG VORHANDENEN WISSENS (STRENGSTE PFLICHT):
Wann immer deine Antwort auf Informationen, Anweisungen oder Schritten aus einem oder mehreren Einträgen der obigen WISSENSDATENBANK basiert, MUSST du ZWINGEND am allerletzten Ende deiner Nachricht folgendes Tag ausgeben:
[USED_KNOWLEDGE: ID1, ID2, ...]
wobei ID1, ID2 etc. durch die exakten IDs aus den eckigen Klammern [ID: ...] der WISSENSDATENBANK-Einträge ersetzt werden müssen (z. B. [USED_KNOWLEDGE: wifi-chunk-1] oder [USED_KNOWLEDGE: chunk-123456]).
Gib dieses Tag NUR aus, wenn du wirklich konkretes Wissen aus der Liste für deine Antwort herangezogen hast.

ERKENNUNG VON MISSBRAUCH / BELEIDIGUNGEN / TROLLING:
Falls der Benutzer den Chat missbraucht (z.B. durch unhöfliches Verhalten, Beleidigungen, Drohungen, ununterbrochenes Schimpfen, Fäkalsprache oder absichtliches Ärgern/Trollen), musst du:
1. Professionell, extrem sachlich und distanziert reagieren.
2. Das Gespräch höflich aber bestimmt beenden (z. B. "Aufgrund unangemessener Ausdrucksweise beende ich dieses Gespräch an dieser Stelle.").
3. ZWINGEND am Ende deiner Antwort exakt diesen Tag mitsenden: [CHAT_ABUSE_DETECTED]

Falls der Benutzer ein unklares technisches Problem beschreibt (z. B. einen nicht funktionierenden Drucker, Bildschirmausfall oder eine Fehlermeldung), frage ihn freundlich, ob er das Problem genauer beschreiben oder ein Foto/Screenshot davon über die Büroklammer hochladen kann.

INTERNE REGELN – NIEMALS VERBALISIEREN (SEHR WICHTIG):
Du hast interne Entscheidungsregeln (z. B. wann du eine Raumnummer fragst, wann du ein Ticket erstellst, warum du etwas nicht fragst). Diese Regeln sind STRENG INTERN und dürfen dem Benutzer gegenüber NIEMALS erwähnt, erklärt oder verbalisiert werden!
Verbotene Beispiele (so etwas darfst du NIEMALS schreiben):
- "Da es sich um ein Softwareproblem handelt, benötige ich keine Raumnummer."
- "Laut meinen Regeln frage ich jetzt nach der Fehlermeldung."
- "Ich erstelle jetzt das Ticket, da alle Voraussetzungen erfüllt sind."
Handle einfach entsprechend – ohne Begründung, warum du etwas (nicht) fragst.`;
  
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
REGELN FÜR DIE ERSTELLUNG UND DAS ANBIETEN VON IT-SUPPORT-TICKETS:
1. FRÜHZEITIGES ANBIETEN EINES SUPPORT-TICKETS (SEHR WICHTIG):
   - Wenn ein von dir vorgeschlagener erster Lösungsschritt nicht zum Erfolg geführt hat und der Benutzer rückmeldet, dass es nicht funktioniert (z. B. "hat nicht geklappt", "geht immer noch nicht", "hilft nicht") oder das Thema weiter vertieft wird:
   - BIETE DEM BENUTZER SCHON ERSTELLUNGSEMPFEHLEND ODER FRÜHZEITIG DIE OPTION AN, EIN SUPPORT-TICKET FÜR DIE IT-ADMINISTRATOREN ZU ERSTELLEN!
   - Beispiel für eine freundliche Option: "Falls dieser Schritt nicht hilft oder du lieber direkt Unterstützung von unserem IT-Team möchtest, sag mir einfach Bescheid – ich kann sehr gerne ein Support-Ticket für dich anlegen."
   - BIETE ein Support-Ticket auch immer an, wenn der Benutzer explizit danach fragt oder einen menschlichen Support-Mitarbeiter verlangt.

2. ZWINGENDE VORAUSSETZUNGEN FÜR [TICKET_CREATED]:
   - Raumnummer: Frage NUR nach der Raumnummer, wenn es sich um ein physisches Gerät (z. B. Beamer, PC, Smartboard, Drucker, Monitor, Netzdose) oder ein lokales Netzwerkproblem handelt. Bei Software-, Login- oder Account-Problemen NIEMALS nach Raumnummer oder Aufenthaltsort fragen.
   - Fehlermeldung: Frage nach einer Fehlermeldung, ABER NUR wenn es plausibel ist, dass eine Fehlermeldung auf dem Bildschirm erscheinen könnte. Wenn aus dem Kontext bereits klar hervorgeht, dass es keine Bildschirm-Fehlermeldung geben kann (z. B. "ich bekomme keine E-Mail", "nichts passiert", "das Gerät geht nicht an", "die Seite lädt nicht"), dann gilt diese Voraussetzung als automatisch erfüllt – frage in diesem Fall NICHT nach einer Fehlermeldung!
   - ANTI-REDUNDANZ-PFLICHT (KRITISCH): Bevor du nach einer Information fragst, prüfe IMMER zuerst den gesamten bisherigen Chatverlauf! Wenn eine Pflichtinformation (Fehlermeldung, Raumnummer, Problembeschreibung) bereits im Verlauf genannt wurde oder aus dem Kontext eindeutig hervorgeht, darfst du NIEMALS erneut danach fragen. Nutze bereits vorhandene Informationen direkt.

3. ABSOLUTES VERBOT (SEHR WICHTIG):
   - Der Tag [TICKET_CREATED] ist der technische Auslöser, der das Ticket-Formular SOFORT auf dem Bildschirm des Benutzers öffnet.
   - Wenn deine aktuelle Nachricht eine Frage an den Benutzer enthält oder ein Fragezeichen (?) enthält, darfst du den Tag [TICKET_CREATED] unter KEINEN Umständen mitsenden!
   - Sende den Tag [TICKET_CREATED] erst dann, wenn der Benutzer der Ticket-Erstellung zugestimmt hat oder sie explizit wünscht, alle noch fehlenden Pflichtinformationen vorliegen und du eine reine Bestätigung ohne weitere Fragen ausgibst.
   - Stelle keine unnötigen oder redundanten Fragen. Halte den Dialog so kurz wie möglich.

4. SOFORTIGE ERSTELLUNG BEI EXPLIZITER ANFRAGE ODER ZUSTIMMUNG:
   - Wenn der Benutzer ein Support-Ticket wünscht oder deiner Option zur Ticket-Erstellung zustimmt:
     1. Schlage KEINE weiteren Lösungen aus der Wissensdatenbank vor und verliere dich nicht in weiteren Beratungsrunden!
     2. Prüfe sofort den bisherigen Verlauf: Welche Pflichtangaben (Fehlermeldung, ggf. Raumnummer bei Hardware) sind bereits bekannt oder aus dem Kontext eindeutig? Frage NUR nach dem, was weder im Verlauf steht noch aus dem Kontext klar ist.
     3. Sobald alle Pflichtangaben vorliegen, erstelle das Ticket SOFORT durch Ausgabe des Tags [TICKET_CREATED]!`;
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
        let relPath = msg.imageUrl.replace(/^\/helpdesk/, '');
        if (!relPath.startsWith('/')) relPath = '/' + relPath;
        const filePath = path.join(process.cwd(), 'public', relPath);
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
        } else {
          console.warn('Gemini Bild-Datei nicht auf Server-Festplatte gefunden:', filePath);
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

  const rawResultText = await callGemini(chatModel, payload);

  // Verwendetes Wissen extrahieren
  let usedKnowledgeIds = null;
  let cleanedResultText = rawResultText;
  const match = rawResultText.match(/\[USED_KNOWLEDGE:\s*([^\]]+)\]/i);
  if (match) {
    usedKnowledgeIds = match[1].split(',').map(id => id.trim()).filter(Boolean).join(',');
    cleanedResultText = rawResultText.replace(/\[USED_KNOWLEDGE:\s*[^\]]+\]/gi, '').trim();
  }

  return {
    text: cleanedResultText,
    usedKnowledgeIds
  };
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
 * Kategorisiert eine Bot-Konversation basierend auf den Chatnachrichten.
 * Orientiert sich an bestehenden Wissens-Kategorien oder liefert eine prägnante neue Kategorie.
 */
export async function categorizeChatCategory(chatMessages, existingCategories = []) {
  const { extractionModel } = getModelNames();
  
  const userMessages = (chatMessages || []).filter(m => m.sender === 'user');
  if (userMessages.length === 0) {
    return 'Sonstiges';
  }

  let chatText = "";
  chatMessages.slice(-10).forEach(m => {
    chatText += `${m.sender === 'user' ? 'Benutzer' : 'Support-Assistent'}: ${m.text}\n`;
  });

  const categoriesList = existingCategories.length > 0
    ? existingCategories.join(', ')
    : 'WLAN, Moodle, Schulportal, WebUntis, Hardware, Drucker, E-Mail, Benutzerkonto, Sonstiges';

  const prompt = `Analysiere die folgende Bot-Konversation und ordne sie genau EINER Thema-Kategorie zu.
Bevorzuge eine der folgenden vorhandenen Kategorien:
[${categoriesList}]

Falls keine davon passt, wähle ein kurzes sachliches Substantiv (1-2 Wörter), wie z. B. "Drucker", "WLAN", "Moodle", "Hardware", "Software", "Netzwerk", "E-Mail", "Passwort".

Antworte AUSSCHLIESSLICH mit dem reinen Kategorienamen (ohne Satzzeichen, ohne Anführungszeichen, ohne Markdown).

Chatverlauf:
${chatText}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  try {
    const rawCategory = await callGemini(extractionModel, payload);
    if (!rawCategory) return 'Sonstiges';
    const cleanCategory = rawCategory.trim().replace(/^["']|["']$/g, '').replace(/[.#]$/, '');
    return cleanCategory || 'Sonstiges';
  } catch (err) {
    console.error('Fehler bei categorizeChatCategory:', err);
    return 'Sonstiges';
  }
}

/**
 * Kategorisiert ein Bündel (Batch) von mehreren Bot-Konversationen in EINEM EINZIGEN KI-Aufruf.
 * @param {Array<{id: string, messages: Array<{sender: string, text: string}>}>} chatsBatch
 * @param {Array<string>} existingCategories
 * @returns {Promise<Record<string, string>>} Mapping von chatId -> category
 */
export async function categorizeChatBatch(chatsBatch, existingCategories = []) {
  if (!chatsBatch || chatsBatch.length === 0) return {};
  const { extractionModel } = getModelNames();

  const categoriesList = existingCategories.length > 0
    ? existingCategories.join(', ')
    : 'WLAN, Moodle, Schulportal, WebUntis, Hardware, Drucker, E-Mail, Benutzerkonto, Sonstiges';

  let batchPromptText = `Hier sind mehrere unabhängige Support-Chats. Ordne jeden Chat genau EINER Thema-Kategorie zu.
Bevorzuge nach Möglichkeit bestehende Kategorien aus folgender Liste:
[${categoriesList}]

Falls für einen Chat keine dieser Kategorien passt, erstelle eine neue kurze Kategorie (1-2 Wörter), wie z.B. "Drucker", "WLAN", "Moodle", "Hardware", "Software", "Netzwerk", "E-Mail", "Passwort".

Antworte AUSSCHLIESSLICH im folgenden gültigen JSON-Format (keine Erklärungen, kein Markdown-Codeblock):
{
  "CHAT_ID_1": "KategorieName",
  "CHAT_ID_2": "KategorieName"
}

Hier sind die Chats:\n`;

  chatsBatch.forEach(chat => {
    batchPromptText += `\n--- CHAT ID: "${chat.id}" ---\n`;
    if (!chat.messages || chat.messages.length === 0) {
      batchPromptText += `(Keine Nachrichten)\n`;
    } else {
      chat.messages.slice(-8).forEach(m => {
        batchPromptText += `${m.sender === 'user' ? 'Benutzer' : 'Bot'}: ${m.text}\n`;
      });
    }
  });

  const payload = {
    contents: [{ parts: [{ text: batchPromptText }] }],
    generationConfig: { responseMimeType: "application/json" }
  };

  try {
    const rawResponse = await callGemini(extractionModel, payload);
    const cleanJson = rawResponse.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    const mapping = JSON.parse(cleanJson);
    return mapping;
  } catch (err) {
    console.error('Fehler bei Batch-Kategorisierung mit Gemini:', err);
    const fallbackMapping = {};
    chatsBatch.forEach(c => { fallbackMapping[c.id] = 'Sonstiges'; });
    return fallbackMapping;
  }
}

/**
 * Ermittelt den am besten passenden Agenten für ein Ticket basierend auf seinen Zuständigkeiten.
 * Gibt die Agenten-ID oder null zurück (wenn keine oder mehrere passen).
 */
export async function determineAgentAssignment(ticketTitle, chatMessages, agents) {
  if (!agents || agents.length === 0) return null;
  const { extractionModel } = getModelNames();
  
  let chatText = "";
  if (chatMessages && chatMessages.length > 0) {
    chatMessages.slice(-10).forEach(m => {
      chatText += `${m.sender === 'user' ? 'Benutzer' : 'Support-Assistent'}: ${m.text}\n`;
    });
  }

  const prompt = `Du bist ein automatischer IT-Support-Ticket-Dispatcher.
Hier ist ein neu erstelltes Support-Ticket:
Titel: ${ticketTitle}
${chatText ? `Chat-Verlauf:\n${chatText}` : ''}

Hier ist eine Liste von verfügbaren Support-Mitarbeitern und deren Zuständigkeiten in Prosa:
${agents.map(ag => `- ID: "${ag.id}", Name: "${ag.name || ''}", E-Mail: "${ag.email}", Zuständigkeiten: "${ag.responsibilities}"`).join('\n')}

Deine Aufgabe ist es, das Ticket anhand des Titels und Gesprächsverlaufs genau einem Mitarbeiter zuzuordnen, dessen Zuständigkeiten am besten passen.
Regeln:
1. Antworte AUSSCHLIESSLICH mit der ID des passenden Mitarbeiters (z. B. "admin-123456").
2. Falls kein Mitarbeiter zu den Zuständigkeiten passt ODER falls es mehrere passende Mitarbeiter gibt (Mehrdeutigkeit/Konflikt), antworte mit exakt dem Wort: "NONE".
3. Gib keinerlei Erklärungen, Begründungen, Leerzeichen oder sonstige Zeichen aus. Nur die ID oder "NONE".`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1 }
  };

  try {
    const aiResponse = await callGemini(extractionModel, payload);
    const assignedId = aiResponse.trim();
    if (assignedId && assignedId !== 'NONE' && agents.some(ag => ag.id === assignedId)) {
      return assignedId;
    }
  } catch (err) {
    console.error('Fehler bei der automatischen Ticket-Zuweisung via Gemini:', err);
  }
  return null;
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
    const descContent = c.description || c.fact || '';
    existingList += `- ID: "${c.id}" | TITEL: "${c.title}" | INHALT: "${descContent}"\n`;
  });

  const newDesc = newChunk.description || newChunk.fact || '';
  const prompt = `Wir haben eine bestehende IT-Wissensdatenbank mit folgenden Einträgen:
${existingList}

Hier ist ein neuer Wissenschunk, der hinzugefügt werden soll:
TITEL: "${newChunk.title}"
INHALT: "${newDesc}"

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
    const existingChunks = db.prepare('SELECT id, title, description, fact FROM knowledge').all();
    
    const insertStmt = db.prepare('INSERT INTO knowledge (id, title, fact, description, category, source) VALUES (?, ?, ?, ?, ?, ?)');
    
    for (const chunk of chunks) {
      const description = chunk.description || chunk.fact;
      if (!chunk.title || !description) continue;
      
      const category = chunk.category || 'Sonstiges';
      const fact = description; // Fakt = Beschreibung
      
      // Duplikatsprüfung mit Gemini
      const duplicateResult = await checkDuplicate({ title: chunk.title, description, fact }, existingChunks);
      
      if (duplicateResult === 'NEIN') {
        const chunkId = `chunk-${Math.floor(100000 + Math.random() * 900000)}`;
        insertStmt.run(chunkId, chunk.title, fact, description, category, source);
        savedChunks.push({ id: chunkId, title: chunk.title, fact, description, category, isNew: true });
        // Das neu hinzugefügte Element für nachfolgende Iterationen in die Liste aufnehmen
        existingChunks.push({ id: chunkId, title: chunk.title, description, fact });
      } else {
        console.log(`Deduplizierung: Chunk "${chunk.title}" übersprungen. Duplikat von ID: ${duplicateResult}`);
        savedChunks.push({ id: duplicateResult, title: chunk.title, fact, description, category, isNew: false });
      }
    }
  } catch (err) {
    console.error('Fehler bei der Chunks-Verarbeitung:', err);
  }
  return savedChunks;
}

/**
 * Extrahiert Ticket-Details aus einem Chat-Verlauf auf behalf eines Agenten.
 */
export async function extractAgentBehalfDetails(chatMessages) {
  const { extractionModel } = getModelNames();
  
  let chatText = "";
  chatMessages.forEach(m => {
    chatText += `${m.sender === 'user' ? 'Agent' : 'IT-Assistent'}: ${m.text}\n`;
  });

  const prompt = `Analysiere den folgenden Chatverlauf zwischen einem IT-Support-Agenten und einem IT-Assistenten. 
Der Agent erstellt ein Ticket im Namen eines anderen betroffenen Benutzers.
Extrahiere folgende Informationen:
1. "name": Der Name des betroffenen Benutzers (nicht des Agenten!). Falls nicht genannt, null.
2. "email": Die E-Mail-Adresse des betroffenen Benutzers. Falls nicht genannt, null.
3. "phone": Die Telefonnummer des betroffenen Benutzers (falls genannt). Falls nicht genannt, null.
4. "title": Ein kurzer, prägnanter Betreff/Titel für das Ticket (maximal 5 Wörter, z. B. "Outlook Login-Fehler").
5. "description": Eine Beschreibung des IT-Problems des Benutzers.
6. "attempts": Bisherige Lösungsversuche, die unternommen wurden (falls genannt). Falls nicht genannt, null.

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt, das diese sechs Schlüssel enthält. Verwende keine Markdown-Formatierung um das JSON (kein \`\`\`json).

Chatverlauf:
${chatText}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };

  try {
    const responseText = await callGemini(extractionModel, payload);
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (err) {
    console.error('Fehler bei extractAgentBehalfDetails:', err);
    return {
      name: null,
      email: null,
      phone: null,
      title: 'Support-Anfrage im Namen eines Benutzers',
      description: '',
      attempts: null
    };
  }
}

/**
 * Erstellt eine kurze, prägnante Zusammenfassung (Problem & Kontext) aus dem Ticketverlauf.
 */
export async function generateSolutionContext(ticketHistoryText) {
  const { extractionModel } = getModelNames();
  const apiKey = getApiKey();
  if (!apiKey) {
    return 'Keine Gemini API-Key Konfiguration vorhanden.';
  }

  const prompt = `Analysiere den folgenden Ticket-Verlauf und erstelle eine prägnante Zusammenfassung (maximal 2-3 Sätze) des ursprünglichen IT-Problems und des Kontextes, bevor es gelöst wurde. Antworte in deutscher Sprache und komm direkt zum Punkt ohne Einleitung.

Ticket-Verlauf:
${ticketHistoryText}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  try {
    const responseText = await callGemini(extractionModel, payload);
    return responseText.trim();
  } catch (err) {
    console.error('Fehler bei generateSolutionContext:', err);
    return 'Kontext konnte nicht generiert werden.';
  }
}

/**
 * Analysiert einen Chatverlauf umfassend hinsichtlich Wissensnutzung, Wissenslücken und Feedback für die Prompt/Programm-Entwicklung.
 */
export async function analyzeChatQuality(chatId) {
  const { extractionModel } = getModelNames();
  
  // Chat & Nachrichten laden
  const chat = db.prepare('SELECT id, user_email as userEmail, user_name as userName, ticket_created as ticketCreated, is_abusive as isAbusive FROM chats WHERE id = ?').get(chatId);
  if (!chat) {
    throw new Error('Chat nicht gefunden.');
  }

  const messages = db.prepare('SELECT sender, text, base_knowledge as baseKnowledge, created_at as createdAt FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId);
  
  let chatText = "";
  let baseKnowledgeIds = new Set();
  messages.forEach(m => {
    chatText += `${m.sender === 'user' ? 'BENUTZER' : 'BOT'}: ${m.text}\n`;
    if (m.baseKnowledge) {
      m.baseKnowledge.split(',').forEach(id => baseKnowledgeIds.add(id.trim()));
    }
  });

  // Verfügbares / genutztes Wissen aus der Datenbank laden
  let usedKnowledgeText = "Verwendetes / Referenziertes Wissen in diesem Chat:\n";
  if (baseKnowledgeIds.size > 0) {
    const ids = Array.from(baseKnowledgeIds).filter(Boolean);
    const placeholders = ids.map(() => '?').join(',');
    try {
      const chunks = db.prepare(`SELECT id, title, fact FROM knowledge WHERE id IN (${placeholders})`).all(...ids);
      chunks.forEach(c => {
        usedKnowledgeText += `- [ID: ${c.id}] ${c.title}: ${c.fact}\n`;
      });
    } catch (e) {
      usedKnowledgeText += "(Konnte nicht aus der DB geladen werden)\n";
    }
  } else {
    usedKnowledgeText += "Kein spezifischer Wissenschunk vom Bot geflaggt.\n";
  }

  // Gesamte Wissensdatenbank übersichtsweise mitsenden (für Lücken-Analyse)
  let allKnowledgeOverview = "\nGesamte Wissensdatenbank im System:\n";
  try {
    const allChunks = db.prepare('SELECT id, title, fact FROM knowledge').all();
    allChunks.forEach(c => {
      allKnowledgeOverview += `- [ID: ${c.id}] ${c.title}: ${c.fact}\n`;
    });
  } catch (e) {
    allKnowledgeOverview += "(Keine Einträge oder Fehler beim Laden)\n";
  }

  const systemPromptsInfo = `
HERANGEZOGENER BOT-SYSTEMPROMPT (STANDARDS):
- Persönlichkeit: Freundlicher IT-Support-Chatbot für eine Schule, spricht den Nutzer per Du ("du", "dir") an.
- Wissensanweisung: Konkrete Anweisungen und Schritte aus dem Wissen auflisten, nicht nur faul auf den Artikel verweisen.
- Wissens-Tagging: Am Ende [USED_KNOWLEDGE: ID1, ID2, ...] anfügen.
- Missbrauchs-Tagging: Bei Beleidigungen höflich beenden und [CHAT_ABUSE_DETECTED] mitsenden.
- Ticket-Erstellungsregeln: Ticket nur bei Fehlgeschlagen/Ablehnung/Expliziter Anforderung anbieten. Zwingend Raumnummer (bei Hardware vor Ort) & Fehlermeldung erfassen, danach [TICKET_CREATED] mitsenden ohne Fragezeichen.
`;

  const prompt = `Analysiere den folgenden Chatverlauf zwischen einem Benutzer und dem IT-Support-Chatbot sehr gründlich.

SYSTEM-PROMPT UND REGELN DES BOTS:
${systemPromptsInfo}

${usedKnowledgeText}
${allKnowledgeOverview}

CHATVERLAUF ZUR ANALYSE:
${chatText}

AUFTRAG DER ANALYSE:
Gib das Ergebnis ZWINGEND als valides JSON-Objekt aus (nutze keine Markdown \`\`\`json ... \`\`\` Formatierung):

{
  "report": "Vollständiger strukturierter Analysebericht als Markdown-Text mit folgenden Abschnitten:\\n### 1. Bewertung der Wissensnutzung & Wissenslücken\\na) ...\\nb) ...\\n\\n### 2. Feedback für Entwickler (Prompts & KI-Programmierung)\\na) ...\\nb) ...",
  "suggestedKnowledge": {
    "title": "Kurzer prägnanter Titel für das fehlende Wissen (z.B. Untis Stundenplan Passwort-Reset)",
    "category": "Passende Kategorie (z.B. Software, WLAN, Hardware, Drucker)",
    "description": "Ausführliche Schritt-für-Schritt Lösung oder Anleitung im Markdown-Format, die direkt in die Wissensdatenbank übernommen werden kann."
  }
}

Hinweis: Falls kein neues Wissen gefehlt hat, setze "suggestedKnowledge": null.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const responseText = await callGemini(extractionModel, payload);
  try {
    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleaned);
    return {
      report: data.report || responseText,
      suggestedKnowledge: data.suggestedKnowledge || null
    };
  } catch (err) {
    return {
      report: responseText,
      suggestedKnowledge: null
    };
  }
}


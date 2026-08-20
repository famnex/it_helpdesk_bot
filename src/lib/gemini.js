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
Für diesen Chat wurde bereits erfolgreich ein Support-Ticket für die IT-Admins erstellt und an das IT-Support-Team übergeben!
1. Biete dem Benutzer unter KEINEN Umständen eine weitere Ticket-Erstellung an!
2. Schreibe NIEMALS den Tag [TICKET_CREATED] in deine Antwort!
3. Behaupte NIEMALS, dass der Chat oder das Support-Ticket geschlossen wurde. Das Ticket ist AKTIV und wird von einem menschlichen IT-Support-Mitarbeiter bearbeitet.
4. Der Benutzer kann jederzeit weitere Informationen, Updates oder Fotos direkt über diesen Chat senden, welche an das Ticket weitergeleitet werden.`;
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
 * Granulare, standardisierte IT-Kategorien im Schulkontext
 */
export const CANONICAL_CATEGORIES = [
  'Schulportal',
  'Moodle',
  'WebUntis',
  'E-Mail',
  'Passwörter',
  'Benutzerkonten',
  'WLAN',
  'Netzwerk',
  'Smartboards',
  'Beamer',
  'Dokumentenkameras',
  'Stationäre Computer',
  'Laptops & Tablets',
  'Drucker',
  'Kopierer',
  'Office 365',
  'Software',
  'Raumbuchung',
  'Sonstige Hardware',
  'Sonstiges'
];

/**
 * Regelbasierte Erkennung von Kernbegriffen zur Absicherung und Verfeinerung
 */
export function matchRuleBasedCategory(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 1. Schul-Plattformen
  if (/\b(schulportal|sph|schulportal[\s-]?hessen|lanis|mein[\s-]?unterricht)\b/i.test(lower)) return 'Schulportal';
  if (/\b(moodle|lernplattform)\b/i.test(lower)) return 'Moodle';
  if (/\b(webuntis|untis|stundenplan|vertretungsplan|klassenbuch)\b/i.test(lower)) return 'WebUntis';

  // 2. Mail & Konten
  if (/\b(outlook|e-mail|email|postfach|webmail|thunderbird|imap|smtp|dienstmail|mailadresse)\b/i.test(lower)) return 'E-Mail';
  if (/\b(passwort|kennwort|passwörter|passwort-reset|passwort[\s-]?vergessen)\b/i.test(lower)) return 'Passwörter';
  if (/\b(benutzerkonto|benutzerdaten|erstanmeldung|kontosperre|lusd|schülerkonto|account[\s-]?anlage|benutzername)\b/i.test(lower)) return 'Benutzerkonten';

  // 3. Raumbuchung & Ressourcen
  if (/\b(raumbuchung|raumreservierung|raumbelegung|fachraum|medienwagen|computerausleihe)\b/i.test(lower) || 
      (/\b(buchen|reservieren|ausleihen)\b/i.test(lower) && /\b(raum|fachraum|computerraum|wagen)\b/i.test(lower))) {
    return 'Raumbuchung';
  }

  // 4. Office 365 & Spezifische Software (vor generischen Hardware-Wörtern wie "Rechner/PC")
  if (/\b(office[\s-]?365|ms[\s-]?office|word|excel|powerpoint|teams|onedrive|m365)\b/i.test(lower)) return 'Office 365';
  if (/\b(snv|snvconsole|schulnetzverwalter|browser|pdf-reader|vlc|fachsoftware)\b/i.test(lower)) return 'Software';

  // 5. Druck & Kopie
  if (/\b(drucker|drucken|druckauftrag|kyocera|follow-me|netzwerkdrucker)\b/i.test(lower)) return 'Drucker';
  if (/\b(kopierer|großkopierer|kopieren|scan-to-mail|kopierkarte)\b/i.test(lower)) return 'Kopierer';

  // 6. Konnektivität
  if (/\b(wlan|wifi|wi-fi|eduroam|wlan-zertifikat)\b/i.test(lower)) return 'WLAN';
  if (/\b(netzwerk|internet|netzlaufwerk|lan-kabel|netzwerkdose|vpn|serververbindung)\b/i.test(lower)) return 'Netzwerk';

  // 7. Spezifische Präsentations- & Medientechnik
  if (/\b(smartboard|smartboards|interaktives[\s-]?display|touchdisplay)\b/i.test(lower)) return 'Smartboards';
  if (/\b(beamer|projektor|deckenbeamer|leinwand)\b/i.test(lower)) return 'Beamer';
  if (/\b(dokumentenkamera|dokumentenkameras|elmo|visualizer)\b/i.test(lower)) return 'Dokumentenkameras';

  // 8. Mobile & Stationäre Computer
  if (/\b(laptop|laptops|notebook|ipad|ipads|tablet|tablets)\b/i.test(lower)) return 'Laptops & Tablets';
  if (/\b(lehrer-pc|schüler-pc|computerecke|pc|computer|stationärer[\s-]?computer|rechner|tower|desktop-pc)\b/i.test(lower)) return 'Stationäre Computer';

  // 9. Allgemeine Software
  if (/\b(software|programm|app|windows)\b/i.test(lower)) return 'Software';

  // 10. Sonstige Hardware
  if (/\b(hdmi|kabel|adapter|vga|usb|lautsprecher|ton|audiokabel|maus|tastatur|headset|flackert|kein bild)\b/i.test(lower)) return 'Sonstige Hardware';

  return null;
}

/**
 * Kategorisiert eine Bot-Konversation automatisch in eine der spezifischen Schul-IT-Kategorien.
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

  // Direkte Regel-Prüfung für eindeutige Fachbegriffe
  const directRuleMatch = matchRuleBasedCategory(chatText);

  const mergedCategories = Array.from(new Set([...CANONICAL_CATEGORIES, ...existingCategories]));

  const prompt = `Du bist ein hochpräziser IT-Helpdesk-Klassifikator für den Schulbereich.
Analysiere die folgende Bot-Konversation und ordne sie genau EINER spezifischen Kategorie zu.

Verfügbare Kategorien (wähle genau eine):
- "Schulportal": Schulportal Hessen (SPH), Einwahlen, Module, Mein Unterricht, Pädagogische Organisation.
- "Moodle": Moodle-Lernplattform, Kurse, Aufgaben, Testabgaben.
- "WebUntis": Digitaler Stundenplan, Vertretungsplan, Klassenbuch, Untis-App.
- "E-Mail": Schul-E-Mail-Postfächer, Outlook, Webmail, Thunderbird, IMAP, SMTP, Dienstmail.
- "Passwörter": Passwort vergessen, Kennwort zurücksetzen, Login-Passwort ändern.
- "Benutzerkonten": Account-Erstellung, Benutzerdaten, Kontosperre, LUSD, Benutzername.
- "WLAN": Schul-WLAN (Campus-WiFi, eduroam), WLAN-Zertifikate, WLAN-Verbindungsprobleme.
- "Netzwerk": LAN-Kabel, Netzwerkdosen, Netzlaufwerke (H:, L:, M:), VPN, Serverzugriff.
- "Smartboards": Smartboards, interaktive Touchdisplays, Board-Software.
- "Beamer": Deckenbeamer, Projektoren, Projektionsleinwand.
- "Dokumentenkameras": Dokumentenkameras, Elmo, Visualizer.
- "Stationäre Computer": Lehrer-PC, Schüler-PCs in Computerräumen, PC-Tower, Monitor, Tastatur/Maus.
- "Laptops & Tablets": Schul-Laptops, iPads, Tablets, mobile Geräte.
- "Drucker": Netzwerkdrucker, Druckertreiber, Kyocera, Follow-Me, Druckprobleme.
- "Kopierer": Großkopierer, Kopieren, Scan-to-Mail, Kopierkarten, Toner.
- "Office 365": MS Office (Word, Excel, PowerPoint), Teams, OneDrive, Microsoft 365 Lizenzen.
- "Software": Schulnetzverwalter (snvConsole), PDF-Reader, Browser, Windows-System, Fachprogramme.
- "Raumbuchung": Reservierung von Fachräumen (z. B. Computerräume), Medienwagen, Raumbelegung.
- "Sonstige Hardware": Adapter, HDMI/VGA-Kabel, USB-Hubs, Lautsprecher/Ton.
- "Sonstiges": Nur wenn es in keines der oberen Themen passt.

Regeln:
1. Antworte AUSSCHLIESSLICH mit dem reinen Kategorienamen aus der Liste oben.
2. Keine Erklärungen, keine Satzzeichen, kein Markdown.

Chatverlauf:
${chatText}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1 }
  };

  try {
    const rawCategory = await callGemini(extractionModel, payload);
    if (!rawCategory) return directRuleMatch || 'Sonstiges';
    let cleanCategory = rawCategory.trim().replace(/^["'`]|["'`]$/g, '').replace(/[.#]$/, '');
    
    if ((!cleanCategory || cleanCategory.toLowerCase() === 'sonstiges') && directRuleMatch) {
      return directRuleMatch;
    }

    const matched = mergedCategories.find(c => c.toLowerCase() === cleanCategory.toLowerCase());
    return matched || cleanCategory || directRuleMatch || 'Sonstiges';
  } catch (err) {
    console.error('Fehler bei categorizeChatCategory:', err);
    return directRuleMatch || 'Sonstiges';
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

  const mergedCategories = Array.from(new Set([...CANONICAL_CATEGORIES, ...existingCategories]));

  let batchPromptText = `Du bist ein hochpräziser IT-Helpdesk-Klassifikator für den Schulbereich.
Hier sind mehrere unabhängige Support-Chats. Ordne jeden Chat genau EINER der folgenden Kategorien zu:
[Schulportal, Moodle, WebUntis, E-Mail, Passwörter, Benutzerkonten, WLAN, Netzwerk, Smartboards, Beamer, Dokumentenkameras, Stationäre Computer, Laptops & Tablets, Drucker, Kopierer, Office 365, Software, Raumbuchung, Sonstige Hardware, Sonstiges]

Antworte AUSSCHLIESSLICH im folgenden gültigen JSON-Format:
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
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  };

  try {
    const rawResponse = await callGemini(extractionModel, payload);
    const cleanJson = rawResponse.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    const mapping = JSON.parse(cleanJson);
    
    // Bereinige und standardisiere Kategorien
    const normalized = {};
    for (const chat of chatsBatch) {
      const cId = chat.id;
      const cat = mapping[cId];
      const chatAllText = (chat.messages || []).map(m => m.text).join(' ');
      const ruleMatch = matchRuleBasedCategory(chatAllText);

      const cleanCat = cat ? String(cat).trim().replace(/^["'`]|["'`]$/g, '').replace(/[.#]$/, '') : '';
      const matched = mergedCategories.find(c => c.toLowerCase() === cleanCat.toLowerCase());

      if ((!matched || matched.toLowerCase() === 'sonstiges') && ruleMatch) {
        normalized[cId] = ruleMatch;
      } else {
        normalized[cId] = matched || cleanCat || ruleMatch || 'Sonstiges';
      }
    }
    return normalized;
  } catch (err) {
    console.error('Fehler bei Batch-Kategorisierung mit Gemini:', err);
    const fallbackMapping = {};
    chatsBatch.forEach(c => {
      const chatAllText = (c.messages || []).map(m => m.text).join(' ');
      fallbackMapping[c.id] = matchRuleBasedCategory(chatAllText) || 'Sonstiges';
    });
    return fallbackMapping;
  }
}

/**
 * Ermittelt den am besten passenden Agenten für ein Ticket basierend auf seinen Zuständigkeiten.
 * Gibt die Agenten-ID oder null zurück (wenn keine oder mehrere passen).
 */
export async function determineAgentAssignment(ticketTitle, chatMessages, agents) {
  if (!agents || agents.length === 0) return null;
  
  let chatText = "";
  if (chatMessages && chatMessages.length > 0) {
    chatMessages.slice(-10).forEach(m => {
      chatText += `${m.sender === 'user' ? 'Benutzer' : 'Support-Assistent'}: ${m.text}\n`;
    });
  }

  // 1. KI-Zuweisung via Gemini versuchen
  try {
    const { extractionModel } = getModelNames();
    const prompt = `Du bist ein automatischer IT-Support-Ticket-Dispatcher.
Hier ist ein neu erstelltes Support-Ticket:
Titel: ${ticketTitle}
${chatText ? `Chat-Verlauf:\n${chatText}` : ''}

Hier ist eine Liste von verfügbaren Support-Mitarbeitern und deren Zuständigkeiten in Prosa:
${agents.map(ag => `- ID: "${ag.id}", Name: "${ag.name || ''}", E-Mail: "${ag.email}", Zuständigkeiten: "${ag.responsibilities}"`).join('\n')}

Deine Aufgabe ist es, das Ticket anhand des Titels und Gesprächsverlaufs genau einem Mitarbeiter zuzuordnen, dessen Zuständigkeiten am besten passen.
Regeln:
1. Antworte AUSSCHLIESSLICH mit der ID des passenden Mitarbeiters (z. B. ${agents[0]?.id || 'agent-1'}).
2. Falls kein Mitarbeiter zu den Zuständigkeiten passt, antworte mit: NONE.
3. Gib keinen Markdown-Codeblock, keine Anführungszeichen und keine Erklärungen aus. Nur die ID oder NONE.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    };

    const aiResponse = await callGemini(extractionModel, payload);
    if (aiResponse) {
      let cleanResponse = aiResponse.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      cleanResponse = cleanResponse.replace(/^["'`]|["'`]$/g, '').trim();

      // Exakter Abgleich (Case-insensitive)
      const exactMatch = agents.find(ag => ag.id.toLowerCase() === cleanResponse.toLowerCase());
      if (exactMatch) return exactMatch.id;

      // Regex / Teil-Abgleich (falls Gemini z.B. "ID: agent-1" oder "Mitarbeiter: agent-1" schreibt)
      if (cleanResponse !== 'NONE') {
        for (const ag of agents) {
          const regex = new RegExp(`\\b${ag.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (regex.test(cleanResponse)) {
            return ag.id;
          }
        }
      }
    }
  } catch (err) {
    console.error('Fehler bei der automatischen Ticket-Zuweisung via Gemini:', err);
  }

  // 2. Intelligenter Keyword- & Semantik-Fallback (garantierte Zuordnung selbst bei API-Limits / Modell-Timeouts)
  const fullText = `${ticketTitle} ${chatText}`.toLowerCase();
  let bestScore = 0;
  let bestAgent = null;

  for (const ag of agents) {
    if (!ag.responsibilities) continue;
    const terms = ag.responsibilities
      .toLowerCase()
      .split(/[,;\n/|]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 3);

    let score = 0;
    for (const term of terms) {
      if (fullText.includes(term)) {
        score += 2; // Direkter Phrasen-Treffer
      } else {
        // Einzelwort-Treffer
        const words = term.split(/\s+/).filter(w => w.length >= 3);
        for (const w of words) {
          if (fullText.includes(w)) {
            score += 1;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestAgent = ag;
    }
  }

  if (bestScore > 0 && bestAgent) {
    return bestAgent.id;
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
  let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
  
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    return {
      report: responseText,
      suggestedKnowledge: null
    };
  }
}

/**
 * Prüft, ob eine neue Nutzeranfrage zu einem bereits bestehenden, offenen Chat/Ticket desselben Nutzers passt.
 */
export async function detectDuplicateTopic(newQuery, candidateChats) {
  if (!newQuery || !candidateChats || candidateChats.length === 0) {
    return { isDuplicate: false, similarityScore: 0 };
  }

  const newQueryLower = (newQuery || '').toLowerCase();

  // Themenbereiche für garantierten Pre-Pass Check
  const topicGroups = [
    { name: 'Anmeldung & Passwort', keywords: ['anmelden', 'anmeldung', 'passwort', 'login', 'zugang', 'account', 'benutzerkonto', 'gesperrt', 'einloggen'] },
    { name: 'WLAN & Netzwerk', keywords: ['wlan', 'wifi', 'netzwerk', 'internet', 'verbindung', 'ip'] },
    { name: 'Moodle & Schulportal', keywords: ['moodle', 'schulportal', 'sph', 'sph-app', 'kurs'] },
    { name: 'E-Mail & Office', keywords: ['email', 'e-mail', 'outlook', 'office', 'teams', '365', 'postfach'] },
    { name: 'Drucker & Hardware', keywords: ['drucker', 'drucken', 'papier', 'toner', 'pc', 'laptop', 'ipad', 'smartboard'] }
  ];

  const cleanTopicName = (t, fallback) => {
    if (!t) return fallback;
    const str = t.trim();
    if (!str || ['anfrage', 'unbekannt', 'sonstiges', 'support-anfrage', 'anfrage über chat-assistent'].includes(str.toLowerCase())) {
      return fallback;
    }
    return str;
  };

  // Pre-Pass: Falls neue Anfrage und ein bestehender Chat in dasselbe Themenfeld fallen
  for (const group of topicGroups) {
    const isNewInGroup = group.keywords.some(kw => newQueryLower.includes(kw));
    if (isNewInGroup) {
      const matchedCandidate = candidateChats.find(c => {
        const snipLower = (c.snippet || '').toLowerCase();
        const titleLower = (c.title || '').toLowerCase();
        const catLower = (c.category || '').toLowerCase();
        return group.keywords.some(kw => snipLower.includes(kw) || titleLower.includes(kw) || catLower.includes(kw));
      });

      if (matchedCandidate) {
        // Bevorzuge den konkreten Titel oder Snippet-Text statt des generischen Gruppennamens
        let concreteTopic = matchedCandidate.title;
        if (!concreteTopic || concreteTopic.toLowerCase().includes('support') || concreteTopic.toLowerCase() === group.name.toLowerCase()) {
          concreteTopic = matchedCandidate.snippet ? (matchedCandidate.snippet.length > 45 ? matchedCandidate.snippet.slice(0, 42) + '...' : matchedCandidate.snippet) : group.name;
        }
        const bestTopic = cleanTopicName(concreteTopic, group.name);
        return {
          isDuplicate: true,
          similarityScore: 0.90,
          matchedChatId: matchedCandidate.id,
          matchedTopic: bestTopic,
          reason: `Direkte Themengleichheit im Bereich ${group.name}`
        };
      }
    }
  }

  const { extractionModel } = getModelNames();

  const chatsOverview = candidateChats.map(c => 
    `- Chat-ID: ${c.id}${c.ticketId ? ` (Ticket: #${c.ticketId})` : ''} | Erstellt am: ${c.createdAt} | Konkreter Titel/Anliegen: "${cleanTopicName(c.title, c.snippet || c.category || 'Unbekannt')}" | Auszug/Erste Nachricht: "${c.snippet || ''}"`
  ).join('\n');

  const prompt = `Du bist ein hochentwickelter KI-Analyst für ein IT-Helpdesk-System.
Analysiere die neue Anfrage eines Benutzers und beurteile mittels einer tiefen semantischen Analyse die Wahrscheinlichkeit (similarityScore von 0.00 bis 1.00), ob die Anfrage dasselbe Anliegen oder dasselbe Themenfeld betrifft wie eine seiner früheren Konversationen.

NEUE ANFRAGE DES BENUTZERS:
"${newQuery}"

FRÜHERE KONVERSATIONEN DES BENUTZERS:
${chatsOverview}

REGELN FÜR DIE WAHRSCHEINLICHKEITS-BERECHNUNG (similarityScore):
- 0.85 - 1.00: Nahezu identisch oder direkte Konkretisierung (z. B. "Ich kann mich nicht anmelden" vs. "Ich habe Probleme mit meinem Passwort" -> beides betrifft Zugangsdaten/Login; "WLAN geht nicht" vs. "Drucker im WLAN offline").
- 0.50 - 0.84: Stark verwandter IT-Bereich für denselben Nutzer.
- 0.00 - 0.49: Komplett unterschiedliche Themen ohne erkennbaren Zusammenhang.
- 0.00 - 0.49: Komplett unterschiedliche Themen ohne erkennbaren Zusammenhang.

AUFTRAG:
Bestimme für die am besten passende frühere Konversation den similarityScore und das konkrete Thema als prägnante Substantivgruppe / Nominalphrase (z. B. "Passwort-Rücksetzung Schul-PC", "WLAN-Verbindung im Raum 204", "Drucker druckt nicht", "Moodle-Kurs Freischaltung").
WICHTIGE REGEL: Verwende NIEMALS generische Sammelkategorien wie "Benutzerkonten & Passwörter" oder "Hardware", sondern benenne den konkreten Fall des Benutzers!
Antworte ZWINGEND als valides JSON-Objekt ohne Markdown-Codeblock:
{
  "similarityScore": 0.85,
  "matchedChatId": "die Chat-ID mit dem höchsten Score (oder null falls alle Scores < 0.45)",
  "matchedTopic": "Konkrete präzise Bezeichnung des Themas (z.B. Passwort vergessen für Schüler-PC)",
  "reason": "Kurzer Satz zur Begründung der Wahrscheinlichkeit"
}`;

  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    };
    const responseText = await callGemini(extractionModel, payload);
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJson);

    const score = typeof result.similarityScore === 'number' ? result.similarityScore : 0;
    const isDuplicate = score >= 0.45 && Boolean(result.matchedChatId);
    const matchedItem = candidateChats.find(c => c.id === result.matchedChatId);
    const fallbackTopic = matchedItem ? cleanTopicName(matchedItem.title, matchedItem.snippet ? (matchedItem.snippet.slice(0, 45)) : 'Support-Thema') : 'Support-Thema';
    const finalTopic = cleanTopicName(result.matchedTopic, fallbackTopic);

    return {
      isDuplicate,
      similarityScore: score,
      matchedChatId: isDuplicate ? result.matchedChatId : null,
      matchedTopic: finalTopic,
      reason: result.reason || ''
    };
  } catch (e) {
    console.error('Fehler bei KI-Semantik-Analyse detectDuplicateTopic:', e);
    return { isDuplicate: false, similarityScore: 0 };
  }
}

/**
 * Prüft, ob der Nutzer in einer Nachricht mitteilt, dass sich sein Problem erledigt hat,
 * das Ticket zurückgenommen/storniert werden soll oder geschlossen werden kann.
 */
export async function checkSelfResolutionIntent(userMessage) {
  if (!userMessage || userMessage.trim().length < 2) {
    return { isResolved: false };
  }

  const textLower = userMessage.toLowerCase().trim();

  // Schneller Regex-/Phrasen-Check vor KI-Aufruf für eindeutige Absichten
  const clearPhrases = [
    'hat sich erledigt', 'hat sich schon erledigt', 'hat sich von selbst erledigt', 'hat sich gelöst',
    'geht wieder', 'funktioniert wieder', 'klappt wieder', 'läuft wieder',
    'habe es gelöst', 'habs gelöst', 'problem gelöst', 'problem behoben',
    'ticket schließen', 'ticket bitte schließen', 'bitte ticket schließen', 'schließe das ticket',
    'kann geschlossen werden', 'kannst du das ticket schließen', 'bitte schließen', 'schließen bitte',
    'nimm das ticket bitte zurück', 'nimm das ticket zurück', 'ticket zurücknehmen', 'ticket bitte zurücknehmen',
    'ticket zurückziehen', 'ticket bitte zurück', 'ticket zurück',
    'ticket stornieren', 'ticket bitte stornieren', 'storniere das ticket', 'stornieren bitte', 'bitte stornieren',
    'ticket abbrechen', 'bitte ticket abbrechen', 'ticket löschen', 'bitte ticket löschen',
    'danke geht wieder', 'erledigt danke', 'danke erledigt', 'ist erledigt', 'alles erledigt', 'bereits erledigt',
    'brauche keine hilfe mehr', 'brauche kein ticket mehr', 'kein ticket mehr nötig', 'nicht mehr nötig',
    'hat sich erübrigt', 'ist nicht mehr nötig', 'ist nicht mehr erforderlich'
  ];

  if (clearPhrases.some(phrase => textLower.includes(phrase))) {
    return { isResolved: true, confidence: 'high' };
  }

  // Regex-Muster für flexible Formulierungen (z. B. "nimm ... ticket ... zurück", "ticket ... nicht mehr ... nötig")
  const regexPatterns = [
    /nimm.*ticket.*zurück/i,
    /ticket.*(zurücknehmen|stornieren|abbrechen|schließen|löschen)/i,
    /(problem|anliegen|sache).*(erledigt|gelöst|behoben)/i,
    /(brauche|benötige).*(kein ticket|keine hilfe|nicht mehr)/i
  ];

  if (regexPatterns.some(pattern => pattern.test(textLower))) {
    return { isResolved: true, confidence: 'high' };
  }

  const { extractionModel } = getModelNames();

  const prompt = `Analysiere, ob der Benutzer in der folgenden Nachricht mitteilt, dass sich sein IT-Problem erledigt hat, gelöst wurde, er keine Hilfe mehr benötigt oder das Support-Ticket storniert, zurückgenommen oder geschlossen werden soll:

NACHRICHT DES BENUTZERS:
"${userMessage}"

Antworte ZWINGEND als JSON-Objekt ohne Markdown:
{
  "isResolved": true oder false,
  "confidence": "high", "medium" oder "low"
}`;

  try {
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const responseText = await callGemini(extractionModel, payload);
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJson);
    return {
      isResolved: Boolean(result.isResolved && result.confidence !== 'low'),
      confidence: result.confidence || 'medium'
    };
  } catch (e) {
    console.error('Fehler bei checkSelfResolutionIntent:', e);
    return { isResolved: false };
  }
}


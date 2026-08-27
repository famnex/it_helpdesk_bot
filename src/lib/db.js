import Database from 'better-sqlite3';
import path from 'path';

// Datenbank-Datei im Hauptverzeichnis des Projekts platzieren
const dbPath = path.resolve(process.cwd(), 'database.db');
const db = new Database(dbPath);

// Sicherstellen, dass Foreign Keys aktiviert sind
db.pragma('foreign_keys = ON');

// Tabellen initialisieren
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'agent', 'admin')),
      name TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'assigned', 'closed')) DEFAULT 'open',
      creator_email TEXT NOT NULL,
      assigned_agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      solution TEXT,
      chat_id TEXT REFERENCES chats(id) ON DELETE SET NULL,
      is_authenticated_creator BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sender_email TEXT NOT NULL,
      sender_role TEXT NOT NULL CHECK(sender_role IN ('customer', 'agent', 'admin', 'system', 'bot')),
      text TEXT NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT 0,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_email TEXT,
      ticket_created BOOLEAN DEFAULT 0,
      is_agent_on_behalf BOOLEAN DEFAULT 0,
      user_name TEXT,
      is_abusive BOOLEAN DEFAULT 0,
      abusive_flagged_at DATETIME,
      user_ip TEXT,
      user_session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender TEXT NOT NULL CHECK(sender IN ('user', 'bot')),
      text TEXT NOT NULL,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS knowledge (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      fact TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      is_private BOOLEAN NOT NULL DEFAULT 0,
      source TEXT NOT NULL CHECK(source IN ('manual', 'ticket', 'file', 'url')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS knowledge_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      knowledge_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ip_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      session_id TEXT,
      user_email TEXT,
      warning_count INTEGER DEFAULT 1,
      banned_until DATETIME,
      reason TEXT,
      last_violation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proxycheck_cache (
      ip TEXT PRIMARY KEY,
      is_proxy INTEGER DEFAULT 0,
      proxy_type TEXT,
      risk_score INTEGER DEFAULT 0,
      country TEXT,
      isocode TEXT,
      provider TEXT,
      raw_response TEXT,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
  );
`);

// Migration für bestehende Datenbanken: Spalten hinzufügen, falls nicht vorhanden
try {
  // Tabelle ip_bans nachträglich anlegen, falls sie noch nicht existiert
  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        session_id TEXT,
        user_email TEXT,
        warning_count INTEGER DEFAULT 1,
        banned_until DATETIME,
        reason TEXT,
        last_violation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ip_bans_ip ON ip_bans(ip);
    CREATE INDEX IF NOT EXISTS idx_ip_bans_banned_until ON ip_bans(banned_until);

    CREATE TABLE IF NOT EXISTS proxycheck_cache (
        ip TEXT PRIMARY KEY,
        is_proxy INTEGER DEFAULT 0,
        proxy_type TEXT,
        risk_score INTEGER DEFAULT 0,
        country TEXT,
        isocode TEXT,
        provider TEXT,
        raw_response TEXT,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_proxycheck_cache_expires ON proxycheck_cache(expires_at);
  `);

  // Tabelle knowledge_attachments nachträglich anlegen, falls sie noch nicht existiert
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        knowledge_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: ticket_messages Tabelle aktualisieren, falls der Check-Constraint noch kein 'bot' enthält
  const ticketMessagesSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='ticket_messages'").get()?.sql || '';
  if (ticketMessagesSql && !ticketMessagesSql.includes("'bot'")) {
    console.log("Migration: Aktualisiere ticket_messages Tabelle, um 'bot' als Rolle zu erlauben...");
    
    // Foreign Keys temporär deaktivieren
    db.pragma('foreign_keys = OFF');
    
    db.transaction(() => {
      // 1. Bestehende Tabelle umbenennen
      db.exec("ALTER TABLE ticket_messages RENAME TO ticket_messages_old;");
      
      // 2. Neue Tabelle mit aktualisiertem Check-Constraint erstellen
      db.exec(`
        CREATE TABLE ticket_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            sender_email TEXT NOT NULL,
            sender_role TEXT NOT NULL CHECK(sender_role IN ('customer', 'agent', 'admin', 'system', 'bot')),
            text TEXT NOT NULL,
            is_internal BOOLEAN NOT NULL DEFAULT 0,
            image_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // 3. Daten kopieren
      const oldCols = db.prepare("PRAGMA table_info(ticket_messages_old)").all();
      const hasImg = oldCols.some(c => c.name === 'image_url');
      if (hasImg) {
        db.exec(`
          INSERT INTO ticket_messages (id, ticket_id, sender_email, sender_role, text, is_internal, image_url, created_at)
          SELECT id, ticket_id, sender_email, sender_role, text, is_internal, image_url, created_at FROM ticket_messages_old;
        `);
      } else {
        db.exec(`
          INSERT INTO ticket_messages (id, ticket_id, sender_email, sender_role, text, is_internal, created_at)
          SELECT id, ticket_id, sender_email, sender_role, text, is_internal, created_at FROM ticket_messages_old;
        `);
      }
      
      // 4. Alte Tabelle löschen
      db.exec("DROP TABLE ticket_messages_old;");
    })();
    
    // Foreign Keys wieder aktivieren
    db.pragma('foreign_keys = ON');
    console.log("Migration: ticket_messages Tabelle erfolgreich aktualisiert (mit 'bot' und 'image_url').");
  }

  const tableInfoTicketMessages = db.prepare("PRAGMA table_info(ticket_messages)").all();
  const hasImageUrlTM = tableInfoTicketMessages.some(col => col.name === 'image_url');
  if (!hasImageUrlTM) {
    db.exec("ALTER TABLE ticket_messages ADD COLUMN image_url TEXT;");
    console.log("Migration: Spalte 'image_url' zur Tabelle 'ticket_messages' hinzugefügt.");
  }
  const tableInfoChats = db.prepare("PRAGMA table_info(chats)").all();
  const hasTicketCreated = tableInfoChats.some(col => col.name === 'ticket_created');
  if (!hasTicketCreated) {
    db.exec("ALTER TABLE chats ADD COLUMN ticket_created BOOLEAN DEFAULT 0;");
    console.log("Migration: Spalte 'ticket_created' zur Tabelle 'chats' hinzugefügt.");
  }

  const hasPendingMergeTarget = tableInfoChats.some(col => col.name === 'pending_merge_target_id');
  if (!hasPendingMergeTarget) {
    db.exec("ALTER TABLE chats ADD COLUMN pending_merge_target_id TEXT;");
    db.exec("ALTER TABLE chats ADD COLUMN pending_merge_info TEXT;");
    db.exec("ALTER TABLE chats ADD COLUMN is_merged BOOLEAN DEFAULT 0;");
    console.log("Migration: Spalten 'pending_merge_target_id', 'pending_merge_info' und 'is_merged' zur Tabelle 'chats' hinzugefügt.");
  }

  const hasLastActiveChats = tableInfoChats.some(col => col.name === 'last_active_at');
  if (!hasLastActiveChats) {
    db.exec("ALTER TABLE chats ADD COLUMN last_active_at DATETIME;");
    console.log("Migration: Spalte 'last_active_at' zur Tabelle 'chats' hinzugefügt.");
  }

  const tableInfoUsersInit = db.prepare("PRAGMA table_info(users)").all();
  const hasLastActiveUsers = tableInfoUsersInit.some(col => col.name === 'last_active_at');
  if (!hasLastActiveUsers) {
    db.exec("ALTER TABLE users ADD COLUMN last_active_at DATETIME;");
    console.log("Migration: Spalte 'last_active_at' zur Tabelle 'users' hinzugefügt.");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_ticket_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        recipient_role TEXT NOT NULL,
        messages_summary TEXT NOT NULL,
        scheduled_send_at DATETIME NOT NULL,
        sent_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const tableInfoChatMessagesFlag = db.prepare("PRAGMA table_info(chat_messages)").all();
  const hasIsFlagged = tableInfoChatMessagesFlag.some(col => col.name === 'is_flagged');
  if (!hasIsFlagged) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN is_flagged BOOLEAN DEFAULT 0;");
    db.exec("ALTER TABLE chat_messages ADD COLUMN flagged_at DATETIME;");
    console.log("Migration: Spalten 'is_flagged' und 'flagged_at' zur Tabelle 'chat_messages' hinzugefügt.");
  }

  const hasFlaggedReason = tableInfoChatMessagesFlag.some(col => col.name === 'flagged_reason');
  if (!hasFlaggedReason) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN flagged_reason TEXT;");
    console.log("Migration: Spalte 'flagged_reason' zur Tabelle 'chat_messages' hinzugefügt.");
  }

  const tableInfoChatsAbuse = db.prepare("PRAGMA table_info(chats)").all();
  const hasCustomerLastActive = tableInfoChatsAbuse.some(col => col.name === 'customer_last_active_at');
  if (!hasCustomerLastActive) {
    db.exec("ALTER TABLE chats ADD COLUMN customer_last_active_at DATETIME;");
    console.log("Migration: Spalte 'customer_last_active_at' zur Tabelle 'chats' hinzugefügt.");
  }

  const hasIsAbusive = tableInfoChatsAbuse.some(col => col.name === 'is_abusive');
  if (!hasIsAbusive) {
    db.exec("ALTER TABLE chats ADD COLUMN user_name TEXT;");
    db.exec("ALTER TABLE chats ADD COLUMN is_abusive BOOLEAN DEFAULT 0;");
    db.exec("ALTER TABLE chats ADD COLUMN abusive_flagged_at DATETIME;");
    console.log("Migration: Spalten für Missbrauchs-Erkennung zur Tabelle 'chats' hinzugefügt.");
  }

  const hasIsAgentOnBehalf = tableInfoChatsAbuse.some(col => col.name === 'is_agent_on_behalf');
  if (!hasIsAgentOnBehalf) {
    db.exec("ALTER TABLE chats ADD COLUMN is_agent_on_behalf BOOLEAN DEFAULT 0;");
    console.log("Migration: Spalte 'is_agent_on_behalf' zur Tabelle 'chats' hinzugefügt.");
  }

  const hasUserIp = tableInfoChatsAbuse.some(col => col.name === 'user_ip');
  if (!hasUserIp) {
    db.exec("ALTER TABLE chats ADD COLUMN user_ip TEXT;");
    console.log("Migration: Spalte 'user_ip' zur Tabelle 'chats' hinzugefügt.");
  }

  const hasUserSessionId = tableInfoChatsAbuse.some(col => col.name === 'user_session_id');
  if (!hasUserSessionId) {
    db.exec("ALTER TABLE chats ADD COLUMN user_session_id TEXT;");
    console.log("Migration: Spalte 'user_session_id' zur Tabelle 'chats' hinzugefügt.");
  }

  // Repair-Migration: Tickets ohne gültige ID (NULL oder 'null') reparieren und mit TK-XXXX ausstatten
  try {
    const nullTickets = db.prepare("SELECT rowid, title, creator_email, chat_id FROM tickets WHERE id IS NULL OR id = '' OR id = 'null'").all();
    for (const t of nullTickets) {
      let newId;
      let isUnique = false;
      const checkStmt = db.prepare('SELECT id FROM tickets WHERE id = ?');
      while (!isUnique) {
        newId = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
        if (!checkStmt.get(newId)) isUnique = true;
      }
      db.prepare("UPDATE tickets SET id = ? WHERE rowid = ?").run(newId, t.rowid);
      db.prepare("UPDATE ticket_messages SET ticket_id = ? WHERE ticket_id IS NULL OR ticket_id = 'null' OR ticket_id = ?").run(newId, String(t.rowid));
      if (t.chat_id) {
        db.prepare("UPDATE chats SET ticket_created = 1 WHERE id = ?").run(t.chat_id);
      }
      console.log(`Repair-Migration: Ticket rowid #${t.rowid} wurde erfolgreich repariert und hat nun ID ${newId}.`);
    }
  } catch (errRepair) {
    console.error("Fehler bei Repair-Migration von null-Tickets:", errRepair);
  }

  // Migration: Verwaiste ticket_created Flags bereinigen (falls Ticket gelöscht wurde)
  try {
    db.exec(`
      UPDATE chats 
      SET ticket_created = 0 
      WHERE ticket_created = 1 
        AND NOT EXISTS (SELECT 1 FROM tickets WHERE tickets.chat_id = chats.id);
    `);
    db.exec(`
      UPDATE ticket_messages
      SET sender_role = 'system', sender_email = 'system'
      WHERE sender_role = 'customer' AND text LIKE '[Ticket aus Chat %';
    `);
  } catch (errCleanChats) {
    console.error("Fehler bei Bereinigung verwaister Chat-Tickets:", errCleanChats);
  }

  // Migration: Kundenzufriedenheits-Rating für Tickets
  const tableInfoTickets = db.prepare("PRAGMA table_info(tickets)").all();
  const hasRating = tableInfoTickets.some(col => col.name === 'rating');
  if (!hasRating) {
    db.exec("ALTER TABLE tickets ADD COLUMN rating INTEGER;");
    db.exec("ALTER TABLE tickets ADD COLUMN rating_feedback TEXT;");
    db.exec("ALTER TABLE tickets ADD COLUMN rated_at DATETIME;");
    console.log("Migration: Spalten 'rating', 'rating_feedback' und 'rated_at' zur Tabelle 'tickets' hinzugefügt.");
  }

  const hasChatCategory = tableInfoChatsAbuse.some(col => col.name === 'category');
  if (!hasChatCategory) {
    db.exec("ALTER TABLE chats ADD COLUMN category TEXT;");
    db.exec("ALTER TABLE chats ADD COLUMN categorized_at DATETIME;");
    console.log("Migration: Spalten 'category' und 'categorized_at' zur Tabelle 'chats' hinzugefügt.");
  }

  const tableInfoKnowledge = db.prepare("PRAGMA table_info(knowledge)").all();
  
  const hasDescription = tableInfoKnowledge.some(col => col.name === 'description');
  if (!hasDescription) {
    db.exec("ALTER TABLE knowledge ADD COLUMN description TEXT");
    console.log("Migration: Spalte 'description' zur Tabelle 'knowledge' hinzugefügt.");
  }
  
  const hasCategory = tableInfoKnowledge.some(col => col.name === 'category');
  if (!hasCategory) {
    db.exec("ALTER TABLE knowledge ADD COLUMN category TEXT DEFAULT 'Sonstiges'");
    console.log("Migration: Spalte 'category' zur Tabelle 'knowledge' hinzugefügt.");
  }

  const hasIsPrivate = tableInfoKnowledge.some(col => col.name === 'is_private');
  if (!hasIsPrivate) {
    db.exec("ALTER TABLE knowledge ADD COLUMN is_private BOOLEAN DEFAULT 0");
    console.log("Migration: Spalte 'is_private' zur Tabelle 'knowledge' hinzugefügt.");
  }

  // Migration: Granulare, trennscharfe Schul-IT-Kategorien
  try {
    db.exec(`
      -- 1. Passwörter vs. Benutzerkonten
      UPDATE knowledge 
      SET category = 'Passwörter' 
      WHERE (category IN ('Benutzerkonten & Passwörter', 'E-Mail & Konten', 'Benutzerverwaltung') OR category IS NULL) 
        AND (title LIKE '%Passwort%' OR fact LIKE '%Passwort%');

      UPDATE knowledge 
      SET category = 'Benutzerkonten' 
      WHERE category IN ('Benutzerkonten & Passwörter', 'Benutzerverwaltung') 
        OR (category = 'E-Mail & Konten' AND (title LIKE '%Konto%' OR title LIKE '%Benutzer%' OR fact LIKE '%Konto%' OR fact LIKE '%Benutzer%'));

      UPDATE knowledge 
      SET category = 'E-Mail' 
      WHERE category = 'E-Mail & Konten';

      -- 2. WLAN vs. Netzwerk
      UPDATE knowledge 
      SET category = 'WLAN' 
      WHERE (category IN ('WLAN & Netzwerk', 'WLAN') OR title LIKE '%WLAN%' OR fact LIKE '%WLAN%' OR title LIKE '%WiFi%' OR fact LIKE '%WiFi%');

      UPDATE knowledge 
      SET category = 'Netzwerk' 
      WHERE category IN ('WLAN & Netzwerk', 'Netzwerk & Internet', 'Netzwerk & Speicher');

      -- 3. Hardware differenzieren
      UPDATE knowledge 
      SET category = 'Smartboards' 
      WHERE title LIKE '%Smartboard%' OR fact LIKE '%Smartboard%';

      UPDATE knowledge 
      SET category = 'Beamer' 
      WHERE title LIKE '%Beamer%' OR fact LIKE '%Beamer%';

      UPDATE knowledge 
      SET category = 'Dokumentenkameras' 
      WHERE title LIKE '%Dokumentenkamera%' OR title LIKE '%Elmo%' OR fact LIKE '%Dokumentenkamera%';

      UPDATE knowledge 
      SET category = 'Stationäre Computer' 
      WHERE (category IN ('Hardware', 'Hardware & Beamer') OR title LIKE '%PC%' OR title LIKE '%Computer%')
        AND category NOT IN ('Smartboards', 'Beamer', 'Dokumentenkameras');

      UPDATE knowledge 
      SET category = 'Sonstige Hardware' 
      WHERE category IN ('Hardware', 'Hardware & Beamer');

      -- 4. Drucker vs. Kopierer
      UPDATE knowledge 
      SET category = 'Drucker' 
      WHERE category IN ('Drucker & Kopierer', 'Drucker');

      UPDATE knowledge 
      SET category = 'Kopierer' 
      WHERE category = 'Kopierer' OR title LIKE '%Kopierer%' OR fact LIKE '%Kopierer%';

      -- 5. Office 365 vs. Software
      UPDATE knowledge 
      SET category = 'Office 365' 
      WHERE title LIKE '%Office%' OR title LIKE '%OneDrive%' OR title LIKE '%Teams%' OR title LIKE '%Word%' OR title LIKE '%Excel%' OR fact LIKE '%Office 365%';

      UPDATE knowledge 
      SET category = 'Software' 
      WHERE category IN ('Software & Office 365', 'Software', 'Cloud-Dienste') AND category != 'Office 365';

      -- 6. Raumbuchung
      UPDATE knowledge 
      SET category = 'Raumbuchung' 
      WHERE category IN ('Raumbuchung & Ressourcen', 'Raum- & Ressourcenbuchung');

      -- 7. Vorhandene Chats bereinigen
      UPDATE chats SET category = 'E-Mail' WHERE category = 'E-Mail & Konten';
      UPDATE chats SET category = 'Passwörter' WHERE category = 'Benutzerkonten & Passwörter';
      UPDATE chats SET category = 'Benutzerkonten' WHERE category = 'Benutzerverwaltung';
      UPDATE chats SET category = 'WLAN' WHERE category IN ('WLAN & Netzwerk', 'WLAN');
      UPDATE chats SET category = 'Sonstige Hardware' WHERE category IN ('Hardware & Beamer', 'Hardware');
      UPDATE chats SET category = 'Drucker' WHERE category IN ('Drucker & Kopierer', 'Drucker');
      UPDATE chats SET category = 'Software' WHERE category IN ('Software & Office 365', 'Software');
      UPDATE chats SET category = 'Raumbuchung' WHERE category IN ('Raumbuchung & Ressourcen', 'Raum- & Ressourcenbuchung');
    `);
  } catch (errCat) {
    console.error('Fehler bei Kategorie-Bereinigung:', errCat);
  }
  
  const tableInfoUsers = db.prepare("PRAGMA table_info(users)").all();
  const hasName = tableInfoUsers.some(col => col.name === 'name');
  if (!hasName) {
    db.exec("ALTER TABLE users ADD COLUMN name TEXT");
    console.log("Migration: Spalte 'name' zur Tabelle 'users' hinzugefügt.");
  }
  
  const hasAvatar = tableInfoUsers.some(col => col.name === 'avatar_url');
  if (!hasAvatar) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
    console.log("Migration: Spalte 'avatar_url' zur Tabelle 'users' hinzugefügt.");
  }

  const hasResponsibilities = tableInfoUsers.some(col => col.name === 'responsibilities');
  if (!hasResponsibilities) {
    db.exec("ALTER TABLE users ADD COLUMN responsibilities TEXT");
    console.log("Migration: Spalte 'responsibilities' zur Tabelle 'users' hinzugefügt.");
  }

  const tableInfoTicketsAll = db.prepare("PRAGMA table_info(tickets)").all();
  const hasChatId = tableInfoTicketsAll.some(col => col.name === 'chat_id');
  if (!hasChatId) {
    db.exec("ALTER TABLE tickets ADD COLUMN chat_id TEXT");
    console.log("Migration: Spalte 'chat_id' zur Tabelle 'tickets' hinzugefügt.");
  }

  const hasSolutionForgotten = tableInfoTicketsAll.some(col => col.name === 'solution_forgotten');
  if (!hasSolutionForgotten) {
    db.exec("ALTER TABLE tickets ADD COLUMN solution_forgotten BOOLEAN DEFAULT 0");
    console.log("Migration: Spalte 'solution_forgotten' zur Tabelle 'tickets' hinzugefügt.");
  }

  const hasSolutionContext = tableInfoTicketsAll.some(col => col.name === 'solution_context');
  if (!hasSolutionContext) {
    db.exec("ALTER TABLE tickets ADD COLUMN solution_context TEXT");
    console.log("Migration: Spalte 'solution_context' zur Tabelle 'tickets' hinzugefügt.");
  }

  const hasIsAuthCreator = tableInfoTicketsAll.some(col => col.name === 'is_authenticated_creator');
  if (!hasIsAuthCreator) {
    db.exec("ALTER TABLE tickets ADD COLUMN is_authenticated_creator BOOLEAN DEFAULT 0");
    console.log("Migration: Spalte 'is_authenticated_creator' zur Tabelle 'tickets' hinzugefügt.");
  }

  const hasLastAgentReadAt = tableInfoTicketsAll.some(col => col.name === 'last_agent_read_at');
  if (!hasLastAgentReadAt) {
    db.exec("ALTER TABLE tickets ADD COLUMN last_agent_read_at DATETIME");
    console.log("Migration: Spalte 'last_agent_read_at' zur Tabelle 'tickets' hinzugefügt.");
  }

  const tableInfoChatMessages = db.prepare("PRAGMA table_info(chat_messages)").all();
  const hasImageUrl = tableInfoChatMessages.some(col => col.name === 'image_url');
  if (!hasImageUrl) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN image_url TEXT");
    console.log("Migration: Spalte 'image_url' zur Tabelle 'chat_messages' hinzugefügt.");
  }

  // Migration: Falls bei bestehendem Wissen die Spalte description leer ist, mit fact befüllen
  db.exec("UPDATE knowledge SET description = fact WHERE description IS NULL OR description = ''");
  db.exec("UPDATE knowledge SET fact = description WHERE fact IS NULL OR fact = ''");

  const hasBaseKnowledge = tableInfoChatMessages.some(col => col.name === 'base_knowledge');
  if (!hasBaseKnowledge) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN base_knowledge TEXT");
    console.log("Migration: Spalte 'base_knowledge' zur Tabelle 'chat_messages' hinzugefügt.");
  }

  const hasClosedByEmail = tableInfoTicketsAll.some(col => col.name === 'closed_by_email');
  if (!hasClosedByEmail) {
    db.exec("ALTER TABLE tickets ADD COLUMN closed_by_email TEXT");
    console.log("Migration: Spalte 'closed_by_email' zur Tabelle 'tickets' hinzugefügt.");
  }

  const hasClosedByName = tableInfoTicketsAll.some(col => col.name === 'closed_by_name');
  if (!hasClosedByName) {
    db.exec("ALTER TABLE tickets ADD COLUMN closed_by_name TEXT");
    console.log("Migration: Spalte 'closed_by_name' zur Tabelle 'tickets' hinzugefügt.");
  }

  const hasClosedByUserId = tableInfoTicketsAll.some(col => col.name === 'closed_by_user_id');
  if (!hasClosedByUserId) {
    db.exec("ALTER TABLE tickets ADD COLUMN closed_by_user_id TEXT");
    console.log("Migration: Spalte 'closed_by_user_id' zur Tabelle 'tickets' hinzugefügt.");
  }

  const hasClosedAt = tableInfoTicketsAll.some(col => col.name === 'closed_at');
  if (!hasClosedAt) {
    db.exec("ALTER TABLE tickets ADD COLUMN closed_at DATETIME");
    console.log("Migration: Spalte 'closed_at' zur Tabelle 'tickets' hinzugefügt.");
  }

  // Backfill für bestehende geschlossene Tickets
  try {
    const unclosedTickets = db.prepare(`
      SELECT t.id, t.assigned_agent_id, u.email as agentEmail, u.name as agentName
      FROM tickets t
      LEFT JOIN users u ON t.assigned_agent_id = u.id
      WHERE t.status = 'closed' AND (t.closed_by_email IS NULL OR t.closed_by_email = '')
    `).all();

    for (const tk of unclosedTickets) {
      let closerEmail = tk.agentEmail || null;
      let closerName = tk.agentName || (tk.agentEmail ? tk.agentEmail.split('@')[0] : null);
      let closerUserId = tk.assigned_agent_id || null;

      // Falls kein zugewiesener Agent existiert: Letzte Agenten-Nachricht suchen
      if (!closerEmail) {
        const msg = db.prepare(`
          SELECT tm.sender_email, u.name, u.id as userId
          FROM ticket_messages tm
          LEFT JOIN users u ON LOWER(tm.sender_email) = LOWER(u.email)
          WHERE tm.ticket_id = ? AND tm.sender_role IN ('agent', 'admin')
          ORDER BY tm.id DESC LIMIT 1
        `).get(tk.id);

        if (msg && msg.sender_email) {
          closerEmail = msg.sender_email.toLowerCase();
          closerName = msg.name || msg.sender_email.split('@')[0];
          closerUserId = msg.userId || null;
        }
      }

      // Falls immer noch nichts gefunden: Systemkommentar parsen
      if (!closerEmail) {
        const sysMsg = db.prepare(`
          SELECT text FROM ticket_messages 
          WHERE ticket_id = ? AND (text LIKE '%geschlossen%' OR sender_role = 'system')
          ORDER BY id DESC LIMIT 1
        `).get(tk.id);

        if (sysMsg) {
          const match = sysMsg.text.match(/Ticket wurde von ([^(]+)\s*\(([^)]+)\)\s*geschlossen/);
          if (match) {
            closerName = match[1].trim();
            closerEmail = match[2].trim().toLowerCase();
            const uObj = db.prepare(`SELECT id, name FROM users WHERE LOWER(email) = ?`).get(closerEmail);
            if (uObj) {
              closerUserId = uObj.id;
              if (uObj.name) closerName = uObj.name;
            }
          }
        }
      }

      if (closerEmail) {
        db.prepare(`
          UPDATE tickets 
          SET closed_by_email = ?, closed_by_name = ?, closed_by_user_id = ?, closed_at = COALESCE(closed_at, updated_at)
          WHERE id = ?
        `).run(closerEmail, closerName || closerEmail.split('@')[0], closerUserId, tk.id);
      }
    }
  } catch (errBackfill) {
    console.error('Fehler bei Backfill geschlossener Tickets:', errBackfill);
  }
} catch (e) {
  if (e.message && e.message.includes('duplicate column name')) {
    // Ignorieren, da ein anderer Next.js Build-Worker die Spalte bereits hinzugefügt hat
  } else {
    console.error("Fehler bei der Migration der Tabellen:", e);
  }
}

// Seed-Daten einfügen, falls die Tabellen leer sind
// Seed-Daten einfügen, falls die Tabellen leer sind
const isProd = process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_IS_PROD === 'true';

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0 && !isProd) {
  // Testbenutzer nur im Entwicklungsmodus anlegen
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, email, role, name) VALUES (?, ?, ?, ?)');
  insertUser.run('admin-1', 'admin@schule.de', 'admin', 'System-Administrator');
  insertUser.run('agent-1', 'agent@schule.de', 'agent', 'Support-Agent (Max)');
  console.log('Seed: Testbenutzer (Admin & Agent) angelegt.');
}

const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get().count;
if (settingsCount === 0) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  
  // SMTP-Konfiguration (Maildev standardmäßig)
  insertSetting.run('smtp_config', JSON.stringify({
    host: 'localhost',
    port: 1025,
    user: '',
    pass: '',
    secure: false,
    sender: 'support@schule.de'
  }));

  // Identity Provider JWT-Konfiguration (generiert ein zufälliges Secret für Produktion)
  const fallbackSecret = isProd 
    ? require('crypto').randomBytes(32).toString('hex')
    : 'super-secret-jwt-key-change-in-production';

  insertSetting.run('idp_config', JSON.stringify({
    jwtSecret: fallbackSecret,
    redirectUrl: isProd ? '' : 'https://idp.schule.de/auth'
  }));

  // GitHub Auto-Update Konfiguration
  insertSetting.run('github_config', JSON.stringify({
    repoUrl: 'https://github.com/famnex/it_helpdesk_bot',
    branch: 'main'
  }));

  // Gemini API & Modelle Konfiguration
  insertSetting.run('gemini_config', JSON.stringify({
    apiKey: '',
    chatModel: 'gemini-3.5-flash',
    extractionModel: 'gemini-3.5-flash'
  }));

  console.log('Seed: Standard-Einstellungen angelegt.');
}

const knowledgeCount = db.prepare('SELECT COUNT(*) as count FROM knowledge').get().count;
if (knowledgeCount === 0 && !isProd) {
  const insertKnowledge = db.prepare('INSERT OR IGNORE INTO knowledge (id, title, fact, description, category, source) VALUES (?, ?, ?, ?, ?, ?)');
  
  insertKnowledge.run(
    'wifi-chunk-1',
    'Schul-WLAN Verbindung',
    'Das WLAN für Schüler heißt "Campus-WiFi". Das Passwort lautet "Campus2026!". Die Anmeldung erfordert kein separates Zertifikat.',
    'Um sich mit dem Schul-WLAN "Campus-WiFi" zu verbinden, führen Sie bitte folgende Schritte aus:\n\n1. Suchen Sie auf Ihrem Gerät nach verfügbaren WLAN-Netzwerken.\n2. Wählen Sie das Netzwerk **Campus-WiFi** aus.\n3. Geben Sie als Sicherheitsschlüssel das Passwort **Campus2026!** ein.\n4. Es ist kein separates Zertifikat oder Benutzername erforderlich.\n5. Bei Verbindungsproblemen schalten Sie das WLAN an Ihrem Gerät kurz aus und wieder an.',
    'WLAN',
    'manual'
  );
  
  insertKnowledge.run(
    'smartboard-chunk-1',
    'Smartboard flackert',
    'Wenn das Smartboard in Raum 102 oder 103 flackert, muss das HDMI-Kabel am Wandpanel abgezogen und in Port 2 (HDMI-2) eingesteckt werden.',
    'Flackern oder Tonaussetzer am Smartboard in den Räumen 102 und 103 liegen meist an einer defekten Buchse am primären HDMI-Port.\n\n**Lösungsschritte:**\n1. Trennen Sie das HDMI-Kabel vorsichtig vom Wandpanel (Port HDMI-1).\n2. Stecken Sie das Kabel in den zweiten Port (**HDMI-2**) ein.\n3. Schalten Sie das Smartboard mit der Fernbedienung aus und wieder ein.\n4. Vergewissern Sie sich, dass die Eingangsquelle am Smartboard auf "HDMI 2" eingestellt ist.',
    'Smartboards',
    'manual'
  );

  insertKnowledge.run(
    'printer-chunk-1',
    'Drucker-Installation Lehrerzimmer',
    'Der Drucker im Lehrerzimmer kann über die IP-Adresse 192.168.12.50 als Netzwerkdrucker (Kyocera KX-Treiber) hinzugefügt werden.',
    'So installieren Sie den Netzwerkdrucker im Lehrerzimmer auf Ihrem Windows- oder macOS-Gerät:\n\n1. Öffnen Sie die Systemeinstellungen und gehen Sie auf "Drucker & Scanner".\n2. Klicken Sie auf "Drucker hinzufügen" (IP-Drucker).\n3. Geben Sie die IP-Adresse **192.168.12.50** ein.\n4. Wählen Sie als Protokoll "LPD (Line Printer Daemon)" oder "Standard TCP/IP".\n5. Verwenden Sie den Treiber **Kyocera KX-Treiber** (kann von der Kyocera-Website heruntergeladen werden, falls nicht vorinstalliert).\n6. Benennen Sie den Drucker als "Lehrerzimmer Drucker Kyocera".',
    'Drucker',
    'manual'
  );

  console.log('Seed: Initiales Wissen angelegt.');
}

/**
 * Prüft, ob ein Administrator-Konto in der Datenbank existiert.
 * Falls nicht, ist eine Ersteinrichtung (Setup) erforderlich.
 */
export function isSetupRequired() {
  try {
    const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
    return !row || row.count === 0;
  } catch (err) {
    console.error('Fehler bei isSetupRequired Check:', err);
    return true;
  }
}

// 5-Minuten Cronjob für Bot-Chat-Kategorisierung beim Server-Start initiieren
try {
  import('./categorizer.js').then(m => m.startCategorizerCron?.()).catch(() => {});
} catch (e) {}

export default db;

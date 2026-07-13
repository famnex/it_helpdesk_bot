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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sender_email TEXT NOT NULL,
      sender_role TEXT NOT NULL CHECK(sender_role IN ('customer', 'agent', 'admin', 'system')),
      text TEXT NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_email TEXT,
      ticket_created BOOLEAN DEFAULT 0,
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
      category TEXT DEFAULT 'Sonstiges',
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
`);

// Migration für bestehende Datenbanken: Spalten hinzufügen, falls nicht vorhanden
try {
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

  // Migration: ticket_messages Tabelle aktualisieren, falls der Check-Constraint noch kein 'admin' enthält
  const ticketMessagesSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='ticket_messages'").get()?.sql || '';
  if (ticketMessagesSql && !ticketMessagesSql.includes("'admin'")) {
    console.log("Migration: Aktualisiere ticket_messages Tabelle, um 'admin' als Rolle zu erlauben...");
    
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
            sender_role TEXT NOT NULL CHECK(sender_role IN ('customer', 'agent', 'admin', 'system')),
            text TEXT NOT NULL,
            is_internal BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // 3. Daten kopieren
      db.exec(`
        INSERT INTO ticket_messages (id, ticket_id, sender_email, sender_role, text, is_internal, created_at)
        SELECT id, ticket_id, sender_email, sender_role, text, is_internal, created_at FROM ticket_messages_old;
      `);
      
      // 4. Alte Tabelle löschen
      db.exec("DROP TABLE ticket_messages_old;");
    })();
    
    // Foreign Keys wieder aktivieren
    db.pragma('foreign_keys = ON');
    console.log("Migration: ticket_messages Tabelle erfolgreich aktualisiert.");
  }
  const tableInfoChats = db.prepare("PRAGMA table_info(chats)").all();
  const hasTicketCreated = tableInfoChats.some(col => col.name === 'ticket_created');
  if (!hasTicketCreated) {
    db.exec("ALTER TABLE chats ADD COLUMN ticket_created BOOLEAN DEFAULT 0;");
    console.log("Migration: Spalte 'ticket_created' zur Tabelle 'chats' hinzugefügt.");
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

  const tableInfoTickets = db.prepare("PRAGMA table_info(tickets)").all();
  const hasChatId = tableInfoTickets.some(col => col.name === 'chat_id');
  if (!hasChatId) {
    db.exec("ALTER TABLE tickets ADD COLUMN chat_id TEXT");
    console.log("Migration: Spalte 'chat_id' zur Tabelle 'tickets' hinzugefügt.");
  }

  const tableInfoChatMessages = db.prepare("PRAGMA table_info(chat_messages)").all();
  const hasImageUrl = tableInfoChatMessages.some(col => col.name === 'image_url');
  if (!hasImageUrl) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN image_url TEXT");
    console.log("Migration: Spalte 'image_url' zur Tabelle 'chat_messages' hinzugefügt.");
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
    'Hardware',
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

export default db;

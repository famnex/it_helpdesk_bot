# Datenbank-Dokumentation (SQLite)

Dieses Dokument beschreibt die Struktur der SQLite-Datenbank (`database.db`) für das Projekt "Schul-Support KI".

---

## Tabellenstrukturen

### 1. Tabelle: `users`
Speichert Benutzerkonten für Agenten, Admins und Kunden, die sich registriert/angemeldet haben.

* **Schema:**
  ```sql
  CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'agent', 'admin')),
      name TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **Feldbeschreibungen:**
  * `id`: Eindeutige Benutzer-ID (UUID oder vom IdP bereitgestellt).
  * `email`: E-Mail-Adresse (Eindeutig).
  * `role`: Systemrolle. Kann `'customer'`, `'agent'` oder `'admin'` sein.
  * `name`: Anzeigename / voller Name des Benutzers (optional).
  * `avatar_url`: Relative URL zum hochgeladenen Profilbild (optional).
  * `created_at`: Erstelldatum des Benutzers.

---

### 2. Tabelle: `tickets`
Speichert alle IT-Support-Tickets.

* **Schema:**
  ```sql
  CREATE TABLE tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'assigned', 'closed')) DEFAULT 'open',
      creator_email TEXT NOT NULL,
      assigned_agent_id TEXT REFERENCES users(id),
      solution TEXT,
      chat_id TEXT REFERENCES chats(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **Feldbeschreibungen:**
  * `id`: Ticket-Kürzel (z. B. `TK-1234`).
  * `title`: Betreff / Problembeschreibung.
  * `status`: Ticket-Status (`open`, `assigned` oder `closed`).
  * `creator_email`: E-Mail-Adresse des Erstellers (wird bei unangemeldeten Benutzern abgefragt).
  * `assigned_agent_id`: ID des zuständigen Agenten.
  * `solution`: Die eingegebene Lösung (wird beim Schließen des Tickets gefordert).
  * `chat_id`: Referenziert den ursprünglichen Bot-Chat-Verlauf (`chats.id`), der vor der Ticket-Erstellung stattfand.

---

### 3. Tabelle: `ticket_messages`
Speichert den Chatverlauf und interne Notizen innerhalb eines Support-Tickets.

* **Schema:**
  ```sql
  CREATE TABLE ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sender_email TEXT NOT NULL,
      sender_role TEXT NOT NULL CHECK(sender_role IN ('customer', 'agent', 'admin', 'system')),
      text TEXT NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **Feldbeschreibungen:**
  * `ticket_id`: Zugehöriges Ticket.
  * `sender_email`: E-Mail des Senders.
  * `sender_role`: Rolle des Senders zum Zeitpunkt der Nachricht. `'system'` wird für automatisierte Systemkommentare (z. B. "Ticket zugewiesen") verwendet.
  * `text`: Inhalt der Nachricht.
  * `is_internal`: Wenn `1` (true), handelt es sich um einen internen Vermerk (nur für Agenten/Admins sichtbar).

---

### 4. Tabelle: `chats`
Speichert private Chats von Kunden mit dem Bot.

  ```sql
  CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      user_email TEXT,
      ticket_created BOOLEAN DEFAULT 0,
      is_agent_on_behalf BOOLEAN DEFAULT 0,
      user_name TEXT,
      is_abusive BOOLEAN DEFAULT 0,
      abusive_flagged_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **Feldbeschreibungen:**
  * `id`: Eindeutige ID des Chat-Verlaufs.
  * `user_email`: Die E-Mail-Adresse des Benutzers, falls dieser angemeldet ist (ermöglicht das Laden alter Chats).
  * `ticket_created`: Flag (`0` oder `1`), das angibt, ob für diesen Chatverlauf bereits ein Ticket erstellt wurde, um doppelte Ticket-Erstellungen zu verhindern.
  * `is_agent_on_behalf`: Flag (`0` oder `1`), das angibt, ob das Ticket im Namen eines Benutzers durch einen Agenten im Backend erfasst wird.
  * `user_name`: Name des Benutzers (für unregistrierte Benutzer oder Behalf-Tickets).
  * `is_abusive`: Missbrauch-Erkennungs-Flag.
  * `abusive_flagged_at`: Zeitstempel der Missbrauch-Erkennung.
  * `created_at`: Erstelldatum des Chats.

---

### 5. Tabelle: `chat_messages`
Speichert die einzelnen Nachrichten innerhalb des Bot-Chats.

* **Schema:**
  ```sql
  CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender TEXT NOT NULL CHECK(sender IN ('user', 'bot')),
      text TEXT NOT NULL,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

---

### 6. Tabelle: `knowledge`
Speichert die Wissensdatenbank (Chunks), welche von Admins verwaltet und von der KI zur Beantwortung genutzt wird.

* **Schema:**
  ```sql
  CREATE TABLE knowledge (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      fact TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'Sonstiges',
      source TEXT NOT NULL CHECK(source IN ('manual', 'ticket', 'file', 'url')),
      is_private BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **Feldbeschreibungen:**
  * `id`: Eindeutige ID des Chunks (wichtig für die Deduplizierung).
  * `title`: Titel / Thema des Chunks.
  * `fact`: Kurze, prägnante Zusammenfassung des Fakts / der Problemlösung (wird von der KI im Bot-Chat verwendet).
  * `description`: Umfassende, detaillierte Beschreibung oder Anleitung (wird dem Benutzer im öffentlichen Hilfeportal im Markdown-Format angezeigt).
  * `category`: Kategorie des Artikels zur Gruppierung (z.B. WLAN, Hardware, Drucker, Software).
  * `source`: Woher das Wissen stammt (`manual` = Manuell angelegt, `ticket` = Aus gelöstem Ticket extrahiert, `file` = Aus Datei importiert, `url` = Aus Webseite extrahiert).
  * `is_private`: Flag (`0` oder `1`), das angibt, ob dieser Chunk nur für die KI und Agenten intern bestimmt ist und NICHT in der öffentlichen Wissensdatenbank aufgeführt werden soll.

---

### 7. Tabelle: `knowledge_attachments`
Speichert Anhänge (Dateien), die von Administratoren an Einträge der Wissensdatenbank angehängt wurden.

* **Schema:**
  ```sql
  CREATE TABLE knowledge_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      knowledge_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **Feldbeschreibungen:**
  * `id`: Eindeutige ID des Anhangs (Auto-Increment).
  * `knowledge_id`: Fremdschlüssel, der auf den zugehörigen Wissenseintrag (`knowledge.id`) verweist.
  * `filename`: Der ursprüngliche Dateiname (z. B. `wlan_anleitung.pdf`).
  * `file_path`: Relativer Pfad zur gespeicherten Datei unter `/public/uploads/attachments/`.
  * `file_size`: Dateigröße in Bytes.
  * `created_at`: Erstelldatum des Eintrags.

---

### 8. Tabelle: `settings`
Einstellungs-Tabelle für administrative Konfigurationen (SMTP, IdP, GitHub-Web-Interface).

* **Schema:**
  ```sql
  CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
  );
  ```
* **Beispiel-Einträge (JSON im `value`-Feld):**
  * `key = 'smtp_config'`:
    `{"host":"localhost","port":1025,"user":"","pass":"","secure":false,"sender":"support@schule.de"}`
  * `key = 'idp_config'`:
    `{"issuer":"https://idp.schule.de","clientId":"helpdesk-app","clientSecret":"xyz","publicKey":"..."}`
  * `key = 'github_config'`:
    `{"repoUrl":"https://github.com/org/repo","branch":"main"}`

---

## Datenbank-Updates & Migrationen

### Update #1 (15.06.2026): Erweiterung des Check-Constraints für `ticket_messages`
* **Ziel:** Ermöglichen, dass Nachrichten mit der Rolle `admin` direkt in `ticket_messages` gespeichert werden können (zuvor auf `customer`, `agent`, `system` beschränkt).
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  PRAGMA foreign_keys = OFF;
  
  ALTER TABLE ticket_messages RENAME TO ticket_messages_old;
  
  CREATE TABLE ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sender_email TEXT NOT NULL,
      sender_role TEXT NOT NULL CHECK(sender_role IN ('customer', 'agent', 'admin', 'system')),
      text TEXT NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  INSERT INTO ticket_messages (id, ticket_id, sender_email, sender_role, text, is_internal, created_at)
  SELECT id, ticket_id, sender_email, sender_role, text, is_internal, created_at FROM ticket_messages_old;
  
  DROP TABLE ticket_messages_old;
  
  PRAGMA foreign_keys = ON;
  ```

### Update #2 (15.06.2026): Hinzufügen der Spalte `image_url` zu `chat_messages`
* **Ziel:** Speichern von relativen Links zu hochgeladenen Chatbildern (z.B. Screenshots von Fehlermeldungen).
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  ALTER TABLE chat_messages ADD COLUMN image_url TEXT;
  ```

### Update #3 (15.06.2026): Hinzufügen der Tabelle `knowledge_attachments`
* **Ziel:** Speichern von Dateianhängen für Wissensdatenbank-Artikel.
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  CREATE TABLE IF NOT EXISTS knowledge_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      knowledge_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

### Update #4 (13.07.2026): Hinzufügen der Spalte `ticket_created` zu `chats`
* **Ziel:** Verhindern von doppelten Ticket-Erstellungen innerhalb desselben Chatverlaufs.
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  ALTER TABLE chats ADD COLUMN ticket_created BOOLEAN DEFAULT 0;
  ```

### Update #5 (13.07.2026): Hinzufügen der Spalten `is_flagged` und `flagged_at` zu `chat_messages`
* **Ziel:** Ermöglichen, dass Kunden fehlerhafte Bot-Antworten flaggen/melden können, die im Admin-Portal zur Prüfung gesammelt werden.
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  ALTER TABLE chat_messages ADD COLUMN is_flagged BOOLEAN DEFAULT 0;
  ALTER TABLE chat_messages ADD COLUMN flagged_at DATETIME;
  ```

### Update #6 (13.07.2026): Hinzufügen der Spalten `user_name`, `is_abusive` und `abusive_flagged_at` zu `chats`
* **Ziel:** Speichern von Flaggen-Daten bei missbräuchlicher Nutzung des Chats (Beleidigungen/Ärgern) und Hinterlegen von Name und E-Mail des Störers.
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  ALTER TABLE chats ADD COLUMN user_name TEXT;
  ALTER TABLE chats ADD COLUMN is_abusive BOOLEAN DEFAULT 0;
  ALTER TABLE chats ADD COLUMN abusive_flagged_at DATETIME;
  ```

### Update #7 (13.07.2026): Hinzufügen der Spalte `flagged_reason` zu `chat_messages`
* **Ziel:** Speichern einer Freitext-Begründung des Nutzers, warum er eine Bot-Antwort geflaggt/gemeldet hat.
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  ALTER TABLE chat_messages ADD COLUMN flagged_reason TEXT;
  ```

### Update #8 (14.07.2026): Hinzufügen der Spalte `responsibilities` zu `users`
* **Ziel:** Speichern der Zuständigkeiten (in Prosa) von Administratoren und Support-Agenten zur automatischen Zuweisung neuer Tickets.
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  ALTER TABLE users ADD COLUMN responsibilities TEXT;
  ```

### Update #9 (23.07.2026): Hinzufügen der Spalte `is_private` zu `knowledge`
* **Ziel:** Speichern eines Flags, um Wissenschunks als intern/privat zu kennzeichnen (nicht sichtbar in der öffentlichen Wissensdatenbank).
* **Migration (ausgeführt in `src/lib/db.js`):**
  ```sql
  ALTER TABLE knowledge ADD COLUMN is_private BOOLEAN DEFAULT 0;
  ```

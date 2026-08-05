# Datenbankdokumentation (db.md)

Diese Dokumentation beschreibt das gesamte Schema der SQLite-Datenbank (`database.db`) des IT-Helpdesk-Bots. Sie dient als Vorlage für Datenbank-Updatescripts und Migrationen.

---

## 1. Tabellenstruktur

### 1.1 `users`
Speichert Benutzerkonten (Kunden, Support-Agenten, Administratoren).

| Spalte | Typ | Constraints | Beschreibung |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | Eindeutige Benutzer-ID (z. B. `admin-1`, UUID) |
| `email` | TEXT | UNIQUE NOT NULL | E-Mail-Adresse des Benutzers |
| `role` | TEXT | NOT NULL, CHECK(`customer`, `agent`, `admin`) | Benutzerrolle im System |
| `name` | TEXT | NULL | Anzeigename / Vollständiger Name |
| `avatar_url` | TEXT | NULL | Pfad oder URL zum Profilbild |
| `responsibilities` | TEXT | NULL | Zuständigkeiten / Fachbereiche des Agenten |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Erstellungszeitpunkt |

---

### 1.2 `tickets`
Speichert Support-Tickets.

| Spalte | Typ | Constraints | Beschreibung |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | Eindeutige Ticket-ID |
| `title` | TEXT | NOT NULL | Betreff / Thema des Tickets |
| `status` | TEXT | NOT NULL, CHECK(`open`, `assigned`, `closed`), DEFAULT `'open'` | Bearbeitungsstatus |
| `creator_email` | TEXT | NOT NULL | E-Mail des Erstellers |
| `assigned_agent_id` | TEXT | FOREIGN KEY -> `users(id)` ON DELETE SET NULL | Zugewiesener Agent |
| `solution` | TEXT | NULL | Erfasste Lösung beim Schließen des Tickets |
| `chat_id` | TEXT | FOREIGN KEY -> `chats(id)` ON DELETE SET NULL | Zugehöriger Chat-Verlauf (falls vor Ticket-Erstellung) |
| `solution_forgotten` | BOOLEAN | DEFAULT 0 | Kennzeichnet, ob die Lösung aus der Wissensbasis entfernt wurde |
| `solution_context` | TEXT | NULL | KI-generierte Zusammenfassung der Lösung |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Erstellungszeitpunkt |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Zeitpunkt der letzten Änderung |

---

### 1.3 `ticket_messages`
Speichert Nachrichten und Notizen innerhalb eines Tickets.

| Spalte | Typ | Constraints | Beschreibung |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Fortlaufende Nachrichten-ID |
| `ticket_id` | TEXT | NOT NULL, FOREIGN KEY -> `tickets(id)` ON DELETE CASCADE | Zugehöriges Ticket |
| `sender_email` | TEXT | NOT NULL | E-Mail des Absenders |
| `sender_role` | TEXT | NOT NULL, CHECK(`customer`, `agent`, `admin`, `system`) | Rolle des Absenders |
| `text` | TEXT | NOT NULL | Nachrichteninhalt |
| `is_internal` | BOOLEAN | NOT NULL DEFAULT 0 | 1 = Interner Vermerk (nur für Mitarbeiter sichtbar) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Erstellungszeitpunkt |

---

### 1.4 `chats`
Speichert Chat-Sitzungen mit dem KI-Bot.

| Spalte | Typ | Constraints | Beschreibung |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | Eindeutige Chat-ID |
| `user_email` | TEXT | NULL | E-Mail des Benutzers (falls eingeloggt oder angegeben) |
| `user_name` | TEXT | NULL | Name des Benutzers |
| `ticket_created` | BOOLEAN | DEFAULT 0 | 1 = Aus dem Chat wurde bereits ein Ticket generiert |
| `is_agent_on_behalf` | BOOLEAN | DEFAULT 0 | 1 = Agent hat den Chat im Namen eines Dritte gestartet |
| `is_abusive` | BOOLEAN | DEFAULT 0 | 1 = Chat wegen Missbrauchs geflaggt |
| `abusive_flagged_at` | DATETIME | NULL | Zeitpunkt der Missbrauchs-Markierung |
| `user_ip` | TEXT | NULL | IP-Adresse des Benutzers |
| `user_session_id` | TEXT | NULL | Sitzungs-ID des Browsers |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Erstellungszeitpunkt |

---

### 1.5 `chat_messages`
Speichert einzelne Chat-Nachrichten im Bot-Dialog.

| Spalte | Typ | Constraints | Beschreibung |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Nachricht-ID |
| `chat_id` | TEXT | NOT NULL, FOREIGN KEY -> `chats(id)` ON DELETE CASCADE | Zugehörige Chat-Sitzung |
| `sender` | TEXT | NOT NULL, CHECK(`user`, `bot`) | Absender der Nachricht |
| `text` | TEXT | NOT NULL | Inhalt der Nachricht |
| `image_url` | TEXT | NULL | Pfad/URL zu angehängten Bildern |
| `is_flagged` | BOOLEAN | DEFAULT 0 | 1 = Nachricht von KI als auffällig markiert |
| `flagged_at` | DATETIME | NULL | Zeitpunkt der Markierung |
| `flagged_reason` | TEXT | NULL | Grund für die Markierung |
| `base_knowledge` | TEXT | NULL | Verwendete Wissensbasis-Quellen |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Erstellungszeitpunkt |

---

### 1.6 `knowledge`
Speichert Wissen-Einträge / RAG-Chunks.

| Spalte | Typ | Constraints | Beschreibung |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | Eindeutige Chunk-ID |
| `title` | TEXT | NOT NULL | Titel des Wissenseintrags |
| `fact` | TEXT | NOT NULL | Kernfakt / Kurze Antwort |
| `description` | TEXT | NULL | Ausführliche Beschreibung / Anleitung |
| `category` | TEXT | DEFAULT `'Sonstiges'` | Kategorie (z. B. WLAN, Hardware, Drucker) |
| `source` | TEXT | NOT NULL, CHECK(`manual`, `ticket`, `file`, `url`) | Herkunft des Eintrags |
| `is_private` | BOOLEAN | DEFAULT 0 | 1 = Internes Wissen (nur für Agenten/Admin) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Erstellungszeitpunkt |

---

### 1.7 `knowledge_attachments`
Dateianhänge für Wissen-Einträge.

| Spalte | Typ | Constraints | Beschreibung |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Anhang-ID |
| `knowledge_id` | TEXT | NOT NULL, FOREIGN KEY -> `knowledge(id)` ON DELETE CASCADE | Zugehöriger Wissen-Eintrag |
| `filename` | TEXT | NOT NULL | Original-Dateiname |
| `file_path` | TEXT | NOT NULL | Speicherpfad auf dem Server |
| `file_size` | INTEGER | NOT NULL | Dateigröße in Bytes |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Erstellungszeitpunkt |

---

### 1.8 `settings`
Systemweite Einstellungen als Key-Value Store.

| Spalte | Typ | Constraints | Beschreibung |
| :--- | :--- | :--- | :--- |
| `key` | TEXT | PRIMARY KEY | Konfigurationsschlüssel (`smtp_config`, `idp_config`, `github_config`, `gemini_config`) |
| `value` | TEXT | NOT NULL | JSON-codierte Einstellungswerte |

---

## 2. Historie der Datenbank-Migrationen

- **ticket_messages Rolle 'admin' hinzugefügt**: Check-Constraint erweitert für `sender_role IN ('customer', 'agent', 'admin', 'system')`.
- **Spalten zu `chats` hinzugefügt**: `ticket_created`, `user_name`, `is_abusive`, `abusive_flagged_at`, `is_agent_on_behalf`, `user_ip`, `user_session_id`.
- **Spalten zu `chat_messages` hinzugefügt**: `is_flagged`, `flagged_at`, `flagged_reason`, `image_url`, `base_knowledge`.
- **Spalten zu `knowledge` hinzugefügt**: `description`, `category`, `is_private`.
- **Spalten zu `users` hinzugefügt**: `name`, `avatar_url`, `responsibilities`.
- **Spalten zu `tickets` hinzugefügt**: `chat_id`, `solution_forgotten`, `solution_context`.
- **Tabelle `knowledge_attachments` erstellt**: Für Dateianhänge an Wissenseinträgen.

# Identitäts-Spur Rekonstruktion & Missbrauchsklassifizierung (`identity_tracing.md`)

Dieses Dokument erklärt die Funktionsweise der nachträglichen Chat-Missbrauchsklassifizierung und die automatische Rekonstruktion digitaler Identitätsspuren im IT-Helpdesk-Bot Adminbereich.

---

## 1. Übersicht

Administratoren können im Adminbereich (`/admin`) unter **Chats** jeden gespeicherten Chat einsehen und nachträglich als **missbräuchlich** einordnen (oder die Markierung wieder aufheben).

Sobald ein Chat als missbräuchlich eingestuft wird oder ein Administrator die Details eines geflaggten Chats aufruft, führt das System über `src/lib/identityTrace.js` automatisch eine mehrstufige Rekonstruktion der digitalen Identitäts-Spur durch.

---

## 2. Funktionsweise der Identitäts-Rekonstruktion

Das Modul `src/lib/identityTrace.js` analysiert die Datenbank (`chats`, `users`, `tickets`) anhand folgender Anhaltspunkte:

1. **Browser-Session-ID (`user_session_id`)**:
   - Untersucht alle vergangenen und zukünftigen Chat-Sitzungen mit derselben Session-ID.
   - Identifiziert E-Mail-Adressen und Namen, die der Benutzer während angemeldeter Sitzungen auf demselben Browser hinterlassen hat.
   - *Zuverlässigkeit*: Sehr hoch (`high`).

2. **IP-Adresse (`user_ip`)**:
   - Prüft alle Chat-Aktivitäten über dieselbe IP-Adresse.
   - Erfasst weitere verbundene Sitzungen und Anmeldungen.
   - *Zuverlässigkeit*: Mittel (`medium`).

3. **Benutzerkonto-Abgleich (`users`)**:
   - Gleicht gefundene E-Mail-Adressen mit der `users`-Tabelle ab.
   - Ruft Rolle, Vollständigen Namen, Erstellungsdatum und Profilbild-URL ab.

4. **Support-Ticket-Zuordnung (`tickets`)**:
   - Verknüpft Support-Tickets, die direkt aus dem Chat oder von den ermittelten E-Mail-Adressen erstellt wurden.

5. **Berechnung des Zuverlässigkeitsscores (`confidenceScore`)**:
   - `HIGH`: Eindeutige Verknüpfung einer Browser-Session mit einem registrierten Benutzerkonto.
   - `MEDIUM`: Verknüpfung über IP-Adresse oder bekannte E-Mail-Adressen.
   - `LOW`: Anonyme Gast-Sitzung ohne historisch verknüpfte Konten.

---

## 3. Schnittstellen & API-Routen

- **`GET /api/admin/chats?chatId=xyz`**:
  - Liefert Chat-Details, Nachrichten und das Objekt `identityTrace`.

- **`POST /api/admin/chats`**:
  - Body: `{ chatId: "...", action: "flag_abusive" }`: Setzt `is_abusive = 1`, führt `reconstructIdentityTrace` aus und gibt das Ergebnis zurück.
  - Body: `{ chatId: "...", action: "unflag_abusive" }`: Aufhebung der Markierung (`is_abusive = 0`).

- **`GET /api/admin/abusive`**:
  - Gibt alle missbräuchlichen Chats inklusive angereicherter `identityTrace` für die Übersicht *Missbrauchsmeldungen* zurück.

- **`POST /api/admin/abusive`**:
  - Body: `{ chatId: "...", action: "resolve" | "unflag" | "flag" }`: Verwalten der Meldungen im Missbrauchs-Reiter.

---

## 4. Benutzeroberfläche im Adminbereich

1. **Chat-Inspektor (`activeTab === 'chats'`)**:
   - Button **"Als missbräuchlich markieren"** / **"Missbrauch aufheben"** im Header.
   - Warnkarte **"Identitäts-Spur rekonstruiert"** bei geflaggten Chats mit Angabe von:
     - Zusammenfassendem Bericht
     - Verknüpften Benutzerkonten (Name, E-Mail, Rolle, Zuordnungsweg)
     - Zugehörigen Support-Tickets
     - Primären IP-Adressen und Session-IDs
     - Treffersicherheits-Badge (`HIGH`, `MEDIUM`, `LOW`)

2. **Missbrauchsmeldungen (`activeTab === 'abusive'`)**:
   - Übersicht aller KI-automatisch oder von Admins manuell geflaggten Chats mit vollständiger Identitäts-Spur.

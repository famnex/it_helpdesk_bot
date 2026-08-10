# Live-Updates & Tipp-Indikator ("...") (`live_updates.md`)

Dieses Dokument beschreibt die Architektur und Funktionsweise der **Echtzeit-Synchronisation** und der **Tipp-Indikator-Animation ("...")** im IT-Helpdesk-Bot.

---

## 1. Übersicht

Wenn ein Benutzer (Kunde) und ein Support-Agent / IT-Administrator gleichzeitig in einem Chat oder Ticket aktiv sind, bietet das System zwei Echtzeit-Funktionen:

1. **Live-Nachrichten-Synchronisation**: Neue Nachrichten der Gegenseite werden im Abstand von 1,5 Sekunden ohne Neuladen der Seite sofort im Verlauf ergänzt und der Chat wird automatisch nach unten gescrollt.
2. **Tipp-Indikator ("...")**: Sobald die Gegenseite im Textfeld tippt, erscheint am Ende des Chatverlaufs eine dreipunkte-animierte Blase (z. B. *"Support schreibt..."* oder *"Kunde tippt..."*).

---

## 2. Technische Architektur

### A. API-Endpunkt (`src/app/api/live/sync/route.js`)
- **`GET /api/live/sync`**:
  - Parameter: `roomType` (`ticket` oder `chat`), `roomId`, `lastMsgId`, `myRole`, `myEmail`.
  - Frag alle Nachrichten mit `id > lastMsgId` ab.
  - Prüft den In-Memory-Speicher (`global._liveTypingStore`) auf Tipp-Aktivitäten der Gegenseite innerhalb der letzten 3,5 Sekunden.
  - Gibt `{ newMessages: [...], isOtherPartyTyping: true|false }` zurück.

- **`POST /api/live/sync`**:
  - Empfängt Tipp-Heartbeats von den Frontends (`isTyping: true|false`, `roomId`, `roomType`, `role`, `email`).
  - Speichert oder entfernt den Heartbeat im globalen `_liveTypingStore`.

### B. Client-Einbindung
- **Kunden-Ticket-Ansicht ([`src/app/tickets/[id]/page.js`](file:///c:/Users/fleis/.gemini/antigravity/scratch/it_helpdesk/src/app/tickets/[id]/page.js))**:
  - Sendet Tipp-Heartbeats beim Tippen.
  - Führt 1,5s Intervall-Polling durch und rendert die lila Tipp-Blase *"Support schreibt..."*.
- **Agenten-Ticket-Ansicht ([`src/app/agent/tickets/[id]/page.js`](file:///c:/Users/fleis/.gemini/antigravity/scratch/it_helpdesk/src/app/agent/tickets/[id]/page.js))**:
  - Sendet Tipp-Heartbeats beim Tippen des Agenten.
  - Führt 1,5s Intervall-Polling durch und rendert die blaue Tipp-Blase *"Kunde tippt..."*.
- **Haupt-Bot-Chat ([`src/app/page.js`](file:///c:/Users/fleis/.gemini/antigravity/scratch/it_helpdesk/src/app/page.js))**:
  - Sendet Tipp-Heartbeats für den Live-Chat.

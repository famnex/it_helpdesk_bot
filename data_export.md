# Dokumentation: Helpdesk Daten-Export (JSON)

## 1. Übersicht
Die Daten-Export-Funktion ermöglicht es Administratoren, alle anfallenden Helpdesk-Daten aus der SQLite-Datenbank seit einem frei wählbaren Datum als strukturierte JSON-Datei herunterzuladen.

---

## 2. API-Endpunkt: `/api/admin/export`

### Berechtigung
* **Rolle:** Nur `admin` (geprüft via Session-Cookie / `getSessionUser()`).

### Parameter (Query / Body)
* `since` *(optional, string YYYY-MM-DD)*: Startdatum des Exports (Beginn um 00:00:00 Uhr).
* `until` *(optional, string YYYY-MM-DD)*: Enddatum des Exports (Ende um 23:59:59 Uhr).
* `includeTickets` *(optional, boolean, Standard: `true`)*: Ob Support-Tickets und zugehörige Ticket-Nachrichten enthalten sein sollen.
* `includeChats` *(optional, boolean, Standard: `true`)*: Ob Live-Chat-Sitzungen und Bot-Nachrichten enthalten sein sollen.
* `includeKnowledge` *(optional, boolean, Standard: `true`)*: Ob Wissensdatenbank-Einträge enthalten sein sollen.
* `includeUsers` *(optional, boolean, Standard: `false`)*: Ob Benutzer und Agenten (Name, Rolle, E-Mail) exportiert werden sollen.
* `format` *(optional, string, `json` oder `download`)*: Bei `download` wird ein HTTP-Download (`Content-Disposition: attachment; filename="helpdesk_export_..."`) ausgelöst.

---

## 3. Exportierte Datenstruktur (JSON Schema)

```json
{
  "exportVersion": "1.0",
  "exportMetadata": {
    "generatedAt": "2026-08-20T14:20:00.000Z",
    "filter": {
      "since": "2026-08-01",
      "until": "2026-08-20",
      "sinceTimestamp": "2026-08-01 00:00:00",
      "untilTimestamp": "2026-08-20 23:59:59"
    },
    "exportedBy": {
      "id": "admin-1",
      "email": "admin@schule.de",
      "name": "System-Administrator"
    },
    "statistics": {
      "totalTickets": 12,
      "totalTicketMessages": 45,
      "totalChats": 20,
      "totalChatMessages": 88,
      "totalKnowledgeEntries": 5,
      "ratedTicketsCount": 8,
      "averageRating": 4.8
    }
  },
  "data": {
    "tickets": [
      {
        "id": "TK-1234",
        "title": "Drucker druckt nicht",
        "status": "closed",
        "creatorEmail": "lehrer@schule.de",
        "isAuthenticatedCreator": false,
        "assignedAgent": {
          "id": "agent-1",
          "name": "Support-Agent (Max)",
          "email": "agent@schule.de"
        },
        "solution": "Toner getauscht und Papierstau behoben.",
        "solutionContext": "Problem mit dem HP LaserJet im Lehrerzimmer.",
        "rating": 5,
        "ratingFeedback": "Sehr schneller Service, danke!",
        "ratedAt": "2026-08-19 14:30:00",
        "closedAt": "2026-08-19 14:15:00",
        "closedBy": {
          "email": "agent@schule.de",
          "name": "Support-Agent (Max)",
          "userId": "agent-1"
        },
        "createdAt": "2026-08-19 12:00:00",
        "updatedAt": "2026-08-19 14:30:00",
        "messagesCount": 4,
        "messages": [
          {
            "id": 1,
            "senderEmail": "lehrer@schule.de",
            "senderRole": "customer",
            "text": "Hilfe, der Drucker streikt!",
            "isInternal": false,
            "imageUrl": null,
            "createdAt": "2026-08-19 12:00:00"
          }
        ]
      }
    ],
    "chats": [
      {
        "id": "chat-867698",
        "userEmail": "gast@schule.de",
        "userName": "Gast",
        "category": "Drucker",
        "ticketCreated": true,
        "createdAt": "2026-08-19 11:55:00",
        "messagesCount": 2,
        "messages": [ ... ]
      }
    ],
    "knowledge": [ ... ],
    "users": [ ... ]
  }
}
```

---

## 4. Admin Benutzeroberfläche (`/admin`)

* Befindet sich im Admin-Menü unter dem Reiter **"Daten-Export"** (`activeTab = 'export'`).
* **Schnellauswahl:** „Letzte 7 Tage“, „Letzte 30 Tage“, „Dieser Monat“, „Dieses Jahr“, „Gesamter Verlauf (Alles)“.
* **Freie Datumsauswahl:** Datumseingabefelder für *Seit wann* und *Bis wann*.
* **Live-Vorschau:** Analyse der gefundenen Datensätze direkt im Dashboard vor dem Download.
* **JSON-Download:** Download der Datei mit einem Klick.
* **In die Zwischenablage:** Schnelles Kopieren der formatierten JSON-Struktur.

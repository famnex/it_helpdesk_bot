# Umgesetzte Änderungen

Stand: 22. September 2026. Ausgangspunkt: `ed5160a`, ergänzt um den bereits vorhandenen JWT-Kontext-Commit `b0365c7`. Änderungen auf dem lokalen Branch `feature/chat-jwt-user-context`.

## Funktion und Bedienung

- **Privates Wissen:** unverändert für den Bot verfügbar, ausschließlich aus der öffentlichen Wissensliste ausgeblendet. Dieses Verhalten wurde ausdrücklich geprüft.
- **Verifikation:** gemeinsame Anzeige für „Schulkonto bestätigt“, „E-Mail bestätigt“, „Gast · E-Mail unbestätigt“ und „Verifikation unbekannt“. Benutzerzeilen und ID-Präfixe gelten nicht mehr als Nachweis. Tickets speichern den tatsächlichen Nachweis bei Anlage; Mitarbeiter im Auftrag bestätigen nicht die Identität der betroffenen Person.
- **JWT-Kontext:** Name, E-Mail und exakt zugeordnete Schüler-/Lehrergruppen stehen dem Bot bei jeder regulären Anfrage zur Verfügung. Keine vollständigen AD-Gruppenlisten oder Zugangstokens werden übertragen. Fehlende Angaben und Auftragsfälle bleiben getrennt.
- **Zwischenablage:** Bild-/Datei-Paste im öffentlichen Chat, Agentengespräch und Kundenantwortbereich. Gemeinsame Validierung für Büroklammer und Paste, höchstens ein Anhang und 10 MB. Normales Texteinfügen bleibt erhalten. Ersetzen wird bestätigt; mehrere eingefügte Dateien führen zu einem Hinweis. Dokumente werden als Supportanhänge gespeichert, nicht automatisch vom Bot analysiert.
- **Ohne KI:** direkt beim Einstieg erreichbar; serverseitig an Chat und Ticket gespeichert. Antworten, Titel, Zuweisung, Erledigungserkennung, Kategorisierung, Qualitätsanalyse und Wissensextraktion beachten diesen Modus. Ein Wechsel zur KI verwendet einen neuen Verlauf. Alte Verläufe erhalten keine nachträglich unterstellte Zustimmung.
- **Versand:** Entwürfe bleiben bei Fehlern erhalten. Anfragekennungen schützen Wiederholungen vor doppelten Nachrichten. Auch ein noch nicht abgesendeter Anhang wird bei „Ticket jetzt einsenden“ mitgesendet. Spiegelung und Zusammenführung nutzen Nachrichten-IDs; gleiche Texte dürfen mehrfach vorkommen.
- **UI/UX:** größere kleine Schrift, Browserzoom, sichtbarer Tastaturfokus, wiederverwendbare Dialoge mit Fokusführung, nicht blockierende Rückmeldungen, Schutz ungespeicherter Entwürfe/Einstellungen und eine verzögerte, abbrechbare Wissenssuche. Kategorien bleiben bei der Suche ausgewählt.

## Zugriff, Dateien und Betrieb

- Externe IdP-JWTs sind von internen Sitzungen getrennt. Tokenzweck, Signaturverfahren, Aussteller, Zielgruppe und Ablauf werden passend zum jeweiligen Verfahren geprüft. Rollen kommen bei jeder Anfrage aus der aktuellen Datenbank. Logout widerruft die Sitzungen des Kontos; gelöschte Konten verlieren den Zugriff.
- Magic Links sind einmalig und 30 Minuten gültig. Der frühere öffentliche Testtoken-Endpunkt liefert 404.
- Gastzugriff erfordert ein zufälliges HttpOnly-Geheimnis. Chat-ID, E-Mail-Angabe und clientseitige Rollen-/Präsenzparameter gewähren keine Rechte. Initialabruf, Sync, SSE und Downloads prüfen dieselben Eigentumsregeln. Interne Notizen und Anhänge bleiben Mitarbeitern vorbehalten.
- Private Anhänge liegen außerhalb von `public`; Dateiendung, Inhaltssignatur und Größe werden geprüft. Downloads verwenden sichere Header. Bestehende Dateien werden verschoben; alte URLs laufen vor der statischen Dateiprüfung durch die berechtigte Downloadroute.
- Markdown-Ausgaben werden zentral bereinigt. Aktive HTML-Inhalte und unsichere Linkprotokolle werden entfernt.
- Die E-Mail-Warteschlange markiert nur erfolgreichen Versand als erledigt. Eine Datenbanksperre schützt parallele Verarbeitung; Fehlschläge erhalten Wiederholungsversuche mit Wartezeit und gespeichertem Fehler.
- Updates bauen in einem getrennten Release mit eigener Build-Datenbank. Ein separater Prozess aktiviert das Release, startet PM2 neu, prüft den Start und stellt bei Fehlern den vorherigen Symlink wieder her. Bestehende Direktinstallationen benötigen dafür zunächst die dokumentierte Release-Struktur.
- Node 22, lokale URL `/helpdesk`, zentrale App-URL und persistente Daten-/Uploadverzeichnisse sind dokumentiert. Der Windows-Teststarter verwendet `npm ci` und öffnet die richtige Unteradresse.

## Durchgeführte Prüfungen

Die temporären Prüfskripte und künstlichen Daten liegen außerhalb des Repositorys und gehören nicht zum Produktivcommit.

| Prüfung | Ergebnis |
| --- | --- |
| 52 HTTP-Integrationstests gegen den Produktionsserver | Bestanden |
| 23 gezielte Prüfungen für Gruppen, Paste-Logik, Dateigrenzen, Markdown, Nachrichten-Zusammenführung, Migration und fehlgeschlagenen Release-Build | Bestanden |
| Release-Aktivierung und Rollback nach fehlgeschlagenem Neustart mit simuliertem PM2 | Beide bestanden |
| Start und Migration alter öffentlicher Uploads einschließlich ursprünglicher URL und unberechtigtem Abruf | Bestanden |
| ESLint | 0 Fehler; 28 Hinweise verbleiben, u. a. zu Hook-Abhängigkeiten und Bilddarstellung |
| Produktionsbuild unter Node 22, auch mit vollständig frischem Datenverzeichnis | Bestanden |
| Git-Diff-Prüfung | Keine Whitespace-Fehler |

Die HTTP-Tests umfassen unter anderem fremde IDs, manipulierte Rollen, interne Anhänge in Sync/SSE, Gastangaben mit bereits vorhandener Kontoadresse, echte E-Mail-/IdP-Sitzungstypen, Tokenwiederverwendung, Rollenentzug, Löschung eines Kontos, manuelle Tickets im Auftrag, fehlgeschlagenen SMTP-Versand und parallele Wiederholung. Gemini wurde durch eine lokale Antwortsimulation ersetzt, um die übertragenen Inhalte und das Ausbleiben unerlaubter KI-Aufrufe zu prüfen. SMTP lief gegen einen lokalen Testserver.

Der Build meldet weiterhin nicht blockierende Turbopack-Hinweise zur Dateiverfolgung bei dynamischen Uploadpfaden. Eine Kontrolle der Trace-Manifeste fand keine Referenzen auf die Laufzeitdatenbank oder Uploaddateien.

## Vor produktiver Freigabe

Noch nicht praktisch geprüft sind echte Betriebssystem-Zwischenablagen und Darstellung/Bedienung in den Zielbrowsern, das reale Schulportal, der produktive SMTP-Server, ein tatsächlicher Gemini-Dialog sowie PM2 auf dem Zielserver. Die synthetischen Paste-Prüfungen ersetzen keine Browser-Abnahme.

Vor dem Rollout Datenbank, Uploads und Konfiguration sichern. Bestehende Sitzungen und alte Magic Links werden ungültig; Nutzer müssen sich neu anmelden. Historische Verifikation bleibt unbekannt, historische Chats/Tickets bleiben ohne KI. Details zur Einrichtung und Rückkehr zur vorherigen Version stehen in `deployment.md`, die Anmelderegeln in `auth.md`.

Die Änderungen sind lokal vorbereitet. GitHub-Veröffentlichung und produktives Deployment sind separate Schritte.

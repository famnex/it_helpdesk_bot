# Dokumentation: Device Fingerprinting & Vollbild-Sperrbildschirm (Lockout Screen)

Diese Dokumentation beschreibt die Funktionsweise und den Schutzmechanismus des **Device Fingerprinting Systems** sowie des **Vollbild-Sperrbildschirms (Full Page Lockout Screen)**.

---

## 1. Schutz vor IP-Kollateralschäden (Apple Private Relay)

1. **Client-seitige Identifizierung**: Der Browser generiert aus stabilen Systemkomponenten (Bildschirmauflösung, Farbtiefe, Zeitzone, Hardwarekomponenten, Sprachen) sowie einer dauerhaften UUID im `localStorage` einen eindeutigen Device Fingerprint (z. B. `fp_a8f9d3b1_c8d9e0f1`).
2. **Übermittlung**: Der Fingerprint wird bei jeder Chat-Interaktion im Header `X-Device-Fingerprint` übermittelt.
3. **Verstoß-Erfassung**: Wird ein Chat wegen Missbrauchs geflaggt, erfasst `recordAbuseViolation` den Verstoß primär auf den **Device Fingerprint**.
4. **Bypass für geteilte IPs (Apple Private Relay / Whitelisted ASNs)**:
   - Gehört die IP zu Apple Private Relay oder einer whitelisted AS-Nummer, wird **niemals** die gesamte IP gesperrt.
   - Es wird ausschließlich das betroffene Gerät (Device Fingerprint) gesperrt. Unbeteiligte Nutzer auf derselben Relay-IP surfen ungehindert weiter.

---

## 2. Vollbild-Sperrbildschirm (Full Page Lockout Screen)

Um zu verhindern, dass geblockte Nutzer (z. B. bei langsamen Verbindungen) den Chat sehen oder weiterhin Nachrichten absenden können, erzwingt die Anwendung folgende Sicherheitsstufen:

1. **Lade-Zustand (`isLoadingInitialCheck`)**:
   - Beim Laden der Seite wird der Chatbereich und das Eingabefeld **nicht im DOM gerendert**.
   - Der Server prüft den Ban-Status des übermittelten `X-Device-Fingerprint` und der IP-Adresse.

2. **Vollbild-Ausschluss bei Sperre (`isIpBanned`)**:
   - Ist das Gerät gesperrt, greift ein **Early Return** im Frontend.
   - Das gesamte Chat-Interface (Nachrichtenverlauf, Textfeld, Buttons, Bild-Uploads) wird **vollständig aus dem DOM entfernt**.
   - Anstelle des Chats wird ein nicht umgehbarer Vollbild-Sperrbildschirm angezeigt mit:
     - Hinweistext zur Geräte-Sperre
     - Ablaufzeit der Sperre
     - Device-ID Fingerprint
     - Option für Mitarbeiter-Login (Staff-Bypass)

3. **Pre-Send-Guard in `handleSend`**:
   - Versucht ein Nutzer vor der Fertigstellung der Abfrage eine Nachricht abzusenden, bricht `handleSend` sofort ab.

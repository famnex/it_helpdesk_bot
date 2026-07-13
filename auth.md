# Authentifizierungs-Dokumentation (JWT & Setup)

Dieses Dokument beschreibt die Funktionsweise der Authentifizierung im IT-Helpdesk, die auf JSON Web Tokens (JWT) basiert, sowie den Prozess der Ersteinrichtung (Setup).

---

## 1. Ersteinrichtung (Setup-Prozess)
Wenn die Anwendung mit einer leeren Datenbank oder ohne konfigurierten Administrator gestartet wird, greift die automatische Setup-Erkennung.

### Ablauf:
1. Der API-Endpunkt `/api/setup` prüft per `GET`, ob ein Benutzer mit der Rolle `'admin'` existiert.
2. Falls nein, leitet das Frontend (`/` und `/login`) den Benutzer automatisch auf die Seite `/setup` um.
3. Auf `/setup` gibt der Betreiber Folgendes an:
   * **Admin E-Mail-Adresse:** Die primäre E-Mail des System-Administrators.
   * **Admin Name (optional):** Der Anzeigename des Administrators.
   * **JWT Secret:** Ein Schlüssel zur Signierung der JWTs (wird standardmäßig sicher und zufällig generiert).
4. Nach dem Absenden:
   * Wird der Admin-User in der Tabelle `users` angelegt.
   * Wird das JWT Secret in den `settings` unter dem Schlüssel `idp_config` gespeichert.
   * Wird eine direkte Anmeldesession erstellt und der Benutzer an `/admin` weitergeleitet.

---

## 2. Token-basiertes Session-Management (JWT)
Nach erfolgreichem Login wird dem Browser ein verschlüsseltes Session-Cookie übergeben.

### Cookie-Spezifikationen:
* **Name:** `session`
* **Inhalt:** Ein mit dem konfigurierten JWT Secret signierter JWT.
* **Payload:**
  ```json
  {
    "id": "admin-123456",
    "email": "admin@schule.de",
    "role": "admin"
  }
  ```
* **Gültigkeit:** 7 Tage (Erneuerung bei Aktivität bzw. neuem Login).
* **Flags:** `httpOnly: true`, `secure: true` (in Produktion), `sameSite: 'lax'`, `path: '/'`.

---

## 3. Schnittstellen-Authentifizierung (API-Tokens)
Um die API des IT-Helpdesks von externen Systemen oder Clients (z. B. Postman, curl, externe Support-Tools) aufzurufen, wird der `Authorization`-Header unterstützt.

### Verwendung:
Jede Next.js API-Route, die die Funktion `getSessionUser()` aufruft, prüft automatisch:
1. Ob ein gültiges `session`-Cookie existiert.
2. Falls nicht, ob ein `Authorization: Bearer <token>` Header mit einem gültigen, signierten JWT übergeben wurde.

Dies ermöglicht nahtlose Integrationsszenarien, ohne auf Cookies angewiesen zu sein.

---

## 4. Auto-Login über URL-Parameter
Für die Integration in Portale oder Lernplattformen (LMS) kann ein signierter JWT-Token direkt über die URL übergeben werden:
`http://localhost:3000/?token=<JWT>` oder `http://localhost:3000/login?token=<JWT>`

Das Frontend erkennt den Parameter `token`, leitet die Anfrage an `/api/auth/callback?token=...` weiter, verifiziert den Token, erstellt das Session-Cookie und meldet den Benutzer ohne manuelle Passworteingabe oder Klicks an.

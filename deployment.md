# Produktions-Deployment Anleitung: Schul-Support KI

Diese Anleitung beschreibt Schritt für Schritt, wie der IT-Helpdesk auf dem Produktivserver unter der Adresse `https://cloud.mso-hef.de/helpdesk` mit `pm2` und einem Nginx-Reverse-Proxy installiert und gestartet wird.

---

## Voraussetzungen
Stelle sicher, dass folgende Software auf dem Server installiert ist:
* **Node.js** (Version 18.x oder 20.x empfohlen)
* **npm** (wird mit Node geliefert)
* **PM2** (Prozess-Manager, global installiert)
* **Nginx** (Webserver & Reverse Proxy)

---

## Schritt 1: Dateien auf den Server übertragen
Kopiere das gesamte Projektverzeichnis (`it_helpdesk`) auf den Server in das gewünschte Verzeichnis (z. B. `/var/www/it_helpdesk`).
*Hinweis: Der Ordner `node_modules` und die Datei `database.db` sollten NICHT mitkopiert werden, da Abhängigkeiten auf dem Server frisch installiert werden müssen und die Datenbank leer starten soll.*

---

## Schritt 2: Abhängigkeiten installieren
Navigiere in das Projektverzeichnis auf dem Server und installiere die node-Module:
```bash
npm install
```
*Da `better-sqlite3` native C++ Bindungen kompiliert, muss dieser Befehl zwingend auf der Zielmaschine ausgeführt werden.*

---

## Schritt 3: Anwendung bauen
Führe den Next.js-Build aus, um die optimierte Produktions-Version der Anwendung zu erstellen:
```bash
npm run build
```
Dies bereitet auch die Ordnerstruktur unter dem konfigurierten Subpfad `/helpdesk` vor.

---

## Schritt 4: PM2 Prozess starten
Der Anwendung liegt eine `ecosystem.config.js` bei. Starte die Anwendung mit:
```bash
pm2 start ecosystem.config.js
```

### PM2 Autostart konfigurieren
Damit die Anwendung nach einem Server-Neustart automatisch wieder hochfährt:
```bash
pm2 startup
# (Führe den im Terminal ausgegebenen Befehl aus, um die Autostart-Rechte zu erteilen)
pm2 save
```

---

## Schritt 5: Webserver Reverse Proxy konfigurieren (Nginx oder Apache)

### Option A: Apache (HTTPD)
Um Apache als Reverse-Proxy zu konfigurieren, müssen die Proxy-Module aktiviert sein.

1. **Proxy-Module in Apache aktivieren:**
   ```bash
   sudo a2enmod proxy
   sudo a2enmod proxy_http
   sudo systemctl restart apache2
   ```

2. **VirtualHost konfigurieren:**
   Öffne die Apache-Konfigurationsdatei deiner Domain (z. B. `/etc/apache2/sites-available/cloud.mso-hef.de.conf` oder `/etc/apache2/sites-available/000-default-le-ssl.conf` bei Let's Encrypt SSL).
   
   Füge innerhalb des `<VirtualHost *:443>`-Blocks folgende Zeilen ein:
   ```apache
   # Reverse Proxy für den IT-Helpdesk
   ProxyRequests Off
   ProxyPreserveHost On
   
   <Location /helpdesk>
       ProxyPass http://localhost:3005/helpdesk
       ProxyPassReverse http://localhost:3005/helpdesk
   </Location>
   ```

3. **Apache neu laden:**
   ```bash
   sudo apache2ctl configtest
   sudo systemctl reload apache2
   ```

### Option B: Nginx
Falls du Nginx nutzt, öffne die Nginx-Konfigurationsdatei deiner Domain (z. B. `/etc/nginx/sites-available/default`) und füge folgenden Location-Block innerhalb des `server`-Blocks hinzu:

```nginx
location /helpdesk {
    proxy_pass http://localhost:3005;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    
    # Header für korrekte Protokoll- und IP-Weiterleitung
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Teste die Nginx-Konfiguration und lade Nginx neu:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Schritt 6: Ersteinrichtung (Setup)
Nachdem alles läuft, ist der IT-Helpdesk einsatzbereit:
1. Rufe im Browser die URL `https://cloud.mso-hef.de/helpdesk` auf.
2. Du wirst automatisch auf die Ersteinrichtungsseite (`/helpdesk/setup`) weitergeleitet.
3. Gib die E-Mail-Adresse und den Namen des gewünschten Administrators an.
4. Generiere das JWT-Secret (oder passe es an).
5. Klicke auf **Setup fertigstellen & Einloggen**.
6. Das System ist nun vollständig einsatzbereit und du bist direkt im Admin-Dashboard eingeloggt.


## Sichere Aktualisierungen und Datenpfade

Node.js **22 LTS** verwenden (`nvm use`; anschließend `npm ci`). Lokal ist die App unter `http://localhost:3000/helpdesk` erreichbar. `NEXT_PUBLIC_APP_URL` enthält die öffentliche URL einschließlich `/helpdesk`.

Das Web-Update arbeitet ausschließlich mit getrennten Releases. Bestehende Direktinstallationen bleiben startbar; die alte Update-Funktion mit einem Build im laufenden Verzeichnis wurde entfernt. Für den Release-Betrieb einmalig diese Struktur einrichten:

- `/srv/helpdesk/releases/<version>`: unveränderliche Git-Checkouts mit installiertem und gebautem Projekt.
- `/srv/helpdesk/current`: Symlink auf das aktive Release; **PM2 cwd muss `/srv/helpdesk/current` sein**.
- `/srv/helpdesk/shared/database.db`: vorhandene SQLite-Datenbank übernehmen, bei gestopptem Prozess einschließlich eventuell vorhandener WAL/SHM-Dateien.
- `/srv/helpdesk/shared/uploads`: sämtliche bestehenden Uploads aus `public/uploads` und `uploads` übernehmen. Keine Dateien mit gleichem Namen ungeprüft überschreiben.

PM2-Umgebungsvariablen setzen:

```text
HELPDESK_RELEASE_ROOT=/srv/helpdesk
HELPDESK_DATA_DIR=/srv/helpdesk/shared
HELPDESK_UPLOAD_DIR=/srv/helpdesk/shared/uploads
HELPDESK_PM2_NAME=it-helpdesk
```

Vor dem ersten Start eine vollständige Sicherung von Datenbank, Uploads und Konfiguration anlegen. Neue Migrationen ergänzen nur Spalten/Tabellen und sind wiederholbar. Historische Verifikation bleibt `unknown`; historische Chats/Tickets werden ohne KI weitergeführt. Ein neuer KI-Chat erfordert den gewählten KI-Weg. Bestehende Sitzungen und alte unbegrenzte Magic Links werden ungültig: erneut anmelden. Neue Magic Links gelten 30 Minuten und einmalig. Logout widerruft alle Sitzungen desselben Kontos.

Das Update sperrt parallele Durchläufe, validiert den Branchnamen und baut in einem neuen Release mit isolierter Build-Datenbank. Erst nach erfolgreichem Build wird der Symlink atomar umgestellt und PM2 neu gestartet. Eine fehlgeschlagene Vorbereitung verändert das aktive Release nicht. Für einen manuellen Code-Rollback den Symlink auf das vorige Release umstellen und PM2 neu starten. Daten nur aus einer zusammengehörigen Sicherung wiederherstellen; vorher neue seitdem eingegangene Tickets sichern. Ein nach Prozessabbruch verbliebenes `update.lock` darf erst nach Prüfung auf einen tatsächlich noch laufenden Update-Prozess entfernt werden.

Vor produktiver Freigabe Login am echten Schulportal, SMTP-Zertifikate und Versand sowie Zwischenablage unter den tatsächlich eingesetzten Browsern prüfen. Privates Wissen bleibt für Bot-Antworten verfügbar und wird weiterhin nur aus der öffentlichen Wissensliste ausgeblendet.

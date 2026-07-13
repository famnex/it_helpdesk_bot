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

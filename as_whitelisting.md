# Dokumentation: AS-Nummern-Whitelisting (Apple Private Relay)

Diese Dokumentation beschreibt die Funktionsweise und Konfiguration des **AS-Nummern-Whitelisting-Systems** im IT-Helpdesk-Bot.

---

## 1. Hintergrund & Problemstellung

Apple Private Relay leitet den Datenverkehr von Safari- und Apple-Nutzern über zweistufige Relay-Server (u. a. Cloudflare, Fastly, Akamai) um. Externe Sicherheitssysteme wie ProxyCheck.io stufen diese Relay-IP-Adressen häufig als **VPN**, **Proxy** oder mit einem erhöhten **Risk Score** ein.

Damit Apple-Nutzer das Support-System ohne Fehlermeldung oder VPN-Sperre nutzen können, bietet der IT-Helpdesk-Bot ein **Autonomes System (AS) Whitelisting**. IPs, die zu einer freigegebenen AS-Nummer gehören, erhalten uneingeschränkten Zugriff, selbst wenn ProxyCheck.io für die IP ein aktives VPN oder einen hohen Risikowert meldet.

---

## 2. Funktionsweise

1. **Abfrage & Cache**: Bei einer IP-Sicherheitsprüfung wird die Autonome Systemnummer (AS-Nummer, z. B. `AS13335`) von ProxyCheck.io ermittelt und im 30-Tage-SQLite-Cache (`proxycheck_cache.asn`) gespeichert.
2. **Whitelist-Abgleich**: Vor der Anwendung von Sicherheits-Blockregeln (VPN, TOR, Proxy, Compromised, Risk Score) wird geprüft, ob die AS-Nummer der Client-IP in der Liste `whitelistedAsns` enthalten ist.
3. **Ausnahme-Erteilung**: Bei einer Übereinstimmung wird der Zugriff sofort freigegeben (`allowed: true, isAsnWhitelisted: true`).

---

## 3. Empfohlene Standard-AS-Nummern

Für Apple Private Relay und gängige Egress-Provider sind folgende AS-Nummern vorkonfiguriert:

| AS-Nummer | Organisation / Provider | Verwendung bei Apple Private Relay |
| :--- | :--- | :--- |
| `AS13335` | Cloudflare, Inc. | Primärer Egress-Partner für Apple Private Relay |
| `AS54113` | Fastly, Inc. | Egress-Partner für Apple Private Relay |
| `AS20940` | Akamai Technologies | Egress-Partner für Apple Private Relay |
| `AS396982` | Apple Inc. / Partner | Apple Private Relay Infrastruktur |
| `AS714` | Apple Inc. | Hauptnetzwerk Apple Inc. |
| `AS13414` | Apple Inc. | Apple Net |
| `AS36040` | Apple Inc. | Apple Infrastructure |

---

## 4. Admin-Konfiguration

Im Admin-Dashboard unter **Einstellungen -> Security & ProxyCheck.io** finden Administratoren das Feld **AS-Nummern Whitelist**.
- Mehrere AS-Nummern können kommagetrennt, per Zeilenumbruch oder Leerzeichen eingegeben werden (z. B. `AS13335, AS54113, AS20940`).
- Das Präfix `AS` ist optional (`13335` und `AS13335` werden identisch behandelt).
- In der Tabelle **Gecachte IP-Adressen** können AS-Nummern einzelner IPs mit einem Klick auf `"AS [Nr.] whitelisten"` direkt in die Whitelist übernommen werden.

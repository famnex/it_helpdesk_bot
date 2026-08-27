# Dokumentation: Device Fingerprinting & Missbrauchs-Sperren

Diese Dokumentation beschreibt die Funktionsweise und den Schutzmechanismus des **Device Fingerprinting System** gegen Kollateralschäden bei geteilten IP-Adressen (z. B. Apple Private Relay oder Schul-WLAN).

---

## 1. Problemstellung bei IP-Sperren

Bei herkömmlichen IP-Sperren wird bei einem Missbrauchsverstoß (Spam, Beleidigungen, KI-Manipulation) die IP-Adresse des Absenders für 24 Stunden gesperrt.

Bei **Apple Private Relay** leiten Apple-Geräte ihren Datenverkehr über gemeinsame Relay-Server (u. a. Cloudflare, Fastly, Akamai) um. Dadurch nutzen hunderte unbeteiligte Nutzer zeitgleich dieselbe öffentliche Egress-IP-Adresse. Eine reine IP-Sperre würde alle Apple-Nutzer auf dieser IP fälschlicherweise blockieren.

---

## 2. Funktionsweise des Device Fingerprintings

1. **Client-seitige Identifizierung**: Der Browser generiert aus stabilen Systemkomponenten (Bildschirmauflösung, Farbtiefe, Zeitzone, Hardwarekomponenten, Sprachen) sowie einer dauerhaften UUID im `localStorage` einen eindeutigen Device Fingerprint (z. B. `fp_a8f9d3b1_c8d9e0f1`).
2. **Übermittlung**: Der Fingerprint wird bei jeder Chat-Interaktion im Header `x-device-fingerprint` mitsendem.
3. **Verstoß-Erfassung**: Wird ein Chat wegen Missbrauchs geflaggt, erfasst das System den Verstoß primär auf den **Device Fingerprint**.
4. **Bypass für geteilte IPs (Apple Private Relay / Whitelisted ASNs)**:
   - Gehört die IP zu Apple Private Relay oder einer whitelisted AS-Nummer, wird **niemals** die gesamte IP gesperrt.
   - Es wird ausschließlich das betroffene Gerät (Device Fingerprint) gesperrt. Unbeteiligte Nutzer auf derselben Relay-IP surfen ungehindert weiter.

---

## 3. Admin-Verwaltung

Im Admin-Dashboard unter **Sperren & Verwarnungen** können Administratoren:
- Alle aktiven Geräte-Sperren (Fingerprints) und IP-Sperren einsehen.
- Geräte-Fingerprints manuell für 24h, 48h, 7 Tage oder permanent sperren.
- Sperren per Klick auf `"Fingerprint entsperren"` sofort aufheben.

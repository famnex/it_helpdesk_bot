# Anmeldung und Benutzerkontext

Alle unten genannten Anwendungsrouten liegen unter `/helpdesk`.

## Einrichtung und Schulportal

`/api/setup` erlaubt die Anlage des ersten Administrators, solange kein Administrator existiert. Prüfung und Anlage erfolgen in einer Datenbanktransaktion. Die Einrichtung bestätigt keine E-Mail-Adresse.

Das Schulportal leitet zur Route `/api/auth/callback?token=...` weiter. Externe JWTs werden ausschließlich mit dem Schlüssel `idp_config.jwtSecret` und HS256 geprüft. Eine E-Mail-Adresse ist erforderlich; vorhandene Ablaufzeiten werden geprüft. Die externe Rolle `user` entspricht `customer`. Nur die ausdrücklich vereinbarten Rollen `customer`, `agent` und `admin` werden bei einer neuen Benutzeranlage berücksichtigt. Bei bestehenden Konten gilt die aktuell gespeicherte Helpdesk-Rolle.

Der öffentlich erreichbare Testtoken-Endpunkt wurde deaktiviert und antwortet mit 404.

## Interne Sitzung

Das `helpdesk_session`-Cookie enthält einen **signierten**, nicht verschlüsselten JWT. Ein eigener, zufällig erzeugter und persistent gespeicherter Schlüssel `internal_session_secret` trennt interne Sitzungen von externen IdP-Tokens. Der Schlüssel wird nicht über die Einstellungs-API ausgegeben.

Sitzungen enthalten `type=session`, `id`, `version`, `authMethod`, `verifiedAt` und die begrenzte Liste `schoolAffiliations`. Zusätzlich werden `iss=helpdesk`, `aud=helpdesk-session` und eine maximale Laufzeit von sieben Tagen geprüft. Der eigene Cookie-Name verhindert Kollisionen mit alten `session`-Cookies und anderen Anwendungen derselben Domain. Alte generische Cookies werden weder zur Anmeldung verwendet noch beim Logout fremder Anwendungen gelöscht. Nach dieser Umstellung ist eine erneute Anmeldung nötig. Cookie-Eigenschaften: HttpOnly, SameSite=Lax, Pfad `/helpdesk`, Secure im Produktionsmodus.

E-Mail, Name und Rolle werden bei jeder Anfrage aus der aktuellen Benutzerzeile gelesen. Ein gelöschtes Konto ist sofort gesperrt; eine Rollenänderung gilt sofort. Logout erhöht `session_version` und widerruft dadurch alle bestehenden Sitzungen desselben Kontos. Das Gastzugangscookie wird ebenfalls entfernt.

Durch die neue Signaturprüfung sind Sitzungen aus früheren Versionen ungültig. Nach dem Update einmal neu anmelden.

## E-Mail-Anmeldelinks

Magic Links gelten **30 Minuten** und können **einmal** eingelöst werden. Sie verwenden `type=magic_link`, `aud=helpdesk-login`, eine eindeutige `jti` und denselben ausschließlich internen Signaturschlüssel. Die Prüfung und der Verbrauch der Kennung erfolgen transaktional. Alte unbegrenzt gültige Links werden nicht mehr akzeptiert.

Ein Magic Link ist kein API-Bearer-Token. Nach erfolgreicher Einlösung wird eine reguläre Sitzung mit `authMethod=email` angelegt. Dieser Weg steht auch Mitarbeitern für ihre bisherigen E-Mail-Benachrichtigungen zur Verfügung; er wird nicht als Schulportal-Anmeldung ausgewiesen.

## Gastzugriff und Verifikationsanzeige

Gast-Chats besitzen ein zufälliges HttpOnly-Zugriffsgeheimnis; in der Datenbank liegt nur dessen Hash. Eine Chat-ID, angegebene E-Mail-Adresse, IP-Adresse oder ein Fingerprint reicht nicht für den Zugriff. Angemeldete Chats gehören zur geprüften Benutzer-ID. Ein bestätigter Ticketbesitzer kann auch den verknüpften Chat lesen.

Bei der Ticketanlage werden Anmeldemethode, Eigentümer-ID und Bestätigungszeitpunkt gespeichert. Bei einer Anfrage im Auftrag werden ausführender Mitarbeiter und betroffene Person getrennt behandelt.

| Nachweis bei Anlage | Anzeige |
| --- | --- |
| Schulportal-JWT | Schulkonto bestätigt |
| Eingelöster E-Mail-Link | E-Mail bestätigt |
| Nur selbst angegebene Kontaktdaten | Gast · E-Mail unbestätigt |
| Historische Daten ohne belastbaren Nachweis | Verifikation unbekannt |

Eine Benutzerzeile oder ein ID-Präfix ist kein Identitätsnachweis. Der aktuelle Online-Status wird separat angezeigt.

## Schüler- und Lehrerzugehörigkeit für den Bot

Der verifizierte Schulportal-Login wertet ausschließlich diese Gruppen aus:

- `mso_schüler` → `student` / Schüler
- `mso_lehrer` → `teacher` / Lehrer

Vollständige AD-DNs (`CN=mso_lehrer,OU=…`) und reine Gruppennamen werden exakt und unabhängig von Groß-/Kleinschreibung verglichen. Beide Zugehörigkeiten oder eine leere Liste sind möglich. Andere Gruppen verleihen keine Zugehörigkeit; Schüler-/Lehrergruppen verleihen keine Helpdesk-Berechtigung.

Bei jeder regulären KI-Anfrage erhält der Bot Name, E-Mail-Adresse und bekannte Zugehörigkeit aus der geprüften Sitzung. Bekannte Angaben sollen nicht erneut erfragt werden. Weder der JWT noch die vollständige AD-Gruppenliste werden an die KI übertragen. Bei Gästen werden nur fehlende notwendige Angaben erfragt. Im Auftragsmodus wird das Profil des Mitarbeiters nicht als Identität der betroffenen Person verwendet. Eine reine E-Mail-Anmeldung liefert keine AD-Gruppen.

Im direkten Supportmodus findet keine KI-Verarbeitung dieses Verlaufs statt. Der Modus wird an Chat und Ticket gespeichert. Historische Verläufe werden vorsichtig als ohne KI behandelt; ein späterer KI-Dialog erhält einen neuen Verlauf. Privates Wissen bleibt für den Bot verwendbar und wird ausschließlich in der öffentlichen Wissensliste ausgeblendet.

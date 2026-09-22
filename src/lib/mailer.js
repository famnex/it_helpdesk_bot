import nodemailer from 'nodemailer';
import db from './db.js';
import { generateMagicLinkToken } from './auth.js';

import { getBaseAppUrl } from './appUrl';
export { getBaseAppUrl };

/**
 * Formatiert den Absender sauber (inklusive optionalem Anzeigenamen).
 */
export function formatFromAddress(config) {
  const senderEmail = (config.sender || 'support@schule.de').trim();
  const senderName = (config.sender_name || '').trim();

  if (senderEmail.includes('<') && senderEmail.includes('>')) {
    return senderEmail;
  }
  if (senderName) {
    return `"${senderName}" <${senderEmail}>`;
  }
  return senderEmail;
}

/**
 * Holt die aktuelle SMTP-Konfiguration aus der Datenbank.
 */
function getSmtpConfig() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('smtp_config');
    if (row) {
      return JSON.parse(row.value);
    }
  } catch (e) {
    console.error('Fehler beim Laden der SMTP-Konfiguration:', e);
  }
  // Standard-Fallback für Maildev
  return {
    host: 'localhost',
    port: 1025,
    user: '',
    pass: '',
    secure: false,
    sender: 'support@schule.de',
    sender_name: 'IT-Helpdesk'
  };
}

/**
 * Sendet eine E-Mail unter Verwendung der in der DB konfigurierten SMTP-Einstellungen.
 */
export async function sendMail({ to, subject, html, text }, overrideConfig = null, errorOut = null) {
  const config = overrideConfig || getSmtpConfig();
  const isSecure = config.secure === true || config.secure === 'true' || config.secure === 1 || config.secure === '1';
  const port = Number(config.port) || (isSecure ? 465 : 587);
  
  const transporter = nodemailer.createTransport({
    host: config.host || 'localhost',
    port: port,
    secure: isSecure,
    auth: config.user ? {
      user: config.user,
      pass: config.pass
    } : undefined,
    tls: {
      rejectUnauthorized: true
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
  });

  const fromAddress = formatFromAddress(config);

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    html,
    text
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`E-Mail erfolgreich gesendet an ${to} von ${fromAddress}. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Fehler beim E-Mail-Versand an ${to}:`, error);
    if (errorOut) {
      errorOut.error = error;
    }
    return false;
  }
}

/**
 * Informiert den Kunden über die erfolgreiche Erstellung seines Support-Tickets.
 */
export async function sendTicketCreatedNotification(customerEmail, ticketId, ticketTitle) {
  const host = getBaseAppUrl();
  const loginToken = generateMagicLinkToken(customerEmail);
  const link = `${host}/api/auth/magic?token=${loginToken}&redirect=/tickets/${ticketId}`;
  
  const subject = `[IT-Helpdesk] Ihr Ticket ${ticketId} wurde erfolgreich eröffnet`;
  const text = `Hallo,\n\nIhr Support-Ticket "${ticketTitle}" (${ticketId}) wurde erfolgreich bei unserem IT-Support-Team eingereicht.\n\nEin Mitarbeiter wird sich schnellstmöglich darum kümmern.\n\nKlicken Sie auf den folgenden Link, um den Status Ihres Tickets einzusehen:\n\n${link}`;
  const html = `
    <div style="font-family: sans-serif; padding: 24px; color: #f8fafc; max-width: 600px; margin: 0 auto; background-color: #020617; border: 1px solid #1e293b; border-radius: 12px;">
      <h2 style="color: #38bdf8; margin-top: 0; font-size: 20px;">Ticket ${ticketId} eröffnet</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
        Hallo,<br/><br/>
        Ihr Support-Ticket <strong>"${ticketTitle}"</strong> (ID: <span style="font-family: monospace; font-weight: bold; color: #38bdf8;">${ticketId}</span>) wurde erfolgreich bei der IT-Abteilung eingereicht.
      </p>
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        Unser Support-Team wurde benachrichtigt und wird Ihr Anliegen zeitnah bearbeiten.
      </p>
      <div style="margin: 28px 0; text-align: center;">
        <a href="${link}" style="background-color: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
          Ticket im Portal ansehen
        </a>
      </div>
      <p style="color: #64748b; font-size: 11px; margin-top: 20px; border-top: 1px solid #1e293b; padding-top: 15px; text-align: center;">
        Hinweis: Dieser Link meldet Sie automatisch ohne separates Passwort an.
      </p>
    </div>
  `;

  return sendMail({ to: customerEmail, subject, html, text });
}

/**
 * Sendet den Magic-Link für den Kunden-Login.
 */
export async function sendMagicLinkEmail(email, token) {
  const host = getBaseAppUrl();
  const link = `${host}/api/auth/magic?token=${token}`;
  
  const subject = 'Anmeldelink für Schul-Support KI';
  const text = `Hallo,\n\nklicken Sie auf den folgenden Link, um sich anzumelden und Ihre Support-Tickets einzusehen:\n\n${link}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>Anmeldung beim Schul-Support KI</h2>
      <p>Hallo,</p>
      <p>klicken Sie auf den folgenden Button, um sich anzumelden und Ihre Support-Tickets einzusehen:</p>
      <p style="margin: 30px 0;">
        <a href="${link}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Tickets einsehen</a>
      </p>
      <p style="color: #666; font-size: 12px;">Oder kopieren Sie diese URL in Ihren Browser:<br>${link}</p>
    </div>
  `;

  return sendMail({ to: email, subject, html, text });
}

/**
 * Informiert den Kunden über eine neue Antwort eines Agenten.
 */
export async function sendAgentReplyNotification(customerEmail, ticketId, ticketTitle) {
  const host = getBaseAppUrl();
  const loginToken = generateMagicLinkToken(customerEmail);
  const link = `${host}/api/auth/magic?token=${loginToken}&redirect=/tickets/${ticketId}`;
  
  const subject = `Neue Antwort zu Ihrem Ticket ${ticketId}`;
  const text = `Hallo,\n\nein IT-Support-Agent hat auf Ihr Ticket "${ticketTitle}" (${ticketId}) geantwortet.\n\nKlicken Sie auf den folgenden Link, um sich automatisch anzumelden und die Antwort zu lesen:\n\n${link}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #0ea5e9; margin-top: 0;">Neue Antwort zum Ticket ${ticketId}</h2>
      <p>Hallo,</p>
      <p>ein IT-Support-Agent hat auf Ihr Ticket <strong>"${ticketTitle}"</strong> geantwortet.</p>
      <p style="margin: 30px 0;">
        <a href="${link}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; shadow: 0 4px 6px rgba(14, 165, 233, 0.15);">Antwort lesen</a>
      </p>
      <p style="color: #64748b; font-size: 11px; margin-top: 20px; border-t: 1px solid #e2e8f0; padding-top: 15px;">
        Hinweis: Dieser Button meldet Sie automatisch ohne separates Passwort an.
      </p>
    </div>
  `;

  return sendMail({ to: customerEmail, subject, html, text });
}

/**
 * Informiert den Agenten über eine neue Antwort des Kunden.
 */
export async function sendCustomerReplyNotification(agentEmail, ticketId, ticketTitle) {
  const host = getBaseAppUrl();
  const link = `${host}/agent/tickets/${ticketId}`;
  
  const subject = `Kundenantwort zu Ticket ${ticketId}`;
  const text = `Hallo,\n\nder Kunde hat auf das Ticket "${ticketTitle}" (${ticketId}) geantwortet.\n\nKlicken Sie auf den folgenden Link, um das Ticket zu bearbeiten:\n\n${link}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>Kundenantwort zum Ticket ${ticketId}</h2>
      <p>Hallo,</p>
      <p>der Kunde hat auf das Ticket <strong>"${ticketTitle}"</strong> geantwortet.</p>
      <p style="margin: 30px 0;">
        <a href="${link}" style="background-color: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ticket bearbeiten</a>
      </p>
    </div>
  `;

  return sendMail({ to: agentEmail, subject, html, text });
}

export async function sendAssignmentNotification(agentEmail, ticketId, ticketTitle) {
  const host = getBaseAppUrl();
  const loginToken = generateMagicLinkToken(agentEmail);
  const link = `${host}/api/auth/magic?token=${loginToken}&redirect=/agent/tickets/${ticketId}`;
  
  const subject = `Ihnen wurde das Ticket ${ticketId} zugewiesen`;
  const text = `Hallo,\n\nIhnen wurde das Ticket "${ticketTitle}" (${ticketId}) zur Bearbeitung zugewiesen.\n\nKlicken Sie auf den folgenden Link, um das Ticket anzusehen:\n\n${link}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #8b5cf6; margin-top: 0;">Ticket zugewiesen</h2>
      <p>Hallo,</p>
      <p>Ihnen wurde das Ticket <strong>"${ticketTitle}"</strong> (ID: <span style="font-family: monospace; font-weight: bold;">${ticketId}</span>) zur Bearbeitung zugewiesen.</p>
      <p style="margin: 30px 0;">
        <a href="${link}" style="background-color: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ticket im Portal ansehen</a>
      </p>
      <p style="color: #64748b; font-size: 11px; margin-top: 20px; border-t: 1px solid #e2e8f0; padding-top: 15px;">
        Hinweis: Dieser Button meldet Sie automatisch ohne separates Passwort an.
      </p>
    </div>
  `;

  return sendMail({ to: agentEmail, subject, html, text });
}

/**
 * Informiert alle Agenten/Admins über ein neues, unzugewiesenes Ticket.
 */
export async function sendUnassignedTicketNotification(agentEmails, ticketId, ticketTitle) {
  const host = getBaseAppUrl();
  const link = `${host}/agent/tickets/${ticketId}`;
  
  const subject = `Neues unzugewiesenes Ticket: ${ticketId}`;
  const text = `Hallo,\n\nes wurde ein neues Ticket erstellt, das keinem Mitarbeiter direkt zugewiesen werden konnte:\n\n"${ticketTitle}" (${ticketId})\n\nKlicken Sie auf den folgenden Link, um das Ticket anzusehen und zu übernehmen:\n\n${link}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>Neues unzugewiesenes Ticket ${ticketId}</h2>
      <p>Hallo,</p>
      <p>es wurde ein neues Ticket erstellt, das keinem Mitarbeiter direkt zugewiesen werden konnte:</p>
      <p style="margin: 10px 0; font-style: italic; color: #555;">
        "${ticketTitle}"
      </p>
      <p style="margin: 30px 0;">
        <a href="${link}" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ticket ansehen & übernehmen</a>
      </p>
    </div>
  `;

  // Alle Agenten informieren (parallel)
  await Promise.all((agentEmails || []).map(email => sendMail({ to: email, subject, html, text })));
}

/**
 * Informiert den Kunden, dass sein Ticket gelöst/abgeschlossen wurde, und übermittelt die Abschlussnachricht.
 * Enthält 1-Klick-Sternebewertungslinks (1 bis 5 Sterne) direkt in der E-Mail.
 */
export async function sendTicketResolvedNotification(customerEmail, ticketId, ticketTitle, closingMessage) {
  const host = getBaseAppUrl();
  const loginToken = generateMagicLinkToken(customerEmail);
  const link = `${host}/api/auth/magic?token=${loginToken}&redirect=/tickets/${ticketId}`;
  
  const subject = `Ihr Ticket ${ticketId} wurde abgeschlossen`;
  const text = `Hallo,\n\nihr Ticket "${ticketTitle}" (${ticketId}) wurde erfolgreich abgeschlossen.\n\nNachricht unseres Support-Teams:\n${closingMessage}\n\nKlicken Sie auf den folgenden Link, um das Ticket im Portal anzusehen:\n\n${link}\n\nWie zufrieden waren Sie mit unserem Support? Bewerten Sie mit einem Klick:\n1 Stern: ${host}/api/tickets/${ticketId}/rating?score=1&token=${loginToken}\n2 Sterne: ${host}/api/tickets/${ticketId}/rating?score=2&token=${loginToken}\n3 Sterne: ${host}/api/tickets/${ticketId}/rating?score=3&token=${loginToken}\n4 Sterne: ${host}/api/tickets/${ticketId}/rating?score=4&token=${loginToken}\n5 Sterne: ${host}/api/tickets/${ticketId}/rating?score=5&token=${loginToken}`;

  const ratingStarsHtml = [
    { stars: 1, label: '1 Stern' },
    { stars: 2, label: '2 Sterne' },
    { stars: 3, label: '3 Sterne' },
    { stars: 4, label: '4 Sterne' },
    { stars: 5, label: '5 Sterne' }
  ].map(item => {
    const starUrl = `${host}/api/tickets/${ticketId}/rating?score=${item.stars}&token=${loginToken}`;
    return `
      <a href="${starUrl}" style="display: inline-block; margin: 3px; padding: 8px 12px; background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; text-decoration: none; font-size: 15px; color: #facc15; font-weight: bold; text-align: center;">
        ${'★'.repeat(item.stars)}<br/><span style="font-size: 10px; color: #94a3b8; font-weight: normal;">${item.label}</span>
      </a>
    `;
  }).join('');

  const html = `
    <div style="font-family: sans-serif; padding: 24px; color: #f8fafc; max-width: 600px; margin: 0 auto; background-color: #020617; border: 1px solid #1e293b; border-radius: 12px;">
      <h2 style="color: #10b981; margin-top: 0; font-size: 22px;">Ticket abgeschlossen</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5;">Hallo,</p>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5;">Ihr Support-Ticket <strong>"${ticketTitle}"</strong> (ID: <span style="font-family: monospace; font-weight: bold; color: #38bdf8;">${ticketId}</span>) wurde erfolgreich bearbeitet und abgeschlossen.</p>
      
      <div style="background-color: #0f172a; border: 1px solid rgba(14, 165, 233, 0.4); border-left: 4px solid #0284c7; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <strong style="color: #38bdf8; font-size: 13px; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Nachricht unseres Support-Teams:</strong>
        <p style="margin: 0; font-size: 14px; color: #e2e8f0; line-height: 1.6; white-space: pre-wrap;">${closingMessage}</p>
      </div>

      <!-- 1-Klick-Sterne-Bewertung -->
      <div style="background-color: #0b132b; border: 1px solid #1e293b; border-radius: 10px; padding: 18px; margin: 24px 0; text-align: center;">
        <h3 style="color: #f1f5f9; font-size: 15px; margin: 0 0 6px 0;">Wie zufrieden waren Sie mit dem Support?</h3>
        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 14px 0;">Klicken Sie auf Ihre Bewertung (1 Klick, keine Anmeldung erforderlich):</p>
        <div style="text-align: center;">
          ${ratingStarsHtml}
        </div>
      </div>

      <div style="margin: 28px 0; text-align: center;">
        <a href="${link}" style="background-color: #0284c7; color: white; padding: 12px 26px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
          Ticket im Portal ansehen
        </a>
      </div>
      <p style="color: #64748b; font-size: 11px; margin-top: 20px; border-top: 1px solid #1e293b; padding-top: 15px; text-align: center;">
        Hinweis: Die Links melden Sie automatisch ohne separates Passwort an.
      </p>
    </div>
  `;

  return sendMail({ to: customerEmail, subject, html, text });
}

/**
 * Sendet eine Warn-E-Mail an die in der Google Gemini Konfiguration hinterlegte E-Mail-Adresse,
 * wenn Gemini ausfällt oder gestört ist und Anfragen/Tickets beeinträchtigt sind.
 * Beinhaltet einen automatischen Cooldown (30 Minuten), um Postfächer vor E-Mail-Fluten zu schützen.
 */
export async function sendGeminiOutageAlert({ errorMessage, modelName, context = 'Ticket-Erstellung / Chat-Assistent', force = false }) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('gemini_config');
    if (!row || !row.value) return false;

    const config = JSON.parse(row.value);
    const alertEmail = config.alertEmail ? String(config.alertEmail).trim() : '';
    if (!alertEmail || !alertEmail.includes('@')) {
      return false; // Keine gültige Warn-E-Mail hinterlegt
    }

    // Cooldown-Check (30 Minuten)
    if (!force) {
      try {
        const lastAlertRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('last_gemini_alert_at');
        if (lastAlertRow && lastAlertRow.value) {
          const lastAlertTime = parseInt(lastAlertRow.value, 10);
          const cooldownMs = 30 * 60 * 1000;
          if (!isNaN(lastAlertTime) && (Date.now() - lastAlertTime < cooldownMs)) {
            console.log(`[Gemini-Outage-Alert] Cooldown aktiv. Letzte Warnung vor ${Math.round((Date.now() - lastAlertTime) / 60000)} Minuten gesendet.`);
            return false;
          }
        }
      } catch (cdErr) {
        console.error('Fehler beim Prüfen des Alert-Cooldowns:', cdErr);
      }
    }

    // Zeitstempel aktualisieren
    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_gemini_alert_at', ?)").run(String(Date.now()));
    } catch (e) {}

    const host = getBaseAppUrl();
    const settingsLink = `${host}/admin`;

    const subject = `⚠️ WARNUNG: Google Gemini Störung im IT-Helpdesk`;
    const text = `WARNUNG: Google Gemini Störung im IT-Helpdesk

Hallo Administrator,

die Verbindung zur Google Gemini API ist aktuell gestört oder liefert Fehler.
Dadurch können Benutzeranfragen im KI-Assistenten nicht verarbeitet und keine Support-Tickets über die KI angelegt werden.

Details zur Störung:
• Bereich: ${context}
• Modell: ${modelName || 'Standard-Modell'}
• Fehlermeldung: ${errorMessage || 'Unbekannter API-Fehler'}
• Zeitpunkt: ${new Date().toLocaleString('de-DE')}

Bitte prüfe die Google Gemini Einstellungen und den API-Key im Admin-Bereich:
${settingsLink}

Hinweis: Um dein Postfach zu schützen, wird diese Warnmeldung maximal einmal alle 30 Minuten versendet.`;

    const html = `
      <div style="font-family: sans-serif; padding: 25px; color: #1e293b; max-width: 650px; margin: 0 auto; border: 1px solid #fecaca; border-radius: 12px; background-color: #ffffff;">
        <div style="background-color: #fee2e2; border: 1px solid #f87171; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <h2 style="color: #991b1b; margin: 0 0 8px 0; font-size: 18px;">
            ⚠️ Google Gemini Störung gemeldet
          </h2>
          <p style="color: #7f1d1d; margin: 0; font-size: 13px; line-height: 1.5;">
            Die Google Gemini API ist aktuell nicht erreichbar oder liefert Fehler. Dadurch können Benutzeranfragen im KI-Assistenten nicht beantwortet und keine Tickets automatisch erstellt werden.
          </p>
        </div>

        <p style="font-size: 14px; margin-bottom: 15px;">Hallo Administrator,</p>
        <p style="font-size: 14px; line-height: 1.5; color: #334155; margin-bottom: 20px;">
          Bei einer Anfrage an die Google Gemini KI ist soeben ein Fehler aufgetreten:
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 25px; font-size: 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 140px; font-weight: bold;">Betroffener Bereich:</td>
              <td style="padding: 4px 0; color: #0f172a;">${context}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-weight: bold;">Modell:</td>
              <td style="padding: 4px 0; color: #0f172a; font-family: monospace;">${modelName || 'Standard-Modell'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-weight: bold;">Zeitpunkt:</td>
              <td style="padding: 4px 0; color: #0f172a;">${new Date().toLocaleString('de-DE')}</td>
            </tr>
          </table>
          <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #cbd5e1;">
            <strong style="color: #64748b; display: block; margin-bottom: 5px;">Fehlermeldung:</strong>
            <pre style="background-color: #0f172a; color: #f87171; padding: 10px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 11px; margin: 0; white-space: pre-wrap; word-break: break-all;">${errorMessage || 'Unbekannter API-Fehler'}</pre>
          </div>
        </div>

        <p style="margin: 25px 0;">
          <a href="${settingsLink}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; display: inline-block;">
            Gemini-Einstellungen im Admin-Bereich prüfen
          </a>
        </p>

        <p style="color: #94a3b8; font-size: 11px; margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 15px; line-height: 1.4;">
          <strong>Hinweis zum Spamschutz:</strong> Diese Benachrichtigung wird maximal einmal alle 30 Minuten versendet, auch wenn weitere Fehler auftreten.
        </p>
      </div>
    `;

    const success = await sendMail({ to: alertEmail, subject, html, text });
    if (success) {
      console.log(`[Gemini-Outage-Alert] Warn-E-Mail erfolgreich an ${alertEmail} gesendet.`);
    }
    return success;
  } catch (err) {
    console.error('Fehler beim Senden der Gemini-Störungs-Mail:', err);
    return false;
  }
}

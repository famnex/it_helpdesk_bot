import nodemailer from 'nodemailer';
import db from './db';
import { generateMagicLinkToken } from './auth';

/**
 * Ermittelt die Basis-URL des Helpdesks für E-Mail-Links.
 */
export function getBaseAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('idp_config');
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (parsed.appUrl) return parsed.appUrl.replace(/\/$/, '');
    }
  } catch (e) {}

  // Standard für Produktivumgebung an der MSO
  if (process.env.NODE_ENV === 'production') {
    return 'https://cloud.mso-hef.de/helpdesk';
  }
  return 'http://localhost:3000';
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
    sender: 'support@schule.de'
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
      rejectUnauthorized: false
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
  });

  const mailOptions = {
    from: config.sender || 'support@schule.de',
    to,
    subject,
    html,
    text
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`E-Mail erfolgreich gesendet an ${to}. MessageId: ${info.messageId}`);
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
  const loginToken = generateMagicLinkToken(customerEmail, '30d');
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
        Hinweis: Dieser Link meldet Sie automatisch ohne Login an und ist 30 Tage gültig.
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
  const text = `Hallo,\n\nklicken Sie auf den folgenden Link, um sich anzumelden und Ihre Support-Tickets einzusehen:\n\n${link}\n\nDieser Link ist 15 Minuten lang gültig.`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>Anmeldung beim Schul-Support KI</h2>
      <p>Hallo,</p>
      <p>klicken Sie auf den folgenden Button, um sich anzumelden und Ihre Support-Tickets einzusehen:</p>
      <p style="margin: 30px 0;">
        <a href="${link}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Tickets einsehen</a>
      </p>
      <p style="color: #666; font-size: 12px;">Oder kopieren Sie diese URL in Ihren Browser:<br>${link}</p>
      <p>Dieser Link ist 15 Minuten lang gültig.</p>
    </div>
  `;

  return sendMail({ to: email, subject, html, text });
}

/**
 * Informiert den Kunden über eine neue Antwort eines Agenten.
 */
export async function sendAgentReplyNotification(customerEmail, ticketId, ticketTitle) {
  const host = getBaseAppUrl();
  // Generiert einen 30-Tage Auto-Login Token speziell für diesen Benachrichtigungslink
  const loginToken = generateMagicLinkToken(customerEmail, '30d');
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
        Hinweis: Dieser Button meldet Sie automatisch an. Der Link ist aus Sicherheitsgründen 30 Tage gültig.
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
  // Generiert einen 30-Tage Auto-Login Token speziell für diesen Benachrichtigungslink
  const loginToken = generateMagicLinkToken(agentEmail, '30d');
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
        Hinweis: Dieser Button meldet Sie automatisch an. Der Link ist aus Sicherheitsgründen 30 Tage gültig.
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
 * Informiert den Kunden, dass sein Ticket gelöst wurde, und teilt ihm die Lösung mit.
 * Enthält 1-Klick-Sternebewertungslinks (1 bis 5 Sterne) direkt in der E-Mail.
 */
export async function sendTicketResolvedNotification(customerEmail, ticketId, ticketTitle, solution) {
  const host = getBaseAppUrl();
  // Generiert einen 30-Tage Auto-Login Token speziell für diesen Benachrichtigungslink & Direkt-Bewertung
  const loginToken = generateMagicLinkToken(customerEmail, '30d');
  const link = `${host}/api/auth/magic?token=${loginToken}&redirect=/tickets/${ticketId}`;
  
  const subject = `Ihr Ticket ${ticketId} wurde gelöst!`;
  const text = `Hallo,\n\nihr Ticket "${ticketTitle}" (${ticketId}) wurde erfolgreich gelöst.\n\nEingetragene Lösung:\n${solution}\n\nKlicken Sie auf den folgenden Link, um das Ticket anzusehen:\n\n${link}\n\nWie zufrieden waren Sie mit unserem Support? Bewerten Sie mit einem Klick:\n1 Stern: ${host}/api/tickets/${ticketId}/rating?score=1&token=${loginToken}\n2 Sterne: ${host}/api/tickets/${ticketId}/rating?score=2&token=${loginToken}\n3 Sterne: ${host}/api/tickets/${ticketId}/rating?score=3&token=${loginToken}\n4 Sterne: ${host}/api/tickets/${ticketId}/rating?score=4&token=${loginToken}\n5 Sterne: ${host}/api/tickets/${ticketId}/rating?score=5&token=${loginToken}`;

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
      <h2 style="color: #10b981; margin-top: 0; font-size: 22px;">Ticket gelöst!</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5;">Hallo,</p>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5;">Ihr Ticket <strong>"${ticketTitle}"</strong> (ID: <span style="font-family: monospace; font-weight: bold; color: #38bdf8;">${ticketId}</span>) wurde erfolgreich gelöst.</p>
      
      <div style="background-color: #0f172a; border: 1px solid rgba(16, 185, 129, 0.4); border-left: 4px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <strong style="color: #34d399; font-size: 13px; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Bestätigte Lösung:</strong>
        <p style="margin: 0; font-size: 14px; color: #e2e8f0; line-height: 1.6; white-space: pre-wrap;">${solution}</p>
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
        <a href="${link}" style="background-color: #10b981; color: white; padding: 12px 26px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
          Ticket im Portal ansehen
        </a>
      </div>
      <p style="color: #64748b; font-size: 11px; margin-top: 20px; border-top: 1px solid #1e293b; padding-top: 15px; text-align: center;">
        Hinweis: Die Links melden Sie automatisch an und sind 30 Tage gültig.
      </p>
    </div>
  `;

  return sendMail({ to: customerEmail, subject, html, text });
}

import nodemailer from 'nodemailer';
import db from './db';
import { generateMagicLinkToken } from './auth';

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
  
  const transporter = nodemailer.createTransport({
    host: config.host || 'localhost',
    port: config.port || 1025,
    secure: !!config.secure,
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
 * Sendet den Magic-Link für den Kunden-Login.
 */
export async function sendMagicLinkEmail(email, token) {
  const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
  const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
  const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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

/**
 * Informiert einen Agenten über eine Ticket-Zuweisung.
 */
export async function sendAssignmentNotification(agentEmail, ticketId, ticketTitle) {
  const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = `${host}/agent/tickets/${ticketId}`;
  
  const subject = `Ihnen wurde das Ticket ${ticketId} zugewiesen`;
  const text = `Hallo,\n\nIhnen wurde das Ticket "${ticketTitle}" (${ticketId}) zur Bearbeitung zugewiesen.\n\nKlicken Sie auf den folgenden Link, um das Ticket anzusehen:\n\n${link}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>Zuweisung des Tickets ${ticketId}</h2>
      <p>Hallo,</p>
      <p>Ihnen wurde das Ticket <strong>"${ticketTitle}"</strong> zur Bearbeitung zugewiesen.</p>
      <p style="margin: 30px 0;">
        <a href="${link}" style="background-color: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ticket ansehen</a>
      </p>
    </div>
  `;

  return sendMail({ to: agentEmail, subject, html, text });
}

/**
 * Informiert alle Agenten/Admins über ein neues, unzugewiesenes Ticket.
 */
export async function sendUnassignedTicketNotification(agentEmails, ticketId, ticketTitle) {
  const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
 */
export async function sendTicketResolvedNotification(customerEmail, ticketId, ticketTitle, solution) {
  const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  // Generiert einen 30-Tage Auto-Login Token speziell für diesen Benachrichtigungslink
  const loginToken = generateMagicLinkToken(customerEmail, '30d');
  const link = `${host}/api/auth/magic?token=${loginToken}&redirect=/tickets/${ticketId}`;
  
  const subject = `Ihr Ticket ${ticketId} wurde gelöst!`;
  const text = `Hallo,\n\nihr Ticket "${ticketTitle}" (${ticketId}) wurde erfolgreich gelöst.\n\nEingetragene Lösung:\n${solution}\n\nKlicken Sie auf den folgenden Link, um das Ticket anzusehen:\n\n${link}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #10b981; margin-top: 0;">Ticket gelöst!</h2>
      <p>Hallo,</p>
      <p>Ihr Ticket <strong>"${ticketTitle}"</strong> (ID: <span style="font-family: monospace; font-weight: bold;">${ticketId}</span>) wurde erfolgreich gelöst.</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px; margin: 20px 0;">
        <strong style="color: #15803d; font-size: 13px; display: block; margin-bottom: 5px;">Bestätigte Lösung:</strong>
        <p style="margin: 0; font-size: 14px; color: #1e293b; line-height: 1.5; white-space: pre-wrap;">${solution}</p>
      </div>

      <p style="margin: 30px 0;">
        <a href="${link}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">Ticket im Portal ansehen</a>
      </p>
      <p style="color: #64748b; font-size: 11px; margin-top: 20px; border-t: 1px solid #e2e8f0; padding-top: 15px;">
        Hinweis: Dieser Button meldet Sie automatisch an. Der Link ist aus Sicherheitsgründen 30 Tage gültig.
      </p>
    </div>
  `;

  return sendMail({ to: customerEmail, subject, html, text });
}

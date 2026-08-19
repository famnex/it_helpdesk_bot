import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { sendMail } from '@/lib/mailer';
import db from '@/lib/db';

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { smtpConfig, recipientEmail } = await request.json();
    if (!smtpConfig || !recipientEmail) {
      return NextResponse.json({ error: 'SMTP-Konfiguration und Empfänger-E-Mail sind erforderlich.' }, { status: 400 });
    }

    // Wenn das Passwort maskiert ist, das echte aus der DB laden
    if (smtpConfig.pass === '********') {
      const existingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('smtp_config');
      if (existingRow) {
        const existing = JSON.parse(existingRow.value);
        smtpConfig.pass = existing.pass;
      }
    }

    // Wir nutzen die eigentliche Versendemethode der Anwendung um Fehlerquellen auszuschließen!
    const errorOut = {};
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #7c3aed; margin-top: 0;">SMTP-Test erfolgreich</h2>
        <p>Hallo,</p>
        <p>dies ist eine Test-E-Mail zur Verifizierung der SMTP-Einstellungen im Schul-Support KI Helpdesk.</p>
        <p style="color: #10b981; font-weight: bold; font-size: 16px; margin: 20px 0; background-color: #f0fdf4; padding: 12px; border-radius: 8px; border: 1px solid #bbf7d0;">
          ✓ Die Verbindung zum SMTP-Server wurde erfolgreich hergestellt und die Test-E-Mail über den regulären Mail-Kanal übertragen!
        </p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-t: 1px solid #e2e8f0; padding-top: 15px;">
          <strong>Konfigurations-Details:</strong><br>
          • Host: ${smtpConfig.host}:${smtpConfig.port}<br>
          • Benutzer: ${smtpConfig.user || '(keiner)'}<br>
          • Absender: ${smtpConfig.sender_name ? `"${smtpConfig.sender_name}" <${smtpConfig.sender || 'support@schule.de'}>` : (smtpConfig.sender || 'support@schule.de')}<br>
          • SSL/TLS verschlüsselt: ${smtpConfig.secure ? 'Ja' : 'Nein'}
        </p>
      </div>
    `;

    const success = await sendMail({
      to: recipientEmail,
      subject: 'Test-E-Mail vom Schul-Support KI Helpdesk',
      text: 'Hallo,\n\ndies ist eine Test-E-Mail zur Verifizierung der SMTP-Einstellungen im Schul-Support KI Helpdesk.\n\nDie Verbindung wurde erfolgreich hergestellt!',
      html: htmlContent
    }, smtpConfig, errorOut);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      const err = errorOut.error || {};
      return NextResponse.json({
        success: false,
        error: `Fehler beim Versenden über die App-Mailmethode:\n${err.message || err.code || 'Unbekannter SMTP-Fehler'}`
      });
    }
  } catch (err) {
    console.error('Fehler beim Senden der Test-E-Mail:', err);
    return NextResponse.json({ 
      success: false, 
      error: `Kritischer Fehler:\n${err.message || 'Unbekannter Fehler'}` 
    });
  }
}

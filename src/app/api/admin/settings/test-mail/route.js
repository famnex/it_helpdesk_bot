import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSessionUser } from '@/lib/auth';

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

    // Nodemailer Transporter konfigurieren
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host || 'localhost',
      port: smtpConfig.port || 1025,
      secure: !!smtpConfig.secure,
      auth: smtpConfig.user ? {
        user: smtpConfig.user,
        pass: smtpConfig.pass
      } : undefined,
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000
    });

    // Verbindung verifizieren
    try {
      await transporter.verify();
    } catch (verifyErr) {
      return NextResponse.json({ 
        success: false, 
        error: `Verbindungsprüfung zum SMTP-Server fehlgeschlagen:\n${verifyErr.message}` 
      });
    }

    // Test-E-Mail senden
    const info = await transporter.sendMail({
      from: smtpConfig.sender || 'support@schule.de',
      to: recipientEmail,
      subject: 'Test-E-Mail vom Schul-Support KI Helpdesk',
      text: 'Hallo,\n\ndies ist eine Test-E-Mail zur Verifizierung der SMTP-Einstellungen im Schul-Support KI Helpdesk.\n\nDie Verbindung wurde erfolgreich hergestellt!',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #7c3aed; margin-top: 0;">SMTP-Test erfolgreich</h2>
          <p>Hallo,</p>
          <p>dies ist eine Test-E-Mail zur Verifizierung der SMTP-Einstellungen im Schul-Support KI Helpdesk.</p>
          <p style="color: #10b981; font-weight: bold; font-size: 16px; margin: 20px 0; background-color: #f0fdf4; padding: 12px; border-radius: 8px; border: 1px solid #bbf7d0;">
            ✓ Die Verbindung zum SMTP-Server wurde erfolgreich hergestellt und die Test-E-Mail übertragen!
          </p>
          <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-t: 1px solid #e2e8f0; padding-top: 15px;">
            <strong>Konfigurations-Details:</strong><br>
            • Host: ${smtpConfig.host}:${smtpConfig.port}<br>
            • Benutzer: ${smtpConfig.user || '(keiner)'}<br>
            • SSL/TLS verschlüsselt: ${smtpConfig.secure ? 'Ja' : 'Nein'}
          </p>
        </div>
      `
    });

    return NextResponse.json({ 
      success: true, 
      messageId: info.messageId 
    });
  } catch (err) {
    console.error('Fehler beim Senden der Test-E-Mail:', err);
    return NextResponse.json({ 
      success: false, 
      error: `Fehler beim Versenden der E-Mail:\n${err.message || 'Unbekannter SMTP-Fehler'}` 
    });
  }
}

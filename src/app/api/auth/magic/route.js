import { NextResponse } from 'next/server';
import { generateMagicLinkToken, verifyMagicLinkToken, createSession } from '@/lib/auth';
import { sendMagicLinkEmail } from '@/lib/mailer';
import db from '@/lib/db';

/**
 * GET: Verifiziert den Magic-Link Token, meldet den Benutzer an und leitet ihn weiter.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Token fehlt.', { status: 400 });
  }

  const email = verifyMagicLinkToken(token);
  if (!email) {
    return new NextResponse('Ungültiger oder abgelaufener Token.', { status: 400 });
  }

  try {
    // Prüfen, ob der Kunde bereits in der DB existiert, andernfalls anlegen
    let user = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email);
    if (!user) {
      const userId = `usr-${Math.floor(100000 + Math.random() * 900000)}`;
      db.prepare('INSERT INTO users (id, email, role) VALUES (?, ?, ?)').run(userId, email, 'customer');
      user = { id: userId, email, role: 'customer' };
    }

    // Session erstellen
    await createSession(user);

    // Weiterleiten zur gewünschten Seite (z.B. Ticket-Details) oder Standard-Portalseite (Chat)
    const redirectPath = searchParams.get('redirect') || '/';
    const safeRedirect = redirectPath.startsWith('/') ? redirectPath : '/';

    const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${host}${safeRedirect}`);
  } catch (err) {
    console.error('Fehler bei der Magic-Link Anmeldung:', err);
    return new NextResponse('Interner Fehler bei der Anmeldung.', { status: 500 });
  }
}

/**
 * POST: Sendet einen Magic-Link an die übergebene E-Mail-Adresse.
 */
export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'E-Mail-Adresse ist erforderlich.' }, { status: 400 });
    }

    // Magic-Link Token generieren
    const token = generateMagicLinkToken(email);

    // E-Mail senden
    const success = await sendMagicLinkEmail(email, token);
    if (!success) {
      return NextResponse.json({ error: 'Fehler beim E-Mail-Versand.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Anmeldelink wurde per E-Mail gesendet.' });
  } catch (err) {
    console.error('Fehler beim Generieren des Magic-Links:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

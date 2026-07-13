import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '@/lib/auth';

/**
 * POST: Generiert einen mit dem aktuellen Secret signierten JWT für Testzwecke.
 * (Nur für Entwicklung und einfaches Testen)
 */
export async function POST(request) {
  try {
    const { role, email } = await request.json();
    
    if (!role || !email) {
      return NextResponse.json({ error: 'Rolle und E-Mail sind erforderlich.' }, { status: 400 });
    }

    if (!['agent', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Ungültige Rolle.' }, { status: 400 });
    }

    const secret = getJwtSecret();
    const payload = {
      id: `test-${role}-${Math.floor(1000 + Math.random() * 9000)}`,
      email,
      role
    };

    // JWT signieren (Gültig für 1 Stunde)
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });

    return NextResponse.json({ token });
  } catch (err) {
    console.error('Fehler beim Generieren des Test-Tokens:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

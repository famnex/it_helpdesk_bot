import { NextResponse } from 'next/server';
import db, { isSetupRequired } from '@/lib/db';
import { createSession } from '@/lib/auth';
import crypto from 'crypto';

/**
 * GET: Prüft, ob das Setup (Ersteinrichtung) noch erforderlich ist.
 */
export async function GET() {
  const required = isSetupRequired();
  return NextResponse.json({ setupRequired: required });
}

/**
 * POST: Erstellt den ersten Admin-User und schließt das Setup ab.
 */
export async function POST(request) {
  // Falls bereits ein Admin existiert, Setup sperren
  if (!isSetupRequired()) {
    return NextResponse.json(
      { error: 'Setup ist bereits abgeschlossen. Es kann kein weiterer Admin über diesen Weg angelegt werden.' },
      { status: 400 }
    );
  }

  try {
    const { email, name, jwtSecret } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Eine gültige E-Mail-Adresse ist erforderlich.' },
        { status: 400 }
      );
    }

    const adminEmail = email.trim().toLowerCase();
    const adminName = name ? name.trim() : 'Administrator';
    const finalSecret = jwtSecret && jwtSecret.trim() 
      ? jwtSecret.trim() 
      : crypto.randomBytes(32).toString('hex');

    // 1. Admin-User in der Datenbank anlegen
    const adminId = `admin-${crypto.randomInt(100000, 999999)}`;
    
    db.prepare(`
      INSERT INTO users (id, email, role, name) 
      VALUES (?, ?, 'admin', ?)
    `).run(adminId, adminEmail, adminName);

    // 2. JWT-Konfiguration aktualisieren
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('idp_config');
    let idpConfig = {};
    if (row) {
      idpConfig = JSON.parse(row.value);
    }
    
    idpConfig.jwtSecret = finalSecret;
    
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run('idp_config', JSON.stringify(idpConfig));

    // 3. Admin-Session erstellen (direkter Login)
    const adminUser = {
      id: adminId,
      email: adminEmail,
      role: 'admin'
    };
    
    await createSession(adminUser);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler bei der Ersteinrichtung (Setup):', err);
    return NextResponse.json(
      { error: 'Interner Serverfehler bei der Ersteinrichtung.' },
      { status: 500 }
    );
  }
}

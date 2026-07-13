import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET: Einstellungen laden (Sicherheitskritische Felder maskiert)
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const config = {};

    rows.forEach(r => {
      let val = JSON.parse(r.value);
      
      // Passwörter und Secrets maskieren
      if (r.key === 'smtp_config' && val.pass) {
        val.pass = '********';
      }
      if (r.key === 'idp_config' && val.jwtSecret) {
        val.jwtSecret = '********';
      }
      if (r.key === 'gemini_config' && val.apiKey) {
        val.apiKey = '********';
      }
      
      config[r.key] = val;
    });

    return NextResponse.json({ config });
  } catch (err) {
    console.error('Fehler beim Laden der Einstellungen:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

/**
 * POST: Einstellungen speichern
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { smtp_config, idp_config, github_config, gemini_config } = await request.json();
    const saveStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    if (smtp_config) {
      // Existierende Konfiguration für Passwort-Abgleich laden
      const existingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('smtp_config');
      if (existingRow) {
        const existing = JSON.parse(existingRow.value);
        if (smtp_config.pass === '********') {
          smtp_config.pass = existing.pass; // Altes Passwort beibehalten
        }
      }
      saveStmt.run('smtp_config', JSON.stringify(smtp_config));
    }

    if (idp_config) {
      const existingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('idp_config');
      if (existingRow) {
        const existing = JSON.parse(existingRow.value);
        if (idp_config.jwtSecret === '********') {
          idp_config.jwtSecret = existing.jwtSecret; // Altes Secret beibehalten
        }
      }
      saveStmt.run('idp_config', JSON.stringify(idp_config));
    }

    if (github_config) {
      saveStmt.run('github_config', JSON.stringify(github_config));
    }

    if (gemini_config) {
      const existingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('gemini_config');
      if (existingRow) {
        const existing = JSON.parse(existingRow.value);
        if (gemini_config.apiKey === '********') {
          gemini_config.apiKey = existing.apiKey; // Alten API-Key beibehalten
        }
      }
      saveStmt.run('gemini_config', JSON.stringify(gemini_config));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Speichern der Einstellungen:', err);
    return NextResponse.json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
}

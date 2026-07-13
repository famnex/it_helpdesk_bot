import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import db from '@/lib/db';

export async function POST() {
  await destroySession();

  let redirectUrl = null;
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('idp_config');
    if (row) {
      const config = JSON.parse(row.value);
      if (config.logoutRedirectUrl) {
        redirectUrl = config.logoutRedirectUrl;
      }
    }
  } catch (e) {
    // Ignorieren
  }

  return NextResponse.json({ success: true, redirectUrl });
}

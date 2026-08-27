import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { addIpToWhitelist } from '@/lib/proxycheck';

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { ip } = await request.json();
    if (!ip) {
      return NextResponse.json({ error: 'Keine IP-Adresse übergeben.' }, { status: 400 });
    }

    const result = addIpToWhitelist(ip);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Fehler beim Hinzufügen zur Whitelist.' }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Fehler beim Übertragen auf Whitelist:', err);
    return NextResponse.json({ error: 'Interner Serverfehler beim Whitelisting.' }, { status: 500 });
  }
}

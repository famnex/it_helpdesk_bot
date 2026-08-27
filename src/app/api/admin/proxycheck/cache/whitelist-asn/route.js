import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { addAsnToWhitelist } from '@/lib/proxycheck';

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { asn } = await request.json();
    if (!asn) {
      return NextResponse.json({ error: 'Keine AS-Nummer übergeben.' }, { status: 400 });
    }

    const result = addAsnToWhitelist(asn);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Fehler beim Hinzufügen der AS-Nummer zur Whitelist.' }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Fehler beim Whitelisten der AS-Nummer:', err);
    return NextResponse.json({ error: 'Interner Serverfehler beim AS-Whitelisting.' }, { status: 500 });
  }
}

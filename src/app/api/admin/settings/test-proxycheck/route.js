import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { testProxyCheckApiKey, getProxyCheckConfig } from '@/lib/proxycheck';
import db from '@/lib/db';

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { apiKey } = await request.json();
    let effectiveKey = apiKey;

    if (effectiveKey === '********' || !effectiveKey) {
      const config = getProxyCheckConfig();
      effectiveKey = config.apiKey;
    }

    if (!effectiveKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Bitte gib zuerst einen ProxyCheck.io API-Key ein.' 
      }, { status: 400 });
    }

    const result = await testProxyCheckApiKey(effectiveKey);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Fehler beim Testen des ProxyCheck.io API-Keys:', err);
    return NextResponse.json({ 
      success: false, 
      error: 'Interner Serverfehler beim Testen der ProxyCheck.io-Verbindung.' 
    }, { status: 500 });
  }
}

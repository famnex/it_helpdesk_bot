import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getAllCachedIps, deleteCachedIp, clearCache } from '@/lib/proxycheck';

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const data = getAllCachedIps();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Fehler beim Abrufen des ProxyCheck-Caches:', err);
    return NextResponse.json({ error: 'Fehler beim Laden des Caches.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    
    if (body.ip) {
      const deleted = deleteCachedIp(body.ip);
      return NextResponse.json({ success: true, deleted, ip: body.ip });
    }

    if (body.mode) {
      const count = clearCache(body.mode);
      return NextResponse.json({ success: true, count, mode: body.mode });
    }

    return NextResponse.json({ error: 'Ungültige Anfrage. Parameter ip oder mode fehlt.' }, { status: 400 });
  } catch (err) {
    console.error('Fehler beim Löschen im ProxyCheck-Cache:', err);
    return NextResponse.json({ error: 'Fehler beim Löschen im Cache.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { generateDetailedDescription } from '@/lib/gemini';

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { title, fact } = await request.json();
    if (!title || !fact) {
      return NextResponse.json({ error: 'Titel und Fakt sind erforderlich.' }, { status: 400 });
    }

    const description = await generateDetailedDescription(title, fact);
    return NextResponse.json({ description });

  } catch (err) {
    console.error('Fehler bei der KI-Beschreibungserzeugung:', err);
    return NextResponse.json({ error: 'Interner Serverfehler bei der Beschreibungserstellung.' }, { status: 500 });
  }
}

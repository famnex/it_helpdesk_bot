import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { testGeminiConnection } from '@/lib/gemini';

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { apiKey, chatModel, extractionModel } = await request.json();

    const result = await testGeminiConnection({
      apiKey,
      chatModel,
      extractionModel
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Fehler beim Testen der Gemini-Verbindung:', err);
    return NextResponse.json({
      success: false,
      error: 'Interner Serverfehler beim Testen der Google Gemini Verbindung.',
      details: err.message
    }, { status: 500 });
  }
}

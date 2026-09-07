import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getAvailableGeminiModels } from '@/lib/gemini';

export async function GET(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('apiKey');

    const result = await getAvailableGeminiModels(apiKey);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Fehler beim Abrufen der Gemini-Modelle:', err);
    return NextResponse.json({
      success: false,
      error: 'Interner Fehler beim Abrufen der Gemini-Modelle.',
      details: err.message
    }, { status: 500 });
  }
}

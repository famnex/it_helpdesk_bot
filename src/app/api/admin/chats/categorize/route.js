import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { categorizeChats } from '@/lib/categorizer';

/**
 * POST: Chats in Highspeed-Parallel-Batches einkategorisieren (alle oder nur unkategorisierte).
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === 'all' ? 'all' : 'uncategorized';

    const result = await categorizeChats({ mode, totalLimit: 500, batchSize: 30, concurrency: 3 });
    return NextResponse.json({
      success: true,
      mode,
      processedCount: result.processedCount,
      remainingCount: result.remainingCount,
      durationMs: result.durationMs
    });
  } catch (err) {
    console.error('Fehler bei manueller Chat-Kategorisierung:', err);
    return NextResponse.json({ error: 'Fehler bei der Kategorisierung.' }, { status: 500 });
  }
}

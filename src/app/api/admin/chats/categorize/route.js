import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { categorizeUncategorizedChats } from '@/lib/categorizer';

/**
 * POST: Bisherige unkategorisierte Chats in Highspeed-Parallel-Batches einkategorisieren.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const result = await categorizeUncategorizedChats(300, 30, 3);
    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      remainingCount: result.remainingCount,
      durationMs: result.durationMs
    });
  } catch (err) {
    console.error('Fehler bei manueller Chat-Kategorisierung:', err);
    return NextResponse.json({ error: 'Fehler bei der Kategorisierung.' }, { status: 500 });
  }
}

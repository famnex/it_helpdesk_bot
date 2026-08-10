import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { categorizeUncategorizedChats } from '@/lib/categorizer';

/**
 * POST: Bisherige unkategorisierte Chats per KI einkategorisieren.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const result = await categorizeUncategorizedChats(100);
    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      remainingCount: result.remainingCount
    });
  } catch (err) {
    console.error('Fehler bei manueller Chat-Kategorisierung:', err);
    return NextResponse.json({ error: 'Fehler bei der Kategorisierung.' }, { status: 500 });
  }
}

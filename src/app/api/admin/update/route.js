import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import db from '@/lib/db';
import { updateRelease } from '@/lib/updateRelease';
export async function POST() {
  if ((await getSessionUser())?.role !== 'admin') return NextResponse.json({error:'Nicht autorisiert.'},{status:403});
  try {
    const config = JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('github_config')?.value || '{}');
    const result = await updateRelease(config.branch || 'main');
    return NextResponse.json({success:true,message:'Release erfolgreich gebaut. Aktivierung und Startprüfung laufen; der Server startet neu.',log:{build:result.logs}});
  } catch (e) { return NextResponse.json({error:e.message},{status:409}); }
}

export async function GET() {
  if ((await getSessionUser())?.role !== 'admin') return NextResponse.json({error:'Nicht autorisiert.'},{status:403});
  const fs = await import('fs/promises');
  const path = await import('path');
  try { return NextResponse.json(JSON.parse(await fs.readFile(path.join(process.env.HELPDESK_RELEASE_ROOT || '', 'update-status.json'),'utf8'))); }
  catch { return NextResponse.json({state:'idle'}); }
}

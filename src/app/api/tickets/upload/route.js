import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { canAccessTicket } from '@/lib/access';
import { saveAttachment } from '@/lib/uploads';
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({error:'Nicht angemeldet.'},{status:401});
  try {
    const form = await request.formData();
    const ticketId = form.get('ticketId');
    if (ticketId && !await canAccessTicket(ticketId,user)) return NextResponse.json({error:'Kein Zugriff.'},{status:403});
    const file = form.get('file');
    const url = await saveAttachment(file,{user,ticketId});
    return NextResponse.json({success:true,url,filename:file.name});
  } catch (e) { return NextResponse.json({error:e.message},{status:400}); }
}

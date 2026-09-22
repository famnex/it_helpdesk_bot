import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { canAccessChat, canAccessTicket, isStaff } from '@/lib/access';
import { uploadRoot } from '@/lib/uploads';
export async function GET(request, { params }) {
  const parts = (await params).path || [];
  if (parts.length !== 2 || parts.some(p => !p || p === '.' || p === '..' || /[\\/\x00]/.test(p))) return new NextResponse(null,{status:404});
  const [scope,name] = parts;
  const privateScope = ['private','chat','tickets'].includes(scope);
  if (!privateScope && !['avatars','attachments'].includes(scope)) return new NextResponse(null,{status:404});
  let mime, filename = name;
  if (privateScope) {
    const user = await getSessionUser();
    const urls = [`/api/uploads/${scope}/${name}`,`/uploads/${scope}/${name}`,`/helpdesk/api/uploads/${scope}/${name}`,`/helpdesk/uploads/${scope}/${name}`];
    const messages = db.prepare('SELECT ticket_id,is_internal FROM ticket_messages WHERE image_url IN (?,?,?,?)').all(...urls);
    const chats = db.prepare('SELECT chat_id FROM chat_messages WHERE image_url IN (?,?,?,?)').all(...urls);
    let allowed = false;
    for (const m of messages) if ((!m.is_internal || isStaff(user)) && await canAccessTicket(m.ticket_id,user)) allowed = true;
    // An internal attachment must never be exposed through a second public reference.
    if (messages.some(m => m.is_internal) && !isStaff(user)) return new NextResponse(null,{status:403});
    for (const m of chats) if (await canAccessChat(m.chat_id,user)) allowed = true;
    const upload = scope === 'private' ? db.prepare('SELECT * FROM private_uploads WHERE id=?').get(name) : null;
    if (upload) {
      mime = upload.mime; filename = upload.filename;
      // Before sending, only the uploader can preview it.
      if (!messages.length && !chats.length && user && upload.owner_user_id === user.id) allowed = true;
    }
    if (!allowed) return new NextResponse(null,{status:403});
  }
  const candidates = privateScope ? [path.join(uploadRoot(),scope,name)] : [path.join(uploadRoot(),scope,name),path.join(process.cwd(),'public','uploads',scope,name)];
  const file = candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!file) return new NextResponse(null,{status:404});
  mime ||= ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'})[path.extname(name).toLowerCase()] || 'application/octet-stream';
  return new NextResponse(fs.readFileSync(file), {headers:{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${mime.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`,'Cache-Control':privateScope ? 'private, no-store' : 'public, max-age=3600'}});
}

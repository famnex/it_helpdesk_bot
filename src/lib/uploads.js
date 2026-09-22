import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import db from './db';
import { attachmentError } from './attachments';
const defaultUploadRoot = path.join(/* turbopackIgnore: true */ process.cwd(), 'uploads');
export const uploadRoot = () => process.env.HELPDESK_UPLOAD_DIR || (process.env.HELPDESK_DATA_DIR ? path.join(process.env.HELPDESK_DATA_DIR, 'uploads') : defaultUploadRoot);
export async function saveAttachment(file, { user, chatId = null, ticketId = null }) {
  const error = attachmentError(file);
  if (error) throw new Error(error);
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name).toLowerCase();
  const starts = hex => buffer.subarray(0, hex.length / 2).equals(Buffer.from(hex,'hex'));
  const valid = {
    '.png': starts('89504e470d0a1a0a'), '.jpg': starts('ffd8ff'), '.jpeg': starts('ffd8ff'),
    '.gif': /^GIF8[79]a/.test(buffer.subarray(0,6).toString()),
    '.webp': buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP',
    '.pdf': buffer.toString('ascii',0,5) === '%PDF-', '.doc': starts('d0cf11e0a1b11ae1'),
    '.docx': starts('504b0304'), '.xlsx': starts('504b0304'),
    '.txt': !buffer.includes(0), '.csv': !buffer.includes(0)
  };
  if (!valid[ext]) throw new Error('Dateiinhalt und Dateityp passen nicht zusammen.');
  const mime = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf'})[ext] || 'application/octet-stream';
  const id = randomUUID() + ext;
  fs.mkdirSync(path.join(/* turbopackIgnore: true */ uploadRoot(),'private'), { recursive:true });
  fs.writeFileSync(path.join(/* turbopackIgnore: true */ uploadRoot(),'private',id),buffer,{flag:'wx'});
  db.prepare('INSERT INTO private_uploads (id,filename,mime,owner_user_id,chat_id,ticket_id) VALUES (?,?,?,?,?,?)').run(id,path.basename(file.name),mime,user?.id || null,chatId,ticketId);
  return `/api/uploads/private/${id}`;
}
export function mayAttach(url, user, ticketId) {
  if (!url) return true;
  const id = url.replace(/^\/helpdesk/, '').match(/^\/api\/uploads\/private\/([^/]+)$/)?.[1];
  const row = id && db.prepare('SELECT * FROM private_uploads WHERE id=?').get(id);
  return !!row && row.owner_user_id === user?.id && (!row.ticket_id || row.ticket_id === ticketId);
}
// Move legacy private files away from Next's public directory before requests are served.
export function migrateLegacyUploads() {
  for (const scope of ['chat','tickets','avatars','attachments']) {
    const source = path.join(/* turbopackIgnore: true */ process.cwd(),'public','uploads',scope);
    if (!fs.existsSync(source)) continue;
    const target = path.join(/* turbopackIgnore: true */ uploadRoot(),scope);
    fs.mkdirSync(target,{recursive:true});
    for (const name of fs.readdirSync(source)) {
      const old = path.join(source,name), dest = path.join(target,name);
      if (!fs.statSync(old).isFile()) continue;
      if (fs.existsSync(dest)) {
        if (!fs.readFileSync(/* turbopackIgnore: true */ old).equals(fs.readFileSync(/* turbopackIgnore: true */ dest))) throw new Error('Upload-Migration: Namenskonflikt');
        fs.unlinkSync(old);
      } else { fs.copyFileSync(old,dest,fs.constants.COPYFILE_EXCL); fs.unlinkSync(old); }
    }
  }
}

export function withAttachmentMetadata(message) {
  const id = message.imageUrl?.split('/').pop();
  const file = id && db.prepare('SELECT filename,mime FROM private_uploads WHERE id=?').get(id);
  return file ? {...message,attachmentName:file.filename,attachmentMime:file.mime} : message;
}

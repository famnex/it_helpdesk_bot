import { createHash } from 'crypto';
import db from './db';
import { getSessionUser } from './auth';
import { guestHash } from './access';
// A lost response can be replayed without repeating messages, AI calls or ticket creation.
export function idempotent(handler) {
  return async (request, context) => {
    const key = request.headers.get('idempotency-key');
    if (!key) return handler(request,context);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(key)) return Response.json({error:'Ungültige Anfragekennung.'},{status:400});
    const user = await getSessionUser();
    const owner = user ? `${user.id}:${user.session_version}:${user.role}` : await guestHash(true);
    const scope = `${owner}:${new URL(request.url).pathname}`;
    // Multipart boundaries change on retries; hash canonical fields and file bytes.
    const digest = createHash('sha256');
    if (request.headers.get('content-type')?.includes('multipart/')) {
      const entries = [...(await request.clone().formData()).entries()].sort(([a],[b]) => a.localeCompare(b));
      for (const [name,value] of entries) {
        digest.update(JSON.stringify([name,typeof value === 'string' ? value : [value.name,value.type,value.size]]));
        if (typeof value !== 'string') digest.update(Buffer.from(await value.arrayBuffer()));
      }
    } else digest.update(Buffer.from(await request.clone().arrayBuffer()));
    const hash = digest.digest('hex');
    const existing = db.prepare('SELECT response FROM request_receipts WHERE scope=? AND request_id=?').get(scope,key);
    if (existing) {
      if (!existing.response) return Response.json({error:'Diese Nachricht wird noch verarbeitet. Bitte den Verlauf aktualisieren.'},{status:409});
      const saved = JSON.parse(existing.response);
      if (hash && saved.hash && hash !== saved.hash) return Response.json({error:'Anfragekennung gehört zu einem anderen Entwurf.'},{status:409});
      return new Response(saved.body,{status:saved.status,headers:{'Content-Type':'application/json'}});
    }
    db.prepare('INSERT INTO request_receipts(scope,request_id) VALUES (?,?)').run(scope,key);
    try {
      const response = await handler(request,context);
      const body = await response.clone().text();
      db.prepare('UPDATE request_receipts SET response=? WHERE scope=? AND request_id=?').run(JSON.stringify({body,status:response.status,hash}),scope,key);
      return response;
    } catch (e) {
      db.prepare('UPDATE request_receipts SET response=? WHERE scope=? AND request_id=?').run(JSON.stringify({body:JSON.stringify({error:'Verarbeitung unterbrochen. Bitte zuerst den Verlauf aktualisieren.'}),status:500,hash}),scope,key);
      throw e;
    }
  };
}

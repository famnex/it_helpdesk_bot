import { cookies } from 'next/headers';
import { randomBytes, createHash } from 'crypto';
import db from './db';
export const isStaff = user => user?.role === 'agent' || user?.role === 'admin';
export async function guestHash(create = false) {
  const store = await cookies();
  let secret = store.get('helpdesk_guest')?.value;
  if (!secret && create) {
    secret = randomBytes(32).toString('hex');
    store.set('helpdesk_guest', secret, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/helpdesk', maxAge: 604800 });
  }
  return secret ? createHash('sha256').update(secret).digest('hex') : null;
}
export async function canAccessChat(id, user) {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(id);
  if (!chat) return false;
  if (isStaff(user) || (user && chat.owner_user_id === user.id)) return true;
  if (user && db.prepare('SELECT id FROM tickets WHERE chat_id=? AND LOWER(creator_email)=LOWER(?)').get(id,user.email)) return true;
  if (chat.owner_user_id) return false;
  const hash = await guestHash();
  return !!hash && hash === chat.guest_secret_hash;
}
export async function canAccessTicket(id, user) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return false;
  if (isStaff(user)) return true;
  if (user && ticket.creator_email.toLowerCase() === user.email.toLowerCase()) return true;
  return ticket.chat_id ? canAccessChat(ticket.chat_id, user) : false;
}
export async function canAccessRoom(type, id, user) {
  if (typeof id !== 'string') return false;
  if (type === 'dashboard') return isStaff(user);
  if (type === 'chat') return canAccessChat(id,user);
  if (type === 'ticket') return canAccessTicket(id,user);
  return false;
}
export function recordTicketIdentity(ticketId, user, email, onBehalf = false) {
  const verified = user && ['idp','email'].includes(user.authMethod) && !onBehalf && user.email.toLowerCase() === email?.toLowerCase();
  db.prepare('UPDATE tickets SET auth_method=?, owner_user_id=?, verified_at=?, created_by_user_id=?, is_authenticated_creator=? WHERE id=?')
    .run(verified ? user.authMethod : 'guest', verified ? user.id : null, verified ? user.verifiedAt : null, user?.id || null, verified ? 1 : 0, ticketId);
}

import db from './db';
export function getBaseAppUrl() {
  const config = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('idp_config')?.value || '{}');
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || config.appUrl || 'http://localhost:3000/helpdesk');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Ungültige App-URL');
  return `${url.origin}/helpdesk`;
}

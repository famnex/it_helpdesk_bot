import { randomBytes } from 'crypto';

export function migrateSecurity(db) {
  db.transaction(() => {
    const add = (table, name, type) => {
      if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    };
    add('pending_ticket_notifications', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
    add('pending_ticket_notifications', 'processing_until', 'TEXT');
    add('pending_ticket_notifications', 'last_error', 'TEXT');
    add('users', 'session_version', 'INTEGER NOT NULL DEFAULT 0');
    for (const table of ['chats', 'tickets']) {
      add(table, 'owner_user_id', 'TEXT');
      add(table, 'auth_method', "TEXT NOT NULL DEFAULT 'unknown'");
      add(table, 'verified_at', 'TEXT');
      // No consent is inferred for historical conversations.
      add(table, 'ai_enabled', 'INTEGER NOT NULL DEFAULT 0');
    }
    add('ticket_messages', 'chat_message_id', 'INTEGER');
    add('chats', 'guest_secret_hash', 'TEXT');
    add('tickets', 'created_by_user_id', 'TEXT');
    db.exec(`CREATE TABLE IF NOT EXISTS consumed_magic_tokens (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS private_uploads (id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL, owner_user_id TEXT, chat_id TEXT, ticket_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS request_receipts (scope TEXT NOT NULL, request_id TEXT NOT NULL, response TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(scope, request_id));`);
    db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run('internal_session_secret', randomBytes(48).toString('hex'));
  }).immediate();
}

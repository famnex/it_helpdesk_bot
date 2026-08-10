import db from './db';
import { categorizeChatCategory } from './gemini';

let cronInterval = null;

/**
 * Einzelnen Chat kategorisieren und in DB speichern.
 */
export async function categorizeSingleChat(chatId) {
  try {
    const chatMessages = db.prepare(`
      SELECT sender, text FROM chat_messages 
      WHERE chat_id = ? 
      ORDER BY created_at ASC
    `).all(chatId);

    // Alle vorhandenen Kategorien aus der Wissensbasis laden
    const knowledgeCategories = db.prepare(`
      SELECT DISTINCT category FROM knowledge 
      WHERE category IS NOT NULL AND category != ''
    `).all().map(r => r.category);

    const category = await categorizeChatCategory(chatMessages, knowledgeCategories);

    db.prepare(`
      UPDATE chats 
      SET category = ?, categorized_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(category, chatId);

    return category;
  } catch (err) {
    console.error(`Fehler beim Kategorisieren von Chat ${chatId}:`, err);
    db.prepare(`
      UPDATE chats 
      SET category = 'Sonstiges', categorized_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(chatId);
    return 'Sonstiges';
  }
}

/**
 * Durchläuft unkategorisierte Chats und kategorisiert diese per KI.
 */
export async function categorizeUncategorizedChats(limit = 20) {
  try {
    const uncategorizedChats = db.prepare(`
      SELECT id FROM chats 
      WHERE category IS NULL OR category = '' 
      ORDER BY created_at ASC 
      LIMIT ?
    `).all(limit);

    let processedCount = 0;
    for (const chat of uncategorizedChats) {
      await categorizeSingleChat(chat.id);
      processedCount++;
    }

    const remainingRow = db.prepare(`
      SELECT COUNT(*) as count FROM chats 
      WHERE category IS NULL OR category = ''
    `).get();

    return {
      processedCount,
      remainingCount: remainingRow?.count || 0
    };
  } catch (err) {
    console.error('Fehler bei categorizeUncategorizedChats:', err);
    return { processedCount: 0, remainingCount: 0 };
  }
}

/**
 * Startet den 5-Minuten-Cronjob für die automatische Kategorisierung.
 */
export function startCategorizerCron() {
  if (cronInterval) return;
  
  console.log('[Cron] Starte 5-Minuten-Kategorisierungs-Cronjob für Bot-Chats...');
  
  // Erstmaliger Durchlauf nach 10 Sekunden
  setTimeout(() => {
    categorizeUncategorizedChats(10);
  }, 10000);

  // Alle 5 Minuten ausführen (5 * 60 * 1000 ms)
  cronInterval = setInterval(() => {
    console.log('[Cron] Führe automatische 5-Minuten-Chat-Kategorisierung aus...');
    categorizeUncategorizedChats(15);
  }, 5 * 60 * 1000);
}

import db from './db.js';
import { categorizeChatCategory, categorizeChatBatch } from './gemini.js';

let cronInterval = null;

/**
 * Einzelnen Chat kategorisieren (für isolierte Einzelaufrufe).
 */
export async function categorizeOneChat(chatId) {
  try {
    const chatMessages = db.prepare(`
      SELECT sender, text FROM chat_messages 
      WHERE chat_id = ? 
      ORDER BY created_at ASC
    `).all(chatId);

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
    console.error(`Fehler beim Einzel-Kategorisieren von Chat ${chatId}:`, err);
    db.prepare(`
      UPDATE chats 
      SET category = 'Sonstiges', categorized_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(chatId);
    return 'Sonstiges';
  }
}

/**
 * Durchläuft Chats und kategorisiert diese ULTRA-SCHNELL & PARALLEL IN GROSSEN BATCHES.
 * @param {Object} options
 * @param {'uncategorized'|'all'} options.mode - 'uncategorized' (nur ohne/mit Sonstiges) oder 'all' (alle Chats komplett neu)
 * @param {number} options.totalLimit
 * @param {number} options.batchSize
 * @param {number} options.concurrency
 */
export async function categorizeChats({ mode = 'uncategorized', totalLimit = 500, batchSize = 30, concurrency = 3 } = {}) {
  const startTime = Date.now();
  try {
    let targetChats = [];
    if (mode === 'all') {
      targetChats = db.prepare(`
        SELECT id FROM chats 
        ORDER BY created_at ASC 
        LIMIT ?
      `).all(totalLimit);
    } else {
      targetChats = db.prepare(`
        SELECT id FROM chats 
        WHERE category IS NULL OR category = '' 
        ORDER BY created_at ASC 
        LIMIT ?
      `).all(totalLimit);
    }

    if (targetChats.length === 0) {
      const remainingRow = db.prepare(`
        SELECT COUNT(*) as count FROM chats 
        WHERE category IS NULL OR category = ''
      `).get();
      return { processedCount: 0, remainingCount: remainingRow?.count || 0, durationMs: 0 };
    }

    // Vorhandene Wissens-Kategorien laden
    const knowledgeCategories = db.prepare(`
      SELECT DISTINCT category FROM knowledge 
      WHERE category IS NOT NULL AND category != ''
    `).all().map(r => r.category);

    // Alle Batches vorbereiten
    const batches = [];
    for (let i = 0; i < targetChats.length; i += batchSize) {
      const chunk = targetChats.slice(i, i + batchSize);
      const chatsPayload = chunk.map(chat => {
        const messages = db.prepare(`
          SELECT sender, text FROM chat_messages 
          WHERE chat_id = ? 
          ORDER BY created_at ASC
        `).all(chat.id);
        return { id: chat.id, messages };
      });
      batches.push({ chunk, chatsPayload });
    }

    let processedCount = 0;

    // Concurrency Helper (verarbeitet batches in parallelen Worker-Gruppen)
    for (let i = 0; i < batches.length; i += concurrency) {
      const currentConcurrencyGroup = batches.slice(i, i + concurrency);
      
      const results = await Promise.all(
        currentConcurrencyGroup.map(batch => 
          categorizeChatBatch(batch.chatsPayload, knowledgeCategories)
            .then(mapping => ({ batch, mapping }))
            .catch(err => {
              console.error('Fehler bei Parallel-Batch:', err);
              const fallback = {};
              batch.chunk.forEach(c => { fallback[c.id] = 'Sonstiges'; });
              return { batch, mapping: fallback };
            })
        )
      );

      // In einer einzigen schnellen DB-Transaktion alle Ergebnisse der parallelen Gruppe speichern
      const updateStmt = db.prepare(`
        UPDATE chats 
        SET category = ?, categorized_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);

      db.transaction(() => {
        results.forEach(({ batch, mapping }) => {
          batch.chunk.forEach(chat => {
            const cat = mapping[chat.id] || 'Sonstiges';
            updateStmt.run(cat, chat.id);
            processedCount++;
          });
        });
      })();
    }

    const durationMs = Date.now() - startTime;

    const remainingRow = db.prepare(`
      SELECT COUNT(*) as count FROM chats 
      WHERE category IS NULL OR category = ''
    `).get();

    return {
      processedCount,
      remainingCount: remainingRow?.count || 0,
      durationMs
    };
  } catch (err) {
    console.error('Fehler bei categorizeChats:', err);
    return { processedCount: 0, remainingCount: 0, durationMs: Date.now() - startTime };
  }
}

/**
 * Kompatibilitäts-Wrapper für automatische Cronjobs
 */
export async function categorizeUncategorizedChats(totalLimit = 300, batchSize = 30, concurrency = 3) {
  return categorizeChats({ mode: 'uncategorized', totalLimit, batchSize, concurrency });
}

/**
 * Startet den 5-Minuten-Cronjob für die automatische Kategorisierung.
 */
export function startCategorizerCron() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (global._cronSingletonStarted) return;
  global._cronSingletonStarted = true;
  
  console.log('[Cron] Starte Highspeed-5-Minuten-Kategorisierungs-Cronjob für Bot-Chats...');
  
  // Erstmaliger Durchlauf nach 10 Sekunden
  setTimeout(() => {
    categorizeUncategorizedChats(60, 30, 2);
  }, 10000);

  // Alle 5 Minuten ausführen (5 * 60 * 1000 ms)
  cronInterval = setInterval(() => {
    console.log('[Cron] Führe automatische 5-Minuten-Chat-Kategorisierung aus...');
    categorizeUncategorizedChats(60, 30, 2);
  }, 5 * 60 * 1000);
}

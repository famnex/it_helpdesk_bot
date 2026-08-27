import db from './db.js';

/**
 * Prüft, ob eine IP-Adresse aktuell gesperrt ist.
 * 
 * @param {string} ip - Die zu prüfende IP-Adresse
 * @returns {{ isBanned: boolean, bannedUntil: string|null, banReason: string|null, warningCount: number }}
 */
export function checkIpBanned(ip) {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost') {
    return { isBanned: false, bannedUntil: null, banReason: null, warningCount: 0 };
  }

  try {
    const ban = db.prepare(`
      SELECT id, ip, banned_until as bannedUntil, reason as banReason, warning_count as warningCount
      FROM ip_bans
      WHERE ip = ? AND banned_until IS NOT NULL AND banned_until > CURRENT_TIMESTAMP
      ORDER BY banned_until DESC
      LIMIT 1
    `).get(ip);

    if (ban) {
      return {
        isBanned: true,
        bannedUntil: ban.bannedUntil,
        banReason: ban.banReason,
        warningCount: ban.warningCount || 1
      };
    }

    // Prüfen, ob es eine aktive Verwarnung innerhalb der letzten 24 Stunden gibt
    const warning = db.prepare(`
      SELECT id, ip, warning_count as warningCount, last_violation_at as lastViolationAt
      FROM ip_bans
      WHERE ip = ? AND last_violation_at > datetime(CURRENT_TIMESTAMP, '-24 hours')
      ORDER BY last_violation_at DESC
      LIMIT 1
    `).get(ip);

    return {
      isBanned: false,
      bannedUntil: null,
      banReason: null,
      warningCount: warning ? warning.warningCount : 0
    };
  } catch (err) {
    console.error('Fehler bei checkIpBanned:', err);
    return { isBanned: false, bannedUntil: null, banReason: null, warningCount: 0 };
  }
}

/**
 * Erfasst einen Missbrauchsverstoß nach dem 2-Stufen-Modell:
 * 1. Verstoß = Verwarnung (keine Sperre)
 * 2. Verstoß (innerhalb 24h) = 24 Stunden IP-Sperre
 * 
 * @param {Object} params
 * @param {string} params.ip - IP-Adresse
 * @param {string} [params.sessionId] - Session-ID
 * @param {string} [params.userEmail] - E-Mail des Nutzers (falls vorhanden)
 * @param {string} [params.reason] - Grund des Verstoßes
 * @returns {{ action: 'warned' | 'banned', warningCount: number, bannedUntil: string|null }}
 */
export function recordAbuseViolation({ ip, sessionId, userEmail, reason }) {
  if (!ip) {
    return { action: 'warned', warningCount: 1, bannedUntil: null };
  }

  try {
    // Vorherigen Eintrag für diese IP suchen
    const existing = db.prepare(`
      SELECT id, warning_count as warningCount, banned_until as bannedUntil, last_violation_at as lastViolationAt
      FROM ip_bans
      WHERE ip = ?
      ORDER BY last_violation_at DESC
      LIMIT 1
    `).get(ip);

    // Prüfen, ob der letzte Verstoß innerhalb der letzten 24 Stunden lag
    const isRecent = existing && existing.lastViolationAt && 
      (new Date().getTime() - new Date(existing.lastViolationAt + (existing.lastViolationAt.includes('Z') ? '' : 'Z')).getTime() < 24 * 60 * 60 * 1000);

    if (!existing || !isRecent || existing.warningCount === 0) {
      // 1. STUFE: VERWARNUNG
      if (existing) {
        db.prepare(`
          UPDATE ip_bans 
          SET warning_count = 1,
              session_id = COALESCE(?, session_id),
              user_email = COALESCE(?, user_email),
              reason = ?,
              banned_until = NULL,
              last_violation_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(sessionId || null, userEmail || null, reason || 'Erster Verstoß gegen Chat-Richtlinien', existing.id);
      } else {
        db.prepare(`
          INSERT INTO ip_bans (ip, session_id, user_email, warning_count, reason, banned_until, last_violation_at)
          VALUES (?, ?, ?, 1, ?, NULL, CURRENT_TIMESTAMP)
        `).run(ip, sessionId || null, userEmail || null, reason || 'Erster Verstoß gegen Chat-Richtlinien');
      }

      return {
        action: 'warned',
        warningCount: 1,
        bannedUntil: null
      };
    } else {
      // 2. STUFE (ODER HÖHER): 24-STUNDEN-SPERRE
      const newCount = (existing.warningCount || 1) + 1;
      
      db.prepare(`
        UPDATE ip_bans 
        SET warning_count = ?,
            session_id = COALESCE(?, session_id),
            user_email = COALESCE(?, user_email),
            reason = ?,
            banned_until = datetime(CURRENT_TIMESTAMP, '+24 hours'),
            last_violation_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newCount, sessionId || null, userEmail || null, reason || 'Wiederholter Verstoß gegen Chat-Richtlinien', existing.id);

      const updated = db.prepare('SELECT banned_until as bannedUntil FROM ip_bans WHERE id = ?').get(existing.id);

      return {
        action: 'banned',
        warningCount: newCount,
        bannedUntil: updated ? updated.bannedUntil : null
      };
    }
  } catch (err) {
    console.error('Fehler bei recordAbuseViolation:', err);
    return { action: 'warned', warningCount: 1, bannedUntil: null };
  }
}

/**
 * Hebt die Sperre und Verwarnung für eine IP-Adresse manuell auf.
 * 
 * @param {string} ip 
 */
export function liftIpBan(ip) {
  if (!ip) return false;
  try {
    db.prepare(`
      UPDATE ip_bans 
      SET banned_until = NULL, warning_count = 0 
      WHERE ip = ?
    `).run(ip);
    return true;
  } catch (err) {
    console.error('Fehler bei liftIpBan:', err);
    return false;
  }
}

/**
 * Setzt eine manuelle IP-Sperre durch einen Admin.
 * 
 * @param {Object} params
 * @param {string} params.ip
 * @param {number} params.hours - Sperrdauer in Stunden (z.B. 24, 48, 168 oder 87600 für permanent)
 * @param {string} [params.reason]
 */
export function manualBanIp({ ip, hours = 24, reason = 'Manuelle Sperre durch Administrator' }) {
  if (!ip) return false;
  try {
    const existing = db.prepare('SELECT id FROM ip_bans WHERE ip = ? LIMIT 1').get(ip);
    const hourModifier = `+${Math.max(1, parseInt(hours, 10) || 24)} hours`;

    if (existing) {
      db.prepare(`
        UPDATE ip_bans 
        SET banned_until = datetime(CURRENT_TIMESTAMP, ?),
            warning_count = 2,
            reason = ?,
            last_violation_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(hourModifier, reason, existing.id);
    } else {
      db.prepare(`
        INSERT INTO ip_bans (ip, warning_count, reason, banned_until, last_violation_at)
        VALUES (?, 2, ?, datetime(CURRENT_TIMESTAMP, ?), CURRENT_TIMESTAMP)
      `).run(ip, reason, hourModifier);
    }
    return true;
  } catch (err) {
    console.error('Fehler bei manualBanIp:', err);
    return false;
  }
}

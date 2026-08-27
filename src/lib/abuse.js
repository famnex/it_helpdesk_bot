import db from './db.js';
import { getProxyCheckConfig, isAsnWhitelisted } from './proxycheck.js';

/**
 * Prüft, ob eine IP zu Apple Private Relay oder einer freigegebenen AS-Nummer gehört.
 */
function isIpSharedOrPrivateRelay(ip) {
  if (!ip) return false;
  try {
    const config = getProxyCheckConfig();
    const cached = db.prepare('SELECT asn, provider, raw_response as rawResponse FROM proxycheck_cache WHERE ip = ?').get(ip);
    if (cached) {
      if (isAsnWhitelisted(cached.asn, cached.provider, cached.rawResponse, config.whitelistedAsns)) {
        return true;
      }
    }
  } catch (e) {
    // Fehler bei DB-Abfrage ignorieren
  }
  return false;
}

/**
 * Prüft, ob eine IP-Adresse oder ein Device Fingerprint aktuell gesperrt ist.
 * 
 * @param {string} ip - Die zu prüfende IP-Adresse
 * @param {string} [fingerprint] - Der zu prüfende Device Fingerprint
 * @returns {{ isBanned: boolean, bannedUntil: string|null, banReason: string|null, warningCount: number, bannedTarget?: string }}
 */
export function checkIpBanned(ip, fingerprint = null) {
  try {
    // 1. Device Fingerprint Sperre prüfen (falls übermittelt)
    if (fingerprint && typeof fingerprint === 'string' && fingerprint.trim()) {
      const cleanFp = fingerprint.trim();
      const fpBan = db.prepare(`
        SELECT id, fingerprint, banned_until as bannedUntil, reason as banReason, warning_count as warningCount
        FROM ip_bans
        WHERE fingerprint = ? AND banned_until IS NOT NULL AND banned_until > CURRENT_TIMESTAMP
        ORDER BY banned_until DESC
        LIMIT 1
      `).get(cleanFp);

      if (fpBan) {
        return {
          isBanned: true,
          bannedUntil: fpBan.bannedUntil,
          banReason: fpBan.banReason,
          warningCount: fpBan.warningCount || 1,
          bannedTarget: 'fingerprint'
        };
      }
    }

    // 2. IP-Sperre prüfen (ausgenommen Localhost, Private IPs und Apple Private Relay / Whitelisted ASNs)
    if (ip && ip !== '127.0.0.1' && ip !== 'localhost') {
      const cleanIp = ip.trim();

      // Schutz für Apple Private Relay / Whitelisted ASNs: IP-Sperre komplett umgehen!
      if (!isIpSharedOrPrivateRelay(cleanIp)) {
        const ipBan = db.prepare(`
          SELECT id, ip, banned_until as bannedUntil, reason as banReason, warning_count as warningCount
          FROM ip_bans
          WHERE ip = ? AND banned_until IS NOT NULL AND banned_until > CURRENT_TIMESTAMP
          ORDER BY banned_until DESC
          LIMIT 1
        `).get(cleanIp);

        if (ipBan) {
          return {
            isBanned: true,
            bannedUntil: ipBan.bannedUntil,
            banReason: ipBan.banReason,
            warningCount: ipBan.warningCount || 1,
            bannedTarget: 'ip'
          };
        }
      }
    }

    // Prüfen, ob es eine aktive Verwarnung innerhalb der letzten 24 Stunden gibt
    let warning = null;
    if (fingerprint) {
      warning = db.prepare(`
        SELECT id, warning_count as warningCount
        FROM ip_bans
        WHERE fingerprint = ? AND last_violation_at > datetime(CURRENT_TIMESTAMP, '-24 hours')
        ORDER BY last_violation_at DESC
        LIMIT 1
      `).get(fingerprint.trim());
    }

    if (!warning && ip) {
      warning = db.prepare(`
        SELECT id, warning_count as warningCount
        FROM ip_bans
        WHERE ip = ? AND last_violation_at > datetime(CURRENT_TIMESTAMP, '-24 hours')
        ORDER BY last_violation_at DESC
        LIMIT 1
      `).get(ip.trim());
    }

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
 * Erfasst einen Missbrauchsverstoß nach dem 2-Stufen-Modell (primär gerätebezogen per Fingerprint):
 * 1. Verstoß = Verwarnung (keine Sperre)
 * 2. Verstoß (innerhalb 24h) = 24 Stunden Sperre
 * 
 * @param {Object} params
 * @param {string} [params.ip] - IP-Adresse
 * @param {string} [params.fingerprint] - Device Fingerprint
 * @param {string} [params.sessionId] - Session-ID
 * @param {string} [params.userEmail] - E-Mail des Nutzers (falls vorhanden)
 * @param {string} [params.reason] - Grund des Verstoßes
 * @returns {{ action: 'warned' | 'banned', warningCount: number, bannedUntil: string|null }}
 */
export function recordAbuseViolation({ ip, fingerprint, sessionId, userEmail, reason }) {
  const cleanIp = ip ? ip.trim() : '0.0.0.0';
  const cleanFp = fingerprint ? fingerprint.trim() : null;

  try {
    // Vorherigen Eintrag für diesen Fingerprint oder diese IP suchen
    let existing = null;
    if (cleanFp) {
      existing = db.prepare(`
        SELECT id, warning_count as warningCount, banned_until as bannedUntil, last_violation_at as lastViolationAt
        FROM ip_bans
        WHERE fingerprint = ?
        ORDER BY last_violation_at DESC
        LIMIT 1
      `).get(cleanFp);
    }

    if (!existing && cleanIp && cleanIp !== '0.0.0.0') {
      existing = db.prepare(`
        SELECT id, warning_count as warningCount, banned_until as bannedUntil, last_violation_at as lastViolationAt
        FROM ip_bans
        WHERE ip = ?
        ORDER BY last_violation_at DESC
        LIMIT 1
      `).get(cleanIp);
    }

    const isRecent = existing && existing.lastViolationAt && 
      (new Date().getTime() - new Date(existing.lastViolationAt + (existing.lastViolationAt.includes('Z') ? '' : 'Z')).getTime() < 24 * 60 * 60 * 1000);

    if (!existing || !isRecent || existing.warningCount === 0) {
      // 1. STUFE: VERWARNUNG
      if (existing) {
        db.prepare(`
          UPDATE ip_bans 
          SET warning_count = 1,
              fingerprint = COALESCE(?, fingerprint),
              session_id = COALESCE(?, session_id),
              user_email = COALESCE(?, user_email),
              reason = ?,
              banned_until = NULL,
              last_violation_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cleanFp, sessionId || null, userEmail || null, reason || 'Erster Verstoß gegen Chat-Richtlinien', existing.id);
      } else {
        db.prepare(`
          INSERT INTO ip_bans (ip, fingerprint, session_id, user_email, warning_count, reason, banned_until, last_violation_at)
          VALUES (?, ?, ?, ?, 1, ?, NULL, CURRENT_TIMESTAMP)
        `).run(cleanIp, cleanFp, sessionId || null, userEmail || null, reason || 'Erster Verstoß gegen Chat-Richtlinien');
      }

      return {
        action: 'warned',
        warningCount: 1,
        bannedUntil: null
      };
    } else {
      // 2. STUFE (ODER HÖHER): 24-STUNDEN-SPERRE (Primär auf Fingerprint)
      const newCount = (existing.warningCount || 1) + 1;
      
      db.prepare(`
        UPDATE ip_bans 
        SET warning_count = ?,
            fingerprint = COALESCE(?, fingerprint),
            session_id = COALESCE(?, session_id),
            user_email = COALESCE(?, user_email),
            reason = ?,
            banned_until = datetime(CURRENT_TIMESTAMP, '+24 hours'),
            last_violation_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newCount, cleanFp, sessionId || null, userEmail || null, reason || 'Wiederholter Verstoß gegen Chat-Richtlinien', existing.id);

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
 */
export function liftIpBan(ip) {
  if (!ip) return false;
  try {
    db.prepare(`
      UPDATE ip_bans 
      SET banned_until = NULL, warning_count = 0 
      WHERE ip = ?
    `).run(ip.trim());
    return true;
  } catch (err) {
    console.error('Fehler bei liftIpBan:', err);
    return false;
  }
}

/**
 * Hebt die Sperre für einen Device Fingerprint manuell auf.
 */
export function liftFingerprintBan(fingerprint) {
  if (!fingerprint) return false;
  try {
    db.prepare(`
      UPDATE ip_bans 
      SET banned_until = NULL, warning_count = 0 
      WHERE fingerprint = ?
    `).run(fingerprint.trim());
    return true;
  } catch (err) {
    console.error('Fehler bei liftFingerprintBan:', err);
    return false;
  }
}

/**
 * Setzt eine manuelle IP-Sperre durch einen Admin.
 */
export function manualBanIp({ ip, hours = 24, reason = 'Manuelle Sperre durch Administrator' }) {
  if (!ip) return false;
  try {
    const cleanIp = ip.trim();
    const existing = db.prepare('SELECT id FROM ip_bans WHERE ip = ? LIMIT 1').get(cleanIp);
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
      `).run(cleanIp, reason, hourModifier);
    }
    return true;
  } catch (err) {
    console.error('Fehler bei manualBanIp:', err);
    return false;
  }
}

/**
 * Setzt eine manuelle Fingerprint-Sperre durch einen Admin.
 */
export function manualBanFingerprint({ fingerprint, hours = 24, reason = 'Manuelle Geräte-Sperre durch Administrator' }) {
  if (!fingerprint) return false;
  try {
    const cleanFp = fingerprint.trim();
    const existing = db.prepare('SELECT id FROM ip_bans WHERE fingerprint = ? LIMIT 1').get(cleanFp);
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
        INSERT INTO ip_bans (ip, fingerprint, warning_count, reason, banned_until, last_violation_at)
        VALUES ('0.0.0.0', ?, 2, ?, datetime(CURRENT_TIMESTAMP, ?), CURRENT_TIMESTAMP)
      `).run(cleanFp, reason, hourModifier);
    }
    return true;
  } catch (err) {
    console.error('Fehler bei manualBanFingerprint:', err);
    return false;
  }
}

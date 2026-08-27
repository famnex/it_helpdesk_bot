import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { checkIpBanned, recordAbuseViolation, liftIpBan, liftFingerprintBan, manualBanIp, manualBanFingerprint } from '@/lib/abuse';

/**
 * GET: Holt alle IP-Sperren, Geräte-Sperren (Fingerprints) und Verwarnungen.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const bans = db.prepare(`
      SELECT 
        id, 
        ip, 
        fingerprint,
        session_id as sessionId, 
        user_email as userEmail, 
        warning_count as warningCount, 
        banned_until as bannedUntil, 
        reason, 
        last_violation_at as lastViolationAt, 
        created_at as createdAt,
        CASE 
          WHEN banned_until IS NOT NULL AND banned_until > CURRENT_TIMESTAMP THEN 1 
          ELSE 0 
        END as isActiveBan
      FROM ip_bans
      ORDER BY last_violation_at DESC
    `).all();

    const activeBansCount = bans.filter(b => b.isActiveBan === 1).length;
    const warningsCount = bans.filter(b => b.isActiveBan === 0 && b.warningCount > 0).length;

    return NextResponse.json({ 
      bans, 
      stats: {
        total: bans.length,
        activeBans: activeBansCount,
        warnings: warningsCount
      }
    });
  } catch (err) {
    console.error('Fehler beim Laden der IP-Sperren:', err);
    return NextResponse.json({ error: 'Serverfehler beim Laden der IP-Sperren.' }, { status: 500 });
  }
}

/**
 * POST: Manuelle IP- oder Geräte-Sperre erstellen oder Verwarnung setzen.
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { ip, fingerprint, hours, reason, action } = body;

    const durationHours = parseInt(hours, 10) || 24;

    // Manuelle Fingerprint-Sperre
    if (action === 'ban_fingerprint' || fingerprint) {
      if (!fingerprint || !fingerprint.trim()) {
        return NextResponse.json({ error: 'Device Fingerprint ist erforderlich.' }, { status: 400 });
      }
      const success = manualBanFingerprint({
        fingerprint: fingerprint.trim(),
        hours: durationHours,
        reason: reason || `Manuelle Geräte-Sperre (${durationHours}h) durch Administrator ${user.name || user.email}`
      });
      return NextResponse.json({ success });
    }

    if (!ip || !ip.trim()) {
      return NextResponse.json({ error: 'IP-Adresse ist erforderlich.' }, { status: 400 });
    }

    const cleanIp = ip.trim();

    if (action === 'warn') {
      const result = recordAbuseViolation({
        ip: cleanIp,
        fingerprint: fingerprint ? fingerprint.trim() : null,
        reason: reason || 'Manuelle Verwarnung durch Administrator'
      });
      return NextResponse.json({ success: true, result });
    }

    // Standard: Manuelle IP-Sperre
    const success = manualBanIp({
      ip: cleanIp,
      hours: durationHours,
      reason: reason || `Manuelle Sperre (${durationHours}h) durch Administrator ${user.name || user.email}`
    });

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Fehler beim Erstellen der IP-Sperre.' }, { status: 500 });
    }
  } catch (err) {
    console.error('Fehler beim Setzen der Sperre:', err);
    return NextResponse.json({ error: 'Serverfehler beim Setzen der Sperre.' }, { status: 500 });
  }
}

/**
 * DELETE: Hebt die IP-Sperre bzw. Fingerprint-Sperre auf.
 */
export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    let ip = searchParams.get('ip');
    let fingerprint = searchParams.get('fingerprint');

    if (!ip && !fingerprint) {
      const body = await request.json().catch(() => ({}));
      ip = body.ip;
      fingerprint = body.fingerprint;
    }

    if (fingerprint && fingerprint.trim()) {
      const success = liftFingerprintBan(fingerprint.trim());
      return NextResponse.json({ success });
    }

    if (ip && ip.trim()) {
      const success = liftIpBan(ip.trim());
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: 'IP-Adresse oder Device Fingerprint fehlt.' }, { status: 400 });
  } catch (err) {
    console.error('Fehler beim Aufheben der Sperre:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

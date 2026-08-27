import db from './db.js';

/**
 * Standardkonfiguration für ProxyCheck.io
 */
export const DEFAULT_PROXYCHECK_CONFIG = {
  enabled: false,
  apiKey: '',
  blockVpn: true,
  blockTor: true,
  blockProxy: true,
  blockCompromised: true,
  minRiskScore: 67,
  whitelistedIps: ''
};

/**
 * Lädt die aktuelle ProxyCheck-Konfiguration aus der Datenbank.
 */
export function getProxyCheckConfig() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('proxycheck_config');
    if (!row) return { ...DEFAULT_PROXYCHECK_CONFIG };
    const parsed = JSON.parse(row.value);
    return {
      ...DEFAULT_PROXYCHECK_CONFIG,
      ...parsed
    };
  } catch (err) {
    console.error('Fehler beim Laden der ProxyCheck-Konfiguration:', err);
    return { ...DEFAULT_PROXYCHECK_CONFIG };
  }
}

/**
 * Prüft, ob eine IP privat (Localhost/Intranet) oder in der Whitelist enthalten ist.
 */
export function isPrivateOrWhitelistedIp(ip, whitelistedIps = '') {
  if (!ip || typeof ip !== 'string') return true;

  const cleanIp = ip.trim();

  // 1. Localhost & IPv6 Loopback
  if (['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'].includes(cleanIp)) {
    return true;
  }

  // 2. Private IPv4 Ranges (RFC 1918)
  // 10.0.0.0 - 10.255.255.255
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) return true;
  // 192.168.0.0 - 192.168.255.255
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) return true;
  // 172.16.0.0 - 172.31.255.255
  const match172 = cleanIp.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (match172) {
    const secondOctet = parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // 3. Konfigurierte Whitelist
  if (whitelistedIps && typeof whitelistedIps === 'string') {
    const allowed = whitelistedIps
      .split(/[\n,;\s]+/)
      .map(item => item.trim())
      .filter(Boolean);

    if (allowed.includes(cleanIp)) return true;
  }

  return false;
}

/**
 * Testet den ProxyCheck.io API-Key und ruft das aktuelle Abfrage-Kontingent ab.
 */
export async function testProxyCheckApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { success: false, error: 'Kein API-Key angegeben.' };
  }

  try {
    const url = `https://proxycheck.io/v2/stats?key=${encodeURIComponent(apiKey.trim())}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'IT-Helpdesk-Security/1.0' }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `HTTP-Status ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    if (data.status === 'denied' || data.status === 'error') {
      return { success: false, error: data.message || 'API-Key ungültig oder Zugriff verweigert.' };
    }

    return {
      success: true,
      status: data.status || 'ok',
      queriesToday: data['queries today'] ?? 0,
      dailyLimit: data['daily limit'] ?? 1000,
      queriesRemaining: data['queries remaining'] ?? 1000,
      plan: data.plan || data.tier || 'Free Tier'
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Zeitüberschreitung (Timeout) beim Verbindungsaufbau zu ProxyCheck.io.' };
    }
    return { success: false, error: err.message || 'Verbindung zu ProxyCheck.io fehlgeschlagen.' };
  }
}

/**
 * Prüft eine IP-Adresse gegen ProxyCheck.io (inkl. 30 Tage SQLite-Cache).
 * 
 * @param {string} ip Die zu prüfende Client-IP-Adresse
 * @returns {Promise<{
 *   allowed: boolean,
 *   category?: string,
 *   reason?: string,
 *   message?: string,
 *   details?: { isProxy: boolean, type: string, risk: number, country: string, provider: string, cached: boolean }
 * }>}
 */
export async function checkIpSecurity(ip) {
  const config = getProxyCheckConfig();

  // Wenn Schutz deaktiviert oder kein API-Key hinterlegt ist -> Durchlassen
  if (!config.enabled || !config.apiKey) {
    return { allowed: true, checked: false };
  }

  // Lokale oder Whitelist-IPs sofort durchlassen
  if (isPrivateOrWhitelistedIp(ip, config.whitelistedIps)) {
    return { allowed: true, checked: true, isWhitelisted: true };
  }

  const cleanIp = ip.trim();

  // 1. Im 30-Tage-SQLite-Cache nachschlagen
  try {
    const cachedRow = db.prepare(`
      SELECT ip, is_proxy as isProxy, proxy_type as proxyType, risk_score as riskScore, 
             country, isocode, provider, raw_response as rawResponse, expires_at as expiresAt
      FROM proxycheck_cache 
      WHERE ip = ? AND expires_at > CURRENT_TIMESTAMP
    `).get(cleanIp);

    if (cachedRow) {
      return evaluateSecurityRules(cachedRow.isProxy === 1, cachedRow.proxyType, cachedRow.riskScore, {
        isProxy: cachedRow.isProxy === 1,
        type: cachedRow.proxyType || 'Regular',
        risk: cachedRow.riskScore || 0,
        country: cachedRow.country || 'Unbekannt',
        provider: cachedRow.provider || 'Unbekannt',
        cached: true
      }, config);
    }
  } catch (cacheErr) {
    console.error('Fehler beim Lesen aus proxycheck_cache:', cacheErr);
  }

  // 2. Externe Abfrage an ProxyCheck.io durchführen
  let isProxy = false;
  let proxyType = 'Regular';
  let riskScore = 0;
  let country = 'Unbekannt';
  let isocode = '';
  let provider = 'Unbekannt';
  let rawJson = '';

  try {
    const queryUrl = `https://proxycheck.io/v2/${encodeURIComponent(cleanIp)}?key=${encodeURIComponent(config.apiKey)}&vpn=1&asn=1&risk=1&port=1&seen=1&days=7`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(queryUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'IT-Helpdesk-Security/1.0' }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      rawJson = JSON.stringify(data);

      if (data.status === 'ok' && data[cleanIp]) {
        const ipInfo = data[cleanIp];
        isProxy = ipInfo.proxy === 'yes';
        proxyType = ipInfo.type || (isProxy ? 'Proxy' : 'Regular');
        riskScore = parseInt(ipInfo.risk, 10) || 0;
        country = ipInfo.country || 'Unbekannt';
        isocode = ipInfo.isocode || '';
        provider = ipInfo.provider || ipInfo.organisation || ipInfo.asn || 'Unbekannt';

        // Im 30-Tage-Cache speichern (User-Vorgabe: 30 Tage)
        try {
          db.prepare(`
            INSERT OR REPLACE INTO proxycheck_cache (
              ip, is_proxy, proxy_type, risk_score, country, isocode, provider, raw_response, checked_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, datetime('now', '+30 days'))
          `).run(cleanIp, isProxy ? 1 : 0, proxyType, riskScore, country, isocode, provider, rawJson);
        } catch (insertErr) {
          console.error('Fehler beim Speichern in proxycheck_cache:', insertErr);
        }
      }
    }
  } catch (apiErr) {
    console.error(`Fehler bei ProxyCheck.io-Abfrage für ${cleanIp}:`, apiErr.message);
    // Bei Timeout oder API-Fehlern den Chat nicht blockieren (Fail-Open für Verfügbarkeit)
    return { allowed: true, checked: false, error: apiErr.message };
  }

  const details = {
    isProxy,
    type: proxyType,
    risk: riskScore,
    country,
    provider,
    cached: false
  };

  return evaluateSecurityRules(isProxy, proxyType, riskScore, details, config);
}

/**
 * Wendet die Block-Regeln basierend auf der Konfiguration an.
 */
function evaluateSecurityRules(isProxy, proxyType, riskScore, details, config) {
  const typeUpper = (proxyType || '').toUpperCase();

  // 1. VPN Block
  if (isProxy && typeUpper.includes('VPN') && config.blockVpn !== false) {
    return {
      allowed: false,
      category: 'VPN',
      reason: 'vpn',
      message: 'Bitte nutzen Sie keine VPN-Dienste beim Zugriff auf dieses Support-System. Deaktivieren Sie Ihren VPN-Dienst, um den Chat zu nutzen.',
      details
    };
  }

  // 2. TOR Block
  if (isProxy && typeUpper.includes('TOR') && config.blockTor !== false) {
    return {
      allowed: false,
      category: 'TOR',
      reason: 'tor',
      message: 'Der Zugriff über das anonyme TOR-Netzwerk ist aus Sicherheitsgründen nicht gestattet. Bitte nutzen Sie eine reguläre Internetverbindung.',
      details
    };
  }

  // 3. Proxy Block (HTTP, SOCKS4, SOCKS5, Shadowsocks, Public Proxy)
  if (isProxy && (typeUpper.includes('PROXY') || typeUpper.includes('SOCKS') || typeUpper.includes('HTTP') || typeUpper.includes('SHADOWSOCKS')) && config.blockProxy !== false) {
    return {
      allowed: false,
      category: 'Proxy',
      reason: 'proxy',
      message: 'Bitte nutzen Sie keine Proxy-Server beim Zugriff auf dieses Support-System. Deaktivieren Sie Ihren Proxy, um den Chat zu nutzen.',
      details
    };
  }

  // 4. Compromised / Botnet Block
  if (isProxy && typeUpper.includes('COMPROMISED') && config.blockCompromised !== false) {
    return {
      allowed: false,
      category: 'Verdächtig',
      reason: 'compromised',
      message: 'Ihre IP-Adresse wurde als auffällig oder kompromittiert eingestuft. Der Zugang zum Chat ist blockiert.',
      details
    };
  }

  // 5. Allgemeiner Proxy/VPN-Treffer
  if (isProxy && (config.blockVpn !== false || config.blockProxy !== false)) {
    return {
      allowed: false,
      category: 'Proxy/VPN',
      reason: 'proxy_vpn',
      message: 'Der Zugriff über anonymisierende Netzwerk-Dienste ist für dieses Support-System nicht gestattet.',
      details
    };
  }

  // 6. Risk Score Threshold
  const minRisk = typeof config.minRiskScore === 'number' ? config.minRiskScore : 67;
  if (riskScore >= minRisk) {
    return {
      allowed: false,
      category: 'Risiko-IP',
      reason: 'risk_score',
      message: 'Ihre IP-Adresse wurde als sicherheitskritisch eingestuft. Der Zugang zum Chat ist blockiert.',
      details
    };
  }

  return { allowed: true, details };
}

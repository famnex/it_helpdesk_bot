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
  whitelistedIps: '',
  whitelistedAsns: 'AS13335, AS54113, AS20940, AS396982, AS714, AS13414, AS36040'
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
 * Prüft, ob eine AS-Nummer (Autonomous System) in der Whitelist enthalten ist.
 * Unterstützt Formate wie "AS13335", "13335", "AS13335 Cloudflare", etc.
 */
export function isAsnWhitelisted(asn = '', provider = '', rawResponse = '', whitelistedAsns = '') {
  if (!whitelistedAsns || typeof whitelistedAsns !== 'string' || !whitelistedAsns.trim()) {
    return false;
  }

  const allowedTokens = whitelistedAsns
    .split(/[\n,;\s]+/)
    .map(item => item.trim().toUpperCase())
    .filter(Boolean);

  if (allowedTokens.length === 0) return false;

  const allowedAsnNumbers = new Set();
  allowedTokens.forEach(token => {
    allowedAsnNumbers.add(token);
    if (token.startsWith('AS')) {
      allowedAsnNumbers.add(token.substring(2));
    } else if (/^\d+$/.test(token)) {
      allowedAsnNumbers.add(`AS${token}`);
    }
  });

  // 1. Direktes ASN-Feld prüfen
  if (asn && typeof asn === 'string') {
    const cleanAsn = asn.trim().toUpperCase();
    for (const num of allowedAsnNumbers) {
      if (cleanAsn === num || cleanAsn.includes(num)) return true;
    }
  }

  // 2. Provider / Organisation Feld prüfen
  if (provider && typeof provider === 'string') {
    const cleanProvider = provider.trim().toUpperCase();
    for (const num of allowedAsnNumbers) {
      if (cleanProvider.includes(num)) return true;
    }
  }

  // 3. Raw JSON Response durchsuchen
  if (rawResponse && typeof rawResponse === 'string') {
    const cleanRaw = rawResponse.toUpperCase();
    for (const num of allowedAsnNumbers) {
      if (cleanRaw.includes(`"ASN":"${num}"`) || cleanRaw.includes(`"ASN":"AS${num}"`) || cleanRaw.includes(num)) return true;
    }
  }

  return false;
}

/**
 * Testet den ProxyCheck.io API-Key und prüft die Erreichbarkeit.
 */
export async function testProxyCheckApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { success: false, error: 'Kein API-Key angegeben.' };
  }

  try {
    const cleanKey = apiKey.trim();
    const url = `https://proxycheck.io/v2/8.8.8.8?key=${encodeURIComponent(cleanKey)}&vpn=1&asn=1&risk=1`;
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

    const testIpData = data['8.8.8.8'] || {};
    const queriesToday = data['queries today'] ?? data['queries_today'] ?? 'Aktiv';
    const dailyLimit = data['daily limit'] ?? data['daily_limit'] ?? (cleanKey.length > 5 ? '1.000+' : '100');
    const queriesRemaining = data['queries remaining'] ?? data['queries_remaining'] ?? 'Verfügbar';
    const plan = data.plan || data.tier || (cleanKey.length > 5 ? 'Registrierter API-Key' : 'Standard');

    return {
      success: true,
      status: data.status || 'ok',
      queriesToday,
      dailyLimit,
      queriesRemaining,
      plan,
      node: data.node || 'Online',
      queryTime: data['query time'] || '0.01s',
      testIpChecked: '8.8.8.8',
      testIpProvider: testIpData.provider || 'Google LLC'
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
 *   isAsnWhitelisted?: boolean,
 *   details?: { isProxy: boolean, type: string, risk: number, country: string, provider: string, asn: string, cached: boolean }
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
             country, isocode, provider, asn, raw_response as rawResponse, expires_at as expiresAt
      FROM proxycheck_cache 
      WHERE ip = ? AND expires_at > CURRENT_TIMESTAMP
    `).get(cleanIp);

    if (cachedRow) {
      const details = {
        isProxy: cachedRow.isProxy === 1,
        type: cachedRow.proxyType || 'Regular',
        risk: cachedRow.riskScore || 0,
        country: cachedRow.country || 'Unbekannt',
        provider: cachedRow.provider || 'Unbekannt',
        asn: cachedRow.asn || '',
        rawResponse: cachedRow.rawResponse || '',
        cached: true
      };
      return evaluateSecurityRules(cachedRow.isProxy === 1, cachedRow.proxyType, cachedRow.riskScore, cachedRow.asn, details, config);
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
  let asn = '';
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

    if (!response.ok) {
      console.warn(`[ProxyCheck Fail-Open] ProxyCheck.io antwortete mit HTTP ${response.status} für ${cleanIp}. Chatzugriff wird ungehindert erlaubt.`);
      return { allowed: true, checked: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    rawJson = JSON.stringify(data);

    // Fail-Open: Wenn das Tageslimit aufgebraucht ist, der Dienst gestört ist oder der Key abgelehnt wird -> Niemals blockieren!
    if (data.status === 'denied' || data.status === 'error' || data.status === 'warning') {
      console.warn(`[ProxyCheck Fail-Open] ProxyCheck.io meldet "${data.message || data.status}" für ${cleanIp} (z. B. Tageskontingent aufgebraucht). Chatzugriff wird ungehindert erlaubt.`);
      return { allowed: true, checked: false, error: data.message || data.status };
    }

    if (data.status !== 'ok' || !data[cleanIp]) {
      console.warn(`[ProxyCheck Fail-Open] Unerwartete Antwort für ${cleanIp}. Chatzugriff wird ungehindert erlaubt.`);
      return { allowed: true, checked: false };
    }

    const ipInfo = data[cleanIp];
    isProxy = ipInfo.proxy === 'yes';
    proxyType = ipInfo.type || (isProxy ? 'Proxy' : 'Regular');
    riskScore = parseInt(ipInfo.risk, 10) || 0;
    country = ipInfo.country || 'Unbekannt';
    isocode = ipInfo.isocode || '';
    provider = ipInfo.provider || ipInfo.organisation || 'Unbekannt';
    asn = ipInfo.asn || ipInfo.organisation || '';

    // Im 30-Tage-Cache speichern
    try {
      db.prepare(`
        INSERT OR REPLACE INTO proxycheck_cache (
          ip, is_proxy, proxy_type, risk_score, country, isocode, provider, asn, raw_response, checked_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, datetime('now', '+30 days'))
      `).run(cleanIp, isProxy ? 1 : 0, proxyType, riskScore, country, isocode, provider, asn, rawJson);
    } catch (insertErr) {
      console.error('Fehler beim Speichern in proxycheck_cache:', insertErr);
    }
  } catch (apiErr) {
    console.error(`[ProxyCheck Fail-Open] Fehler/Timeout bei ProxyCheck.io-Abfrage für ${cleanIp}:`, apiErr.message);
    return { allowed: true, checked: false, error: apiErr.message };
  }

  const details = {
    isProxy,
    type: proxyType,
    risk: riskScore,
    country,
    provider,
    asn,
    rawResponse: rawJson,
    cached: false
  };

  return evaluateSecurityRules(isProxy, proxyType, riskScore, asn, details, config);
}

/**
 * Wendet die Block-Regeln basierend auf der Konfiguration an.
 */
function evaluateSecurityRules(isProxy, proxyType, riskScore, asn, details, config) {
  // 0. AS-Whitelisting Check (z. B. Apple Private Relay)
  const isAsnAllowed = isAsnWhitelisted(asn, details?.provider, details?.rawResponse, config.whitelistedAsns);
  if (isAsnAllowed) {
    return {
      allowed: true,
      checked: true,
      isAsnWhitelisted: true,
      category: 'Whitelisted AS',
      details: {
        ...details,
        isAsnWhitelisted: true
      }
    };
  }

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
      category: 'Kompromittierte IP',
      reason: 'compromised',
      message: 'Ihre IP-Adresse wurde als auffällig oder kompromittiert eingestuft. Falls Sie mit einem VPN oder Proxy verbunden sind, kann dies die Ursache sein. Bitte deaktivieren Sie den Dienst.',
      details
    };
  }

  // 5. Allgemeiner Proxy/VPN-Treffer
  if (isProxy && (config.blockVpn !== false || config.blockProxy !== false)) {
    return {
      allowed: false,
      category: 'Proxy/VPN',
      reason: 'proxy_vpn',
      message: 'Der Zugriff über anonymisierende Netzwerk-Dienste (wie VPN oder Proxy) ist für dieses Support-System nicht gestattet.',
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
      message: 'Ihre IP-Adresse wurde als sicherheitskritisch eingestuft. Falls Sie mit einem VPN verbunden sind, kann dies der Grund sein. Bitte trennen Sie das VPN und versuchen Sie es erneut.',
      details
    };
  }

  return { allowed: true, details };
}

/**
 * Ruft alle gecachten IP-Adressen mit Statistiken ab.
 */
export function getAllCachedIps() {
  try {
    const config = getProxyCheckConfig();
    const rows = db.prepare(`
      SELECT ip, is_proxy as isProxy, proxy_type as proxyType, risk_score as riskScore,
             country, isocode, provider, asn, raw_response as rawResponse, 
             checked_at as checkedAt, expires_at as expiresAt,
             CASE WHEN datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END as isValid
      FROM proxycheck_cache
      ORDER BY checked_at DESC
    `).all();

    const rowsWithStatus = rows.map(r => {
      const isAsnAllowed = isAsnWhitelisted(r.asn, r.provider, r.rawResponse, config.whitelistedAsns);
      return {
        ...r,
        isAsnWhitelisted: isAsnAllowed
      };
    });

    const stats = {
      total: rowsWithStatus.length,
      proxies: rowsWithStatus.filter(r => r.isProxy === 1).length,
      clean: rowsWithStatus.filter(r => r.isProxy === 0 && r.riskScore < 50).length,
      highRisk: rowsWithStatus.filter(r => r.riskScore >= 67).length,
      asnWhitelisted: rowsWithStatus.filter(r => r.isAsnWhitelisted).length
    };

    return { rows: rowsWithStatus, stats };
  } catch (err) {
    console.error('Fehler beim Abrufen der gecachten IPs:', err);
    return { rows: [], stats: { total: 0, proxies: 0, clean: 0, highRisk: 0, asnWhitelisted: 0 } };
  }
}

/**
 * Löscht eine IP-Adresse aus dem Cache.
 */
export function deleteCachedIp(ip) {
  if (!ip) return false;
  try {
    const info = db.prepare('DELETE FROM proxycheck_cache WHERE ip = ?').run(ip.trim());
    return info.changes > 0;
  } catch (err) {
    console.error('Fehler beim Löschen der gecachten IP:', err);
    return false;
  }
}

/**
 * Löscht alle abgelaufenen oder alle Einträge aus dem Cache.
 */
export function clearCache(mode = 'expired') {
  try {
    if (mode === 'all') {
      const info = db.prepare('DELETE FROM proxycheck_cache').run();
      return info.changes;
    } else {
      const info = db.prepare("DELETE FROM proxycheck_cache WHERE datetime(expires_at) <= datetime('now')").run();
      return info.changes;
    }
  } catch (err) {
    console.error('Fehler beim Leeren des Caches:', err);
    return 0;
  }
}

/**
 * Fügt eine IP-Adresse zur Whitelist in den ProxyCheck-Einstellungen hinzu.
 */
export function addIpToWhitelist(ip) {
  if (!ip || typeof ip !== 'string') return { success: false, error: 'Keine IP angegeben.' };

  const cleanIp = ip.trim();
  try {
    const config = getProxyCheckConfig();
    const currentList = (config.whitelistedIps || '')
      .split(/[\n,;\s]+/)
      .map(item => item.trim())
      .filter(Boolean);

    if (!currentList.includes(cleanIp)) {
      currentList.push(cleanIp);
    }

    const updatedWhitelist = currentList.join('\n');
    config.whitelistedIps = updatedWhitelist;

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'proxycheck_config',
      JSON.stringify(config)
    );

    // Lösche auch aus dem Cache, damit die Whitelist sofort greift
    deleteCachedIp(cleanIp);

    return { success: true, whitelistedIps: updatedWhitelist };
  } catch (err) {
    console.error('Fehler beim Hinzufügen zur Whitelist:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fügt eine AS-Nummer zur Whitelist in den ProxyCheck-Einstellungen hinzu.
 */
export function addAsnToWhitelist(asn) {
  if (!asn || typeof asn !== 'string') return { success: false, error: 'Keine AS-Nummer angegeben.' };

  let cleanAsn = asn.trim().toUpperCase();
  if (!cleanAsn.startsWith('AS') && /^\d+$/.test(cleanAsn)) {
    cleanAsn = `AS${cleanAsn}`;
  }

  try {
    const config = getProxyCheckConfig();
    const currentList = (config.whitelistedAsns || '')
      .split(/[\n,;\s]+/)
      .map(item => item.trim().toUpperCase())
      .filter(Boolean);

    if (!currentList.includes(cleanAsn)) {
      currentList.push(cleanAsn);
    }

    const updatedWhitelist = currentList.join(', ');
    config.whitelistedAsns = updatedWhitelist;

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'proxycheck_config',
      JSON.stringify(config)
    );

    return { success: true, whitelistedAsns: updatedWhitelist, addedAsn: cleanAsn };
  } catch (err) {
    console.error('Fehler beim Hinzufügen der AS-Nummer zur Whitelist:', err);
    return { success: false, error: err.message };
  }
}

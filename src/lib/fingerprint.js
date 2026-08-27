/**
 * Client-seitiges Device Fingerprinting.
 * Generiert eine stabile, eindeutige Geräte-ID aus Browser-Merkmalen und einer dauerhaften LocalStorage-UUID.
 */

export function getOrCreateDeviceFingerprint() {
  if (typeof window === 'undefined') return '';

  try {
    const STORAGE_KEY = 'helpdesk_device_uuid';
    let deviceUuid = localStorage.getItem(STORAGE_KEY);

    if (!deviceUuid) {
      deviceUuid = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(STORAGE_KEY, deviceUuid);
    }

    // Sammele unveränderliche / charakteristische Browser-Merkmale
    const nav = window.navigator || {};
    const scr = window.screen || {};

    const components = [
      deviceUuid,
      nav.userAgent || '',
      nav.language || '',
      scr.width || 0,
      scr.height || 0,
      scr.colorDepth || 0,
      new Date().getTimezoneOffset(),
      nav.hardwareConcurrency || 0,
      nav.deviceMemory || 0,
      nav.platform || ''
    ];

    const rawString = components.join('||');

    // Einfacher, schneller 32-Bit Hash zur Komprimierung der Signatur
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
      const char = rawString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // In 32-bit Integer umwandeln
    }

    const positiveHash = Math.abs(hash).toString(36);
    return `fp_${positiveHash}_${deviceUuid.substring(4, 12)}`;
  } catch (err) {
    console.error('Fehler bei Erstellung des Device Fingerprints:', err);
    return 'fp_fallback_' + Math.random().toString(36).substring(2, 10);
  }
}

import { marked } from 'marked';

/**
 * Korrigiert Upload- und Anhang-URLs so, dass sie immer das erforderliche /helpdesk-Präfix enthalten,
 * falls es fehlt (z. B. https://cloud.mso-hef.de/uploads/... -> https://cloud.mso-hef.de/helpdesk/uploads/...).
 */
export function fixUploadUrl(url) {
  if (!url) return '';
  let str = String(url).trim();
  if (str.startsWith('data:') || str.startsWith('blob:')) return str;

  // 1. cloud.mso-hef.de/uploads/ ohne /helpdesk/ korrigieren
  str = str.replace(/https?:\/\/cloud\.mso-hef\.de\/uploads\//gi, 'https://cloud.mso-hef.de/helpdesk/uploads/');
  str = str.replace(/https?:\/\/cloud\.mso-hef\.de\/api\/uploads\//gi, 'https://cloud.mso-hef.de/helpdesk/api/uploads/');

  // 2. Relative Pfade /uploads/ ohne /helpdesk/ korrigieren
  if (str.startsWith('/uploads/')) {
    str = `/helpdesk${str}`;
  } else if (str.startsWith('/api/uploads/')) {
    str = `/helpdesk${str}`;
  }

  return str;
}

export function fixUploadUrlInText(text) {
  if (!text) return '';
  let str = String(text);
  // Korrigiert cloud.mso-hef.de/uploads/ -> cloud.mso-hef.de/helpdesk/uploads/
  str = str.replace(/(https?:\/\/cloud\.mso-hef\.de)\/uploads\//gi, '$1/helpdesk/uploads/');
  str = str.replace(/(https?:\/\/cloud\.mso-hef\.de)\/api\/uploads\//gi, '$1/helpdesk/api/uploads/');
  // Korrigiert Markdown-Links wie [Name](/uploads/...) -> [Name](/helpdesk/uploads/...)
  str = str.replace(/(\[[^\]]*\]\()\/uploads\//gi, '$1/helpdesk/uploads/');
  str = str.replace(/(\[[^\]]*\]\()\/api\/uploads\//gi, '$1/helpdesk/api/uploads/');
  return str;
}

marked.use({
  renderer: {
    link(arg1, arg2, arg3) {
      let href = '#';
      let title = '';
      let text = '';

      if (typeof arg1 === 'object' && arg1 !== null) {
        href = arg1.href || '#';
        title = arg1.title || '';
        text = arg1.text || href;
      } else {
        href = arg1 || '#';
        title = arg2 || '';
        text = arg3 || href;
      }

      const cleanHref = fixUploadUrl(href);
      const cleanText = fixUploadUrl(text);
      const cleanTitle = title ? ` title="${title}"` : '';
      return `<a href="${cleanHref}"${cleanTitle} target="_blank" rel="noopener noreferrer" class="text-sky-400 underline hover:text-sky-300 transition-colors break-all">${cleanText}</a>`;
    }
  }
});

/**
 * Wandelt E-Mails und Web-Domains in Freitext sauber in Markdown-Links um,
 * ohne bestehende Markdown-Links oder HTML-Tags zu beschädigen.
 */
export function autoLinkText(text) {
  if (!text) return '';

  // 1. Zerlege den Text in geschützte Blöcke (bestehende Markdown-Links [text](url) und HTML-Tags)
  // sowie in ungeschützten Freitext.
  const regexLinkOrTag = /(\[[^\]]*\]\([^)]*\)|<a\b[^>]*>.*?<\/a>|<[^>]+>)/gi;
  
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regexLinkOrTag.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ isProtected: false, content: text.slice(lastIndex, match.index) });
    }
    parts.push({ isProtected: true, content: match[0] });
    lastIndex = regexLinkOrTag.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ isProtected: false, content: text.slice(lastIndex) });
  }

  // 2. Verarbeite nur die ungeschützten Freitext-Teile
  const processed = parts.map(part => {
    if (part.isProtected) return part.content;

    let str = part.content;

    // A) E-Mail-Adressen verlinken
    str = str.replace(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi, (email) => {
      return `[${email}](mailto:${email})`;
    });

    // B) URLs mit http:// oder https:// verlinken
    str = str.replace(/\b(https?:\/\/[^\s<)]+)/gi, (fullUrl) => {
      const cleanUrl = fullUrl.replace(/[.,;!?]+$/, '');
      const trailingPunctuation = fullUrl.slice(cleanUrl.length);
      return `[${cleanUrl}](${cleanUrl})${trailingPunctuation}`;
    });

    // C) Standalone Web-Domains (z.B. cloud.mso-hef.de/termin/ oder www.google.de)
    str = str.replace(/(?:^|(?<=\s|[(>]))((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<)]*)?)/gi, (rawDomain) => {
      // Ignorieren, wenn es eine E-Mail ist
      if (rawDomain.includes('@')) return rawDomain;

      // Satzzeichen am Ende der Domain abspalten (z.B. "cloud.mso-hef.de.")
      const cleanDomain = rawDomain.replace(/[.,;!?]+$/, '');
      const trailingPunctuation = rawDomain.slice(cleanDomain.length);

      if (!cleanDomain) return rawDomain;
      return `[${cleanDomain}](https://${cleanDomain})${trailingPunctuation}`;
    });

    return str;
  });

  return processed.join('');
}

/**
 * Parst Text inklusive automatischer Verlinkung von URLs & Mails zu HTML.
 */
export function renderMarkdownWithLinks(text) {
  if (!text) return '';
  const textWithFixedUrls = fixUploadUrlInText(text);
  const linkedText = autoLinkText(textWithFixedUrls);
  return marked.parse(linkedText);
}

/**
 * Parst ein UTC-Datumssignal robust in ein JavaScript Date Objekt.
 */
export function parseUtcDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  let str = String(dateStr).trim();
  if (str.includes(' ') && !str.includes('Z') && !str.includes('+')) {
    str = str.replace(' ', 'T') + 'Z';
  }
  return new Date(str);
}

/**
 * Gibt eine kundenfreundliche Bezeichnung für Datumswechsel ("Heute", "Gestern", oder z. B. "26. August 2026") zurück.
 */
export function getDateDividerLabel(dateInput) {
  if (!dateInput) return null;
  const date = parseUtcDate(dateInput);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) {
    return 'Heute';
  }
  if (msgDate.getTime() === yesterday.getTime()) {
    return 'Gestern';
  }

  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Prüft, ob zwei Zeitstempel an unterschiedlichen Tagen liegen.
 */
export function isDifferentDay(d1, d2) {
  if (!d1 || !d2) return true;
  const dateA = parseUtcDate(d1);
  const dateB = parseUtcDate(d2);
  if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return false;
  return (
    dateA.getFullYear() !== dateB.getFullYear() ||
    dateA.getMonth() !== dateB.getMonth() ||
    dateA.getDate() !== dateB.getDate()
  );
}

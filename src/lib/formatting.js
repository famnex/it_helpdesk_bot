import { marked } from 'marked';

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

      const cleanTitle = title ? ` title="${title}"` : '';
      return `<a href="${href}"${cleanTitle} target="_blank" rel="noopener noreferrer" class="text-sky-400 underline hover:text-sky-300 transition-colors break-all">${text}</a>`;
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
  const linkedText = autoLinkText(text);
  return marked.parse(linkedText);
}

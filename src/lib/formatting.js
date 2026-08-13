import { marked } from 'marked';

// Konfiguriere marked so, dass alle Links automatisch in einem neuen Tab (target="_blank") mit schicker Formatierung geöffnet werden
marked.use({
  renderer: {
    link({ href, title, text }) {
      const cleanHref = href || '#';
      const cleanTitle = title ? ` title="${title}"` : '';
      return `<a href="${cleanHref}"${cleanTitle} target="_blank" rel="noopener noreferrer" class="text-sky-400 underline hover:text-sky-300 transition-colors break-all">${text}</a>`;
    }
  }
});

/**
 * Erkennt automatisch URLs (z.B. cloud.mso-hef.de, https://...) und E-Mail-Adressen in Freitext
 * und wandelt sie in Markdown-Links um.
 */
export function autoLinkText(text) {
  if (!text) return '';

  // 1. E-Mails umwandeln (z.B. user@domain.de -> [user@domain.de](mailto:user@domain.de))
  let result = text.replace(
    /(?<!\[|\(|href="|mailto:)\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi,
    (match, email) => `[${email}](mailto:${email})`
  );

  // 2. URLs mit http:// oder https:// umwandeln
  result = result.replace(
    /(?<!\[|\(|href=")(https?:\/\/[^\s<)]+)/gi,
    (match, url) => `[${url}](${url})`
  );

  // 3. Nackte Domain-URLs umwandeln (z.B. cloud.mso-hef.de, www.google.de)
  result = result.replace(
    /(?<!\[|\(|href="|https:\/\/|http:\/\/|@|\w)\b((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<)]*)?)\b/gi,
    (match, domain) => {
      if (domain.includes('@')) return match;
      return `[${domain}](https://${domain})`;
    }
  );

  return result;
}

/**
 * Parst Text inklusive automatischer Verlinkung von URLs & Mails zu HTML.
 */
export function renderMarkdownWithLinks(text) {
  if (!text) return '';
  const linkedText = autoLinkText(text);
  return marked.parse(linkedText);
}

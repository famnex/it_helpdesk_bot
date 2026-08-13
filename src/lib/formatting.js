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
 * Erkennt automatisch URLs (z.B. cloud.mso-hef.de, https://...) und E-Mail-Adressen in Freitext
 * und wandelt sie sauber in Markdown-Links um, ohne bestehende Links oder E-Mail-Bestandteile zu zerpflücken.
 */
export function autoLinkText(text) {
  if (!text) return '';

  const tokens = [];

  // Hilfsfunktion zum Schutz bereits vorhandener oder neu erstellter Markdown-Links/HTML-Tags
  const protect = (str) => {
    return str.replace(/(\[[^\]]+\]\([^)]+\)|<a\s+[^>]*>.*?<\/a>|<[^>]+>)/gi, (m) => {
      const placeholder = `___TLINK_${tokens.length}___`;
      tokens.push(m);
      return placeholder;
    });
  };

  // 1. Bereits vorhandene Markdown-Links und HTML-Tags schützen
  let workText = protect(text);

  // 2. E-Mail-Adressen verlinken (z. B. j.breitkreutz@mso-hef.de)
  workText = workText.replace(
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi,
    (match, email) => `[${email}](mailto:${email})`
  );

  // Neu erstellte E-Mail-Links sofort schützen, damit Unterdomains (z.B. j.breitkreutz oder hef.de) nicht überschrieben werden
  workText = protect(workText);

  // 3. URLs mit http:// oder https:// verlinken
  workText = workText.replace(
    /\b(https?:\/\/[^\s<)]+)/gi,
    (match, url) => `[${url}](${url})`
  );

  // Neu erstellte HTTP-Links schützen
  workText = protect(workText);

  // 4. Standalone Web-Domains verlinken (z.B. cloud.mso-hef.de, www.google.de, mso-hef.de/helpdesk)
  workText = workText.replace(
    /(?<!@|\w|\/)\b((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<)]*)?)\b/gi,
    (match, domain) => {
      if (domain.includes('@')) return match;
      return `[${domain}](https://${domain})`;
    }
  );

  // 5. Alle geschützten Tokens in umgekehrter Reihenfolge wieder einsetzen
  for (let i = tokens.length - 1; i >= 0; i--) {
    workText = workText.replace(`___TLINK_${i}___`, tokens[i]);
  }

  return workText;
}

/**
 * Parst Text inklusive automatischer Verlinkung von URLs & Mails zu HTML.
 */
export function renderMarkdownWithLinks(text) {
  if (!text) return '';
  const linkedText = autoLinkText(text);
  return marked.parse(linkedText);
}

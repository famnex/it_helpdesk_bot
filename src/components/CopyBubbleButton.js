'use client';

import { useState } from 'react';

export default function CopyBubbleButton({ text, light = false }) {
  const [copied, setCopied] = useState(false);

  if (!text) return null;

  const handleCopy = async (e) => {
    e.stopPropagation();
    const bubbleEl = e.currentTarget.closest('[data-bubble]');
    const contentEl = bubbleEl?.querySelector('[data-bubble-content]');
    const textToCopy = (contentEl?.innerText || text || '').trim();
    if (!textToCopy) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('Kopieren fehlgeschlagen:', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Kopiert!' : 'Text kopieren'}
      aria-label={copied ? 'Kopiert' : 'Nachricht kopieren'}
      className={`self-end -mt-1 -mb-1 ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all cursor-pointer select-none ${
        copied
          ? light
            ? 'text-emerald-200 bg-black/20 opacity-100'
            : 'text-emerald-400 bg-emerald-500/10 opacity-100'
          : light
            ? 'text-white/60 hover:text-white hover:bg-black/15 opacity-60 hover:opacity-100'
            : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/80 opacity-60 hover:opacity-100'
      }`}
    >
      <i className={copied ? 'fa-solid fa-check text-[9px]' : 'fa-regular fa-copy text-[10px]'}></i>
      {copied && <span className="font-semibold">Kopiert</span>}
    </button>
  );
}

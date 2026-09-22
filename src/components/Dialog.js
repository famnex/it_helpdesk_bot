'use client';
import { useEffect, useRef } from 'react';
export default function Dialog({ title, children, onClose, mediaQuery, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    const media = mediaQuery ? window.matchMedia(mediaQuery) : null;
    const sync = () => {
      if (!media || media.matches) {
        if (!dialog.open) dialog.showModal();
      } else if (dialog.open) dialog.close();
    };
    sync();
    media?.addEventListener('change', sync);
    return () => { media?.removeEventListener('change', sync); dialog.close(); previous?.focus?.(); };
  }, [mediaQuery]);
  return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); onClose?.(); }} className={`w-[min(94vw,64rem)] max-h-[92dvh] m-auto bg-transparent text-slate-100 p-0 border-0 backdrop:bg-black/70 [&>*]:mx-auto ${className}`}>{children}</dialog>;
}

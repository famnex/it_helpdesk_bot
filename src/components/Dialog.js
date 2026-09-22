'use client';
import { useEffect, useRef } from 'react';
export default function Dialog({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus?.(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); onClose?.(); }} className="w-[min(94vw,64rem)] max-h-[92dvh] m-auto bg-transparent text-slate-100 p-0 border-0 backdrop:bg-black/70 [&>*]:mx-auto">{children}</dialog>;
}

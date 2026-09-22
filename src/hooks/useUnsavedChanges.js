'use client';
import { useEffect } from 'react';
export function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const unload = event => { event.preventDefault(); event.returnValue = ''; };
    const navigate = event => {
      const link = event.target.closest?.('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download') || event.ctrlKey || event.metaKey) return;
      if (link.href.split('#')[0] === location.href.split('#')[0]) return;
      if (!window.confirm('Es gibt ungesendete oder ungespeicherte Änderungen. Trotzdem diese Seite verlassen?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload',unload);
    document.addEventListener('click',navigate,true);
    return () => { window.removeEventListener('beforeunload',unload); document.removeEventListener('click',navigate,true); };
  },[dirty]);
}

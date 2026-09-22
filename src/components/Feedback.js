'use client';
import { useEffect, useState } from 'react';
export default function Feedback() {
  const [notices,setNotices] = useState([]);
  useEffect(() => {
    const receive = e => setNotices(prev => [...prev.slice(-3), {id:crypto.randomUUID(),message:e.detail}]);
    window.addEventListener('helpdesk:notice',receive);
    return () => window.removeEventListener('helpdesk:notice',receive);
  },[]);
  return <div aria-live="polite" className="fixed bottom-4 right-4 z-[100] max-w-sm space-y-2">{notices.map(n => <div key={n.id} role="status" className="flex gap-3 rounded-xl border border-slate-500 bg-slate-900 p-4 text-sm text-white shadow-xl"><p>{n.message}</p><button aria-label="Meldung schließen" onClick={() => setNotices(prev => prev.filter(x => x.id !== n.id))}>×</button></div>)}</div>;
}

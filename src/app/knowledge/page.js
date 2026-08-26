'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { marked } from 'marked';
import UserNavMenu from '@/components/UserNavMenu';

export default function PublicKnowledgePage() {
  const [chunks, setChunks] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  const [isLoading, setIsLoading] = useState(true);
  const [activeModalChunk, setActiveModalChunk] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadKnowledge();
    // Prüfen ob Benutzer angemeldet ist
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {});
  }, [search]);

  const loadKnowledge = async () => {
    try {
      const url = search.trim() ? `/api/knowledge?q=${encodeURIComponent(search)}` : '/api/knowledge';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setChunks(data.chunks || []);
        setSelectedCategory('Alle'); // Reset filter on new search
      }
    } catch (err) {
      console.error('Fehler beim Laden des Wissens:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <Link href="/" className="bg-sky-500 text-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
            <i className="fa-solid fa-graduation-cap text-xl"></i>
          </Link>
          <div>
            <h1 className="text-base font-bold text-white">Campus IT-Wissensdatenbank</h1>
            <p className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">Selbsthilfe-Portal</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link 
            href="/"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2 rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-comments"></i>
            <span>Zum Chat-Assistenten</span>
          </Link>
          {user && <UserNavMenu user={user} currentView="knowledge" />}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-5xl w-full mx-auto p-6 md:p-8 space-y-6">
        
        {/* Title and Search Panel */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 p-5 border border-slate-800 rounded-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">Wie können wir dir helfen?</h2>
            <p className="text-xs text-slate-400">Durchsuche unsere offizielle IT-Wissensdatenbank nach Lösungen</p>
          </div>
          
          <div className="w-full md:max-w-md relative">
            <i className="fa-solid fa-magnifying-glass text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs"></i>
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen nach WLAN, Smartboard, Drucker..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
        </div>

        {/* Category Tabs */}
        {!isLoading && chunks.length > 0 && (
          <div className="flex bg-slate-900/40 p-1.5 border border-slate-800/60 rounded-xl overflow-x-auto gap-2 text-[10px] font-bold scrollbar-none">
            {['Alle', ...new Set(chunks.map(c => c.category || 'Sonstiges'))].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2.5 rounded-lg transition-all shrink-0 uppercase tracking-wider ${selectedCategory === cat ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : chunks.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <div className="text-slate-600 text-4xl"><i className="fa-regular fa-lightbulb"></i></div>
            <p className="text-sm text-slate-400">Keine passenden Lösungen in der Wissensdatenbank gefunden.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Probiere andere Suchbegriffe aus oder chatte mit unserem Bot-Assistenten auf der Startseite, um direkt ein IT-Support-Ticket zu eröffnen.
            </p>
          </div>
        ) : chunks.filter(c => selectedCategory === 'Alle' || (c.category || 'Sonstiges') === selectedCategory).length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <div className="text-slate-600 text-4xl"><i className="fa-regular fa-lightbulb"></i></div>
            <p className="text-sm text-slate-400">Keine Einträge in dieser Kategorie gefunden.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            {chunks
              .filter(c => selectedCategory === 'Alle' || (c.category || 'Sonstiges') === selectedCategory)
              .map((k, index) => (
              <div 
                key={index}
                onClick={() => setActiveModalChunk(k)}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between hover:border-slate-705 hover:bg-slate-850/50 transition-all hover:scale-[1.01] duration-300 animate-fade-in cursor-pointer select-none"
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 text-sky-400">
                      <div className="bg-sky-500/10 p-1.5 rounded-lg border border-sky-500/20"><i className="fa-regular fa-lightbulb text-sm"></i></div>
                      <span className="text-[10px] font-bold uppercase tracking-wider">{k.category || 'Sonstiges'}</span>
                    </div>
                    <i className="fa-solid fa-up-right-from-square text-[10px] text-slate-505"></i>
                  </div>
                  <h3 className="font-bold text-sm text-white leading-snug">{k.title}</h3>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fullscreen Info Modal */}
        {activeModalChunk && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setActiveModalChunk(null)}>
            <div 
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl relative animate-scale-up space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button 
                onClick={() => setActiveModalChunk(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-800 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                title="Schließen"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sky-400">
                  <div className="bg-sky-500/10 p-1.5 rounded-lg border border-sky-500/20"><i className="fa-regular fa-lightbulb text-sm"></i></div>
                  <span className="text-xs font-bold uppercase tracking-wider">{activeModalChunk.category || 'Sonstiges'}</span>
                </div>
                
                <h2 className="text-xl font-bold text-white pr-8 leading-snug">{activeModalChunk.title}</h2>
                
                <div className="h-px bg-slate-800"></div>

                <div 
                  className="text-xs sm:text-sm text-slate-350 leading-relaxed bg-slate-950 p-5 rounded-2xl border border-slate-850 markdown-content overflow-x-auto whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: marked.parse(activeModalChunk.description || activeModalChunk.fact || '') }}
                />

                {activeModalChunk.attachments && activeModalChunk.attachments.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="h-px bg-slate-800"></div>
                    <h4 className="text-[10px] font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fa-solid fa-paperclip text-sky-400"></i>
                      <span>Dateianhänge zum Download</span>
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeModalChunk.attachments.map(att => (
                        <a 
                          key={att.id}
                          href={att.filePath} 
                          download
                          className="flex items-center gap-3 bg-slate-950 hover:bg-slate-850/80 p-3 rounded-xl border border-slate-850 hover:border-sky-500/30 transition-all text-xs text-sky-400 font-semibold shadow-inner"
                        >
                          <i className="fa-solid fa-file-arrow-down text-base text-sky-500"></i>
                          <div className="flex flex-col items-start min-w-0">
                            <span className="truncate max-w-[170px] text-slate-200">{att.filename}</span>
                            <span className="text-[9px] text-slate-500 font-normal mt-0.5">({(att.fileSize / 1024).toFixed(1)} KB)</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}

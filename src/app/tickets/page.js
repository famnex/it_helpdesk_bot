'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CustomerTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'closed'
  const [logoutLabel, setLogoutLabel] = useState('Abmelden');
  const router = useRouter();

  useEffect(() => {
    // Session prüfen
    const sessionId = localStorage.getItem('it_helpdesk_session_uuid') || '';
    fetch('/api/auth/me', {
      headers: { 'X-User-Session-Id': sessionId }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.user) {
          // Falls nicht angemeldet, zurück zur Startseite leiten
          router.push('/');
        } else {
          setUser(data.user);
          if (data.logoutText) {
            setLogoutLabel(data.logoutText);
          }
          loadTickets(data.user);
        }
      })
      .catch(() => {
        router.push('/');
      });
  }, []);

  const loadTickets = async (currentUser) => {
    try {
      const res = await fetch('/api/tickets');
      if (res.ok) {
        const data = await res.json();
        // Nur Tickets anzeigen, bei denen der eingeloggte Benutzer der Ersteller ist
        const myTickets = (data.tickets || []).filter(t => t.creatorEmail === currentUser?.email);
        setTickets(myTickets);
      }
    } catch (err) {
      console.error('Fehler beim Laden der Tickets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }
    router.push('/');
  };

  const filteredTickets = tickets.filter(t => {
    if (filter === 'active') return t.status === 'open' || t.status === 'assigned';
    if (filter === 'closed') return t.status === 'closed';
    return true;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center flex-col gap-4">
        <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Lade deine Tickets...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Top Navigation */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <a href="/helpdesk" className="bg-sky-500 text-white p-2 rounded-xl shadow-md flex items-center justify-center">
            <i className="fa-solid fa-graduation-cap text-xl"></i>
          </a>
          <div>
            <h1 className="text-base font-bold text-white">Mein Ticket-Portal</h1>
            <p className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">Kunden-Bereich</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 hidden sm:inline">
            <i className="fa-regular fa-envelope mr-1.5 text-slate-500"></i>
            {user?.email}
          </span>
          <button 
            onClick={handleLogout}
            className="text-xs text-red-400 hover:bg-red-950/30 border border-red-500/20 px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>{logoutLabel}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-8 space-y-6">
        
        {/* Title and Filter Panel */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50 p-4 border border-slate-800 rounded-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">Meine IT-Support-Anfragen</h2>
            <p className="text-xs text-slate-400">Hier siehst du deine laufenden und geschlossenen Tickets</p>
          </div>
          
          {/* Filters */}
          <div className="flex bg-slate-950 p-1.5 border border-slate-800 rounded-xl text-xs font-semibold">
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-lg transition-all ${filter === 'all' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Alle ({tickets.length})
            </button>
            <button 
              onClick={() => setFilter('active')}
              className={`px-4 py-1.5 rounded-lg transition-all ${filter === 'active' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Aktiv ({tickets.filter(t => t.status !== 'closed').length})
            </button>
            <button 
              onClick={() => setFilter('closed')}
              className={`px-4 py-1.5 rounded-lg transition-all ${filter === 'closed' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Geschlossen ({tickets.filter(t => t.status === 'closed').length})
            </button>
          </div>
        </div>

        {/* Tickets List */}
        {filteredTickets.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <div className="text-slate-600 text-4xl"><i className="fa-regular fa-folder-open"></i></div>
            <p className="text-sm text-slate-400">Keine Support-Tickets in dieser Kategorie gefunden.</p>
            <a 
              href="/helpdesk"
              className="inline-block bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md mt-2"
            >
              Zum Chat & neues Ticket erstellen
            </a>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            {filteredTickets.map((tk) => {
              
              // Status Badge Styles
              let statusLabel = 'Offen';
              let statusClass = 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
              if (tk.status === 'assigned') {
                statusLabel = 'Zugeordnet';
                statusClass = 'bg-violet-500/10 text-violet-400 border border-violet-500/20';
              } else if (tk.status === 'closed') {
                statusLabel = 'Gelöst';
                statusClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
              }

              return (
                <Link 
                  href={`/tickets/${tk.id}`}
                  key={tk.id}
                  className="bg-slate-900 hover:bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200 group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xs font-mono font-bold text-slate-500 group-hover:text-slate-400">{tk.id}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
                    </div>
                    <h3 className="font-bold text-sm text-white group-hover:text-sky-400 transition-colors line-clamp-1">{tk.title}</h3>
                  </div>

                  <div className="border-t border-slate-800/50 mt-4 pt-4 flex justify-between items-center text-[10px] text-slate-500">
                    <span>
                      <i className="fa-regular fa-clock mr-1"></i>
                      Erstellt: {new Date(tk.createdAt).toLocaleDateString('de-DE')}
                    </span>
                    
                    {tk.assignedAgentEmail ? (
                      <span className="flex items-center gap-1">
                        <i className="fa-solid fa-user-tie"></i>
                        Agent: {tk.assignedAgentEmail.split('@')[0]}
                      </span>
                    ) : (
                      <span>Warte auf Bearbeiter</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

      </main>

    </div>
  );
}

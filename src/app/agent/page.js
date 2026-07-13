'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AgentDashboardPage() {
  const [tickets, setTickets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('active'); // 'active', 'mine', 'unassigned', 'closed'
  const [logoutLabel, setLogoutLabel] = useState('Abmelden');
  const router = useRouter();

  useEffect(() => {
    // Session prüfen
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.user || !['agent', 'admin'].includes(data.user.role)) {
          router.push('/login');
        } else {
          setUser(data.user);
          if (data.logoutText) {
            setLogoutLabel(data.logoutText);
          }
          loadData();
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, []);

  const loadData = async () => {
    try {
      const [ticketsRes, agentsRes] = await Promise.all([
        fetch('/api/tickets'),
        fetch('/api/agents')
      ]);

      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setTickets(data.tickets || []);
      }
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Fehler beim Laden der Dashboard-Daten:', err);
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
    router.push('/login');
  };

  const handleQuickAssign = async (ticketId, agentId) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_agent_id: agentId })
      });
      if (res.ok) {
        // Liste neu laden
        loadData();
      }
    } catch (err) {
      console.error('Fehler bei Schnellzuweisung:', err);
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    if (!confirm('Möchtest du dieses Ticket wirklich dauerhaft löschen? Alle Nachrichten und Notizen werden ebenfalls gelöscht.')) {
      return;
    }

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setTickets(prev => prev.filter(t => t.id !== ticketId));
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Löschen.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (filter === 'mine') return (t.status === 'open' || t.status === 'assigned') && t.assignedAgentId === user?.id;
    if (filter === 'unassigned') return (t.status === 'open' || t.status === 'assigned') && !t.assignedAgentId;
    if (filter === 'active') return t.status === 'open' || t.status === 'assigned';
    if (filter === 'closed') return t.status === 'closed';
    return true;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center flex-col gap-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Lade Agenten-Portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-lg z-20 relative">
        <div className="flex items-center gap-3">
          <div className="bg-violet-600 text-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
            <i className="fa-solid fa-user-shield text-xl"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-white">IT-Helpdesk Agenten-Portal</h1>
            <p className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">Mitarbeiter-Bereich</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link 
            href="/profile"
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl transition-all text-xs text-slate-300 hover:border-violet-500/50"
            title="Profil bearbeiten"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-5 h-5 rounded-full object-cover border border-violet-500/30" />
            ) : (
              <i className="fa-solid fa-user-tie text-violet-400"></i>
            )}
            <span className="font-semibold">{user?.name || user?.email} ({user?.role === 'admin' ? 'Admin' : 'Agent'})</span>
          </Link>

          <Link
            href="/"
            className="bg-slate-850 hover:bg-slate-800 text-slate-350 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-comments text-sky-400"></i>
            <span>Zum Chat-Frontend</span>
          </Link>

          {user?.role === 'admin' && (
            <Link 
              href="/admin"
              className="bg-slate-850 hover:bg-slate-800 text-slate-350 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all"
            >
              <i className="fa-solid fa-gears mr-1"></i>
              Admin-Bereich
            </Link>
          )}

          <button 
            onClick={handleLogout}
            className="text-xs text-red-400 hover:bg-red-950/30 border border-red-500/20 px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>{logoutLabel}</span>
          </button>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        
        {/* Title and Filter Panel */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 p-5 border border-slate-800 rounded-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">Support-Ticket-Übersicht</h2>
            <p className="text-xs text-slate-400">Verwalte, weise zu und beantworte Tickets von Kunden</p>
          </div>
          
          {/* Filters */}
          <div className="flex bg-slate-950 p-1.5 border border-slate-800 rounded-xl text-xs font-semibold">
            <button 
              onClick={() => setFilter('active')}
              className={`px-4 py-2 rounded-lg transition-all ${filter === 'active' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Aktiv ({tickets.filter(t => t.status !== 'closed').length})
            </button>
            <button 
              onClick={() => setFilter('mine')}
              className={`px-4 py-2 rounded-lg transition-all ${filter === 'mine' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Mir zugewiesen ({tickets.filter(t => t.assignedAgentId === user?.id && t.status !== 'closed').length})
            </button>
            <button 
              onClick={() => setFilter('unassigned')}
              className={`px-4 py-2 rounded-lg transition-all ${filter === 'unassigned' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Unzugewiesen ({tickets.filter(t => !t.assignedAgentId && t.status !== 'closed').length})
            </button>
            <button 
              onClick={() => setFilter('closed')}
              className={`px-4 py-2 rounded-lg transition-all ${filter === 'closed' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Geschlossen ({tickets.filter(t => t.status === 'closed').length})
            </button>
          </div>
        </div>

        {/* Tickets Table / List */}
        {filteredTickets.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <div className="text-slate-600 text-4xl"><i className="fa-regular fa-folder-open"></i></div>
            <p className="text-sm text-slate-400">Keine Support-Tickets in dieser Ansicht vorhanden.</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/50 text-slate-400 text-xs font-bold uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">ID</th>
                    <th className="px-6 py-4">Betreff</th>
                    <th className="px-6 py-4">Ersteller</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Zuweisung</th>
                    <th className="px-6 py-4 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredTickets.map((tk) => {
                    
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
                      <tr key={tk.id} className="hover:bg-slate-850/40 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs font-bold text-slate-500">{tk.id}</td>
                        <td className="px-6 py-4">
                          <Link 
                            href={`/agent/tickets/${tk.id}`} 
                            className="font-bold text-white hover:text-violet-400 transition-colors block max-w-xs sm:max-w-sm truncate"
                          >
                            {tk.title}
                          </Link>
                          <span className="text-[10px] text-slate-500 block mt-1">
                            Aktualisiert: {new Date(tk.updatedAt || tk.createdAt).toLocaleString('de-DE')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs">
                          <div className="flex flex-col">
                            {tk.creatorName && (
                              <span className="font-bold text-white block mb-0.5">{tk.creatorName}</span>
                            )}
                            <span className="font-medium text-slate-500 font-mono text-[10px]">{tk.creatorEmail}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
                        </td>
                        <td className="px-6 py-4">
                          {tk.status !== 'closed' ? (
                            <select 
                              value={tk.assignedAgentId || ''}
                              onChange={(e) => handleQuickAssign(tk.id, e.target.value)}
                              className="bg-slate-950 border border-slate-800 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500 text-slate-300"
                            >
                              <option value="">-- Nicht zugewiesen --</option>
                              {agents.map(ag => (
                                <option key={ag.id} value={ag.id}>
                                  {ag.email.split('@')[0]} ({ag.role})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Geschlossen</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <Link 
                              href={`/agent/tickets/${tk.id}`}
                              className="bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/20 font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all"
                            >
                              Bearbeiten
                            </Link>
                            {user?.role === 'admin' && (
                              <button
                                onClick={() => handleDeleteTicket(tk.id)}
                                className="bg-red-650/20 hover:bg-red-650 text-red-300 hover:text-white border border-red-500/20 font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all cursor-pointer"
                              >
                                Löschen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}

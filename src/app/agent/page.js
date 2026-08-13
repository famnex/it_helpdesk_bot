'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marked } from 'marked';

const parseUtcDate = (dateStr) => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  let str = String(dateStr).trim();
  if (str.includes(' ') && !str.includes('Z') && !str.includes('+')) {
    str = str.replace(' ', 'T') + 'Z';
  } else if (str.includes('T') && !str.includes('Z') && !str.includes('+')) {
    str = str + 'Z';
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

export default function AgentDashboardPage() {
  const [tickets, setTickets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('active'); // 'active', 'mine', 'unassigned', 'closed'
  const [logoutLabel, setLogoutLabel] = useState('Abmelden');
  const router = useRouter();

  // Mobile Menu State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // On Behalf Ticket Creation Modal State
  const [showBehalfModal, setShowBehalfModal] = useState(false);
  const [behalfChatId, setBehalfChatId] = useState('');
  const [behalfMessages, setBehalfMessages] = useState([]);
  const [behalfInput, setBehalfInput] = useState('');
  const [isBehalfTyping, setIsBehalfTyping] = useState(false);

  // Extraction & Form Review State
  const [showBehalfForm, setShowBehalfForm] = useState(false);
  const [behalfFormName, setBehalfFormName] = useState('');
  const [behalfFormEmail, setBehalfFormEmail] = useState('');
  const [behalfFormPhone, setBehalfFormPhone] = useState('');
  const [behalfFormTitle, setBehalfFormTitle] = useState('');
  const [behalfFormDescription, setBehalfFormDescription] = useState('');
  const [behalfFormAttempts, setBehalfFormAttempts] = useState('');
  const [behalfFormAssignee, setBehalfFormAssignee] = useState('auto'); // 'auto', 'unassigned', or agent ID
  const [isSubmittingBehalfTicket, setIsSubmittingBehalfTicket] = useState(false);

  const handleOpenBehalfModal = () => {
    const newChatId = `behalf-${Date.now()}`;
    setBehalfChatId(newChatId);
    setBehalfMessages([
      {
        sender: 'bot',
        text: 'Hallo! Ich helfe dir dabei, ein Support-Ticket im Namen eines Benutzers (z. B. Lehrer oder Schüler) anzulegen.\n\nBitte nenne mir zuerst **Name und E-Mail-Adresse** (und optional die Telefonnummer) des betroffenen Benutzers.'
      }
    ]);
    setBehalfInput('');
    setIsBehalfTyping(false);
    setShowBehalfForm(false);
    setBehalfFormName('');
    setBehalfFormEmail('');
    setBehalfFormPhone('');
    setBehalfFormTitle('');
    setBehalfFormDescription('');
    setBehalfFormAttempts('');
    setBehalfFormAssignee('auto');
    setShowBehalfModal(true);
  };

  const handleSendBehalfMessage = async (e) => {
    e.preventDefault();
    if (!behalfInput.trim() || isBehalfTyping) return;

    const userText = behalfInput.trim();
    setBehalfInput('');

    // Append user message
    setBehalfMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setIsBehalfTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: behalfChatId,
          text: userText,
          isAgentOnBehalf: true
        })
      });

      if (res.ok) {
        const data = await res.json();
        
        // Append bot message
        setBehalfMessages(prev => [...prev, { sender: 'bot', text: data.text }]);
        
        // If ticket extraction is triggered
        if (data.ticketCreated && data.extractedData) {
          const ext = data.extractedData;
          setBehalfFormName(ext.name || '');
          setBehalfFormEmail(ext.email || '');
          setBehalfFormPhone(ext.phone || '');
          setBehalfFormTitle(ext.title || '');
          setBehalfFormDescription(ext.description || '');
          setBehalfFormAttempts(ext.attempts || '');
          setShowBehalfForm(true); // Switch to review form view
        }
      }
    } catch (err) {
      console.error('Fehler bei On-Behalf Chat:', err);
    } finally {
      setIsBehalfTyping(false);
    }
  };

  const handleSubmitBehalfForm = async (e) => {
    e.preventDefault();
    if (!behalfFormEmail.trim() || !behalfFormTitle.trim() || isSubmittingBehalfTicket) return;

    setIsSubmittingBehalfTicket(true);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_email: behalfFormEmail.trim(),
          creator_name: behalfFormName.trim(),
          title: behalfFormTitle.trim(),
          assignedAgentId: behalfFormAssignee,
          chat_id: behalfChatId
        })
      });

      if (res.ok) {
        const ticketData = await res.json();
        
        // Also save description and attempts as messages in ticket_messages
        let detailsText = `**Problembeschreibung:**\n${behalfFormDescription}`;
        if (behalfFormPhone) {
          detailsText += `\n\n**Telefonnummer:** ${behalfFormPhone}`;
        }
        if (behalfFormAttempts) {
          detailsText += `\n\n**Bisherige Lösungsversuche:**\n${behalfFormAttempts}`;
        }

        await fetch(`/api/tickets/${ticketData.ticketId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: detailsText })
        });

        // Close modal and reload dashboard data
        setShowBehalfModal(false);
        loadData();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Fehler beim Erstellen des Tickets.');
      }
    } catch (err) {
      console.error('Fehler beim Erstellen des Tickets:', err);
      alert('Verbindungsfehler.');
    } finally {
      setIsSubmittingBehalfTicket(false);
    }
  };

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

  // Live Heartbeat & Hintergrund-Aktualisierung für Agenten
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      // 1. Heartbeat pingen, damit Agent immer live "Online" ist
      fetch(`/api/live/sync?roomType=dashboard&roomId=global&myRole=${user.role || 'agent'}&myEmail=${encodeURIComponent(user.email || '')}`)
        .catch(() => {});

      // 2. Tickets stumm neu laden, um neue Anfragen/Nachrichten live anzuzeigen
      fetch('/api/tickets')
        .then(r => r.json())
        .then(data => {
          if (data.tickets) {
            setTickets(prev => {
              const currentSig = prev.map(t => `${t.id}-${t.status}-${t.updatedAt}`).join('|');
              const newSig = data.tickets.map(t => `${t.id}-${t.status}-${t.updatedAt}`).join('|');
              if (currentSig !== newSig) {
                return data.tickets;
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

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
    if (filter === 'unread') return t.hasUnread === 1 && t.status !== 'closed';
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
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex justify-between items-center shrink-0 shadow-lg z-30 sticky top-0 h-[72px]">
        <div className="flex items-center gap-3">
          <div className="bg-violet-600 text-white p-2 rounded-xl shadow-md flex items-center justify-center shrink-0">
            <i className="fa-solid fa-user-shield text-lg md:text-xl"></i>
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold text-white leading-tight">IT-Helpdesk Agenten-Portal</h1>
            <p className="text-[9px] md:text-[10px] text-violet-400 font-bold uppercase tracking-wider">Mitarbeiter-Bereich</p>
          </div>
        </div>

        {/* Hamburger-Button für mobile Navigation */}
        <button 
          type="button" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden text-slate-400 hover:text-white p-2 rounded-xl border border-slate-800 bg-slate-950/60 focus:outline-none transition-colors"
        >
          <i className={`fa-solid ${mobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-base`}></i>
        </button>

        {/* Desktop-Menu */}
        <div className="hidden md:flex items-center gap-4 text-sm">
          <Link 
            href="/profile"
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl transition-all text-xs text-slate-350 hover:border-violet-500/50"
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
              className="bg-slate-850 hover:bg-slate-800 text-slate-350 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1"
            >
              <i className="fa-solid fa-gears text-violet-400"></i>
              <span>Admin-Bereich</span>
            </Link>
          )}

          <button 
            onClick={handleLogout}
            className="text-xs text-red-400 hover:bg-red-950/30 border border-red-500/20 px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 font-semibold"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>{logoutLabel}</span>
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-[72px] left-0 right-0 bg-slate-900 border-b border-slate-800 p-5 shadow-2xl flex flex-col gap-3 animate-fade-in z-30">
            <Link 
              href="/profile"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl transition-all text-xs text-slate-300 font-semibold"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-5 h-5 rounded-full object-cover border border-violet-500/30" />
              ) : (
                <i className="fa-solid fa-user-tie text-violet-400"></i>
              )}
              <span>Profil: {user?.name || user?.email}</span>
            </Link>

            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-comments text-sky-400"></i>
              <span>Zum Chat-Frontend</span>
            </Link>

            {user?.role === 'admin' && (
              <Link 
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-gears text-violet-400"></i>
                <span>Admin-Bereich</span>
              </Link>
            )}

            <button 
              type="button"
              onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
              className="bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-400 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-right-from-bracket"></i>
              <span>{logoutLabel}</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Dashboard */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        
        {/* Title and Filter Panel */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 p-5 border border-slate-800 rounded-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between w-full md:w-auto flex-grow">
            <div>
              <h2 className="text-lg font-bold text-white">Support-Ticket-Übersicht</h2>
              <p className="text-xs text-slate-400">Verwalte, weise zu und beantworte Tickets von Kunden</p>
            </div>
            <button
              onClick={handleOpenBehalfModal}
              className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 self-start shadow-md hover:shadow-violet-550/20 cursor-pointer shrink-0"
            >
              <i className="fa-solid fa-plus-circle text-sm"></i>
              <span>Neues Ticket (im Namen von...)</span>
            </button>
          </div>
          
          {/* Filters */}
          <div className="flex flex-wrap bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs font-semibold w-full sm:w-auto justify-center gap-1 sm:gap-0">
            <button 
              onClick={() => setFilter('active')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-all ${filter === 'active' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Aktiv ({tickets.filter(t => t.status !== 'closed').length})
            </button>
            <button 
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 ${filter === 'unread' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <i className="fa-solid fa-envelope text-amber-400 text-xs"></i>
              <span>Ungelesen</span> ({tickets.filter(t => t.hasUnread === 1 && t.status !== 'closed').length})
            </button>
            <button 
              onClick={() => setFilter('mine')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-all ${filter === 'mine' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <span className="hidden sm:inline">Mir zugewiesen</span>
              <span className="sm:hidden">Meine</span> ({tickets.filter(t => t.assignedAgentId === user?.id && t.status !== 'closed').length})
            </button>
            <button 
              onClick={() => setFilter('unassigned')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-all ${filter === 'unassigned' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <span className="hidden sm:inline">Unzugewiesen</span>
              <span className="sm:hidden">Offen</span> ({tickets.filter(t => !t.assignedAgentId && t.status !== 'closed').length})
            </button>
            <button 
              onClick={() => setFilter('closed')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-all ${filter === 'closed' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <span className="hidden sm:inline">Geschlossen</span>
              <span className="sm:hidden">Gelöst</span> ({tickets.filter(t => t.status === 'closed').length})
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
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/50 text-slate-400 text-[11px] font-bold uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-3 sm:px-4 py-3">ID</th>
                    <th className="px-3 sm:px-4 py-3">Betreff</th>
                    <th className="px-3 sm:px-4 py-3">Ersteller</th>
                    <th className="px-3 sm:px-4 py-3">Status</th>
                    <th className="px-3 sm:px-4 py-3">Zuweisung</th>
                    <th className="px-3 sm:px-4 py-3 text-right">Aktionen</th>
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
                      <tr key={tk.id} className={`hover:bg-slate-850/40 transition-colors ${tk.hasUnread === 1 ? 'bg-violet-950/20' : ''}`}>
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-[11px] font-bold text-slate-500">
                          <div className="flex items-center gap-1.5">
                            {tk.hasUnread === 1 && (
                              <span 
                                className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse shrink-0" 
                                title="Ungelesene Nachrichten vorhanden"
                              />
                            )}
                            <span>{tk.id}</span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 max-w-[180px] sm:max-w-xs md:max-w-md">
                          <div className="flex items-center gap-2 min-w-0">
                            {tk.hasUnread === 1 && (
                              <span 
                                className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md text-[9px] font-bold shrink-0 shadow-sm"
                                title="Ungelesene Nachrichten in diesem Ticket"
                              >
                                <i className="fa-solid fa-envelope text-amber-400 animate-bounce"></i>
                                <span>Neu</span>
                              </span>
                            )}
                            <Link 
                              href={`/agent/tickets/${tk.id}`} 
                              className={`font-bold hover:text-violet-400 transition-colors block truncate ${tk.hasUnread === 1 ? 'text-white font-extrabold' : 'text-slate-200'}`}
                            >
                              {tk.title}
                            </Link>
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            Aktualisiert: {parseUtcDate(tk.updatedAt || tk.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 text-xs">
                          <div className="flex flex-col gap-0.5 max-w-[160px] sm:max-w-none">
                            {tk.creatorName && (
                              <span className="font-bold text-white block truncate">{tk.creatorName}</span>
                            )}
                            <span className="font-medium text-slate-400 font-mono text-[10px] truncate">{tk.creatorEmail}</span>
                            {tk.isRegisteredUser === 1 ? (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-400 w-fit">
                                <i className="fa-solid fa-user-check"></i> Angemeldet
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold text-amber-400/80 w-fit">
                                <i className="fa-solid fa-user-slash"></i> Gast
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5">
                          {tk.status !== 'closed' ? (
                            <select 
                              value={tk.assignedAgentId || ''}
                              onChange={(e) => handleQuickAssign(tk.id, e.target.value)}
                              className="bg-slate-950 border border-slate-800 text-[11px] rounded px-2 py-1 focus:outline-none focus:border-violet-500 text-slate-300 max-w-[130px] sm:max-w-none truncate"
                            >
                              <option value="">-- Unzugewiesen --</option>
                              {agents.map(ag => (
                                <option key={ag.id} value={ag.id}>
                                  {ag.name ? `${ag.name} (${ag.email.split('@')[0]})` : ag.email.split('@')[0]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-emerald-400 font-medium truncate flex items-center gap-1">
                              <i className="fa-solid fa-lock text-[10px] text-emerald-500"></i>
                              <span>
                                {tk.closedByName 
                                  ? `Geschlossen von ${tk.closedByName}` 
                                  : tk.closedByEmail 
                                    ? `Geschlossen von ${tk.closedByEmail.split('@')[0]}` 
                                    : tk.assignedAgentEmail 
                                      ? `Geschlossen von ${tk.assignedAgentEmail.split('@')[0]}` 
                                      : 'Geschlossen'}
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            <Link 
                              href={`/agent/tickets/${tk.id}`}
                              className="bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/20 font-bold text-[11px] px-2.5 py-1 rounded-lg transition-all shrink-0"
                            >
                              Bearbeiten
                            </Link>
                            {user?.role === 'admin' && (
                              <button
                                onClick={() => handleDeleteTicket(tk.id)}
                                className="bg-red-650/20 hover:bg-red-650 text-red-300 hover:text-white border border-red-500/20 font-bold text-[11px] px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0"
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

      {/* On-Behalf Ticket Creation Modal */}
      {showBehalfModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/40 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">Ticket im Namen eines Benutzers erstellen</h3>
                <p className="text-[10px] text-violet-400 font-bold uppercase tracking-wider mt-0.5">Assistenten-Modus</p>
              </div>
              <button 
                onClick={() => setShowBehalfModal(false)}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-850"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {/* Modal Content */}
            {!showBehalfForm ? (
              /* Chat Mode */
              <>
                <div className="p-6 flex-grow overflow-y-auto space-y-4 min-h-[300px]">
                  {behalfMessages.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-xl ${msg.sender === 'user' ? 'bg-slate-700 text-slate-350' : 'bg-violet-600/10 text-violet-400 border border-violet-500/25'} flex items-center justify-center shrink-0 mt-1 shadow-md`}>
                        <i className={`fa-solid fa-${msg.sender === 'user' ? 'user-tie' : 'robot'} text-xs`}></i>
                      </div>
                      <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} max-w-full`}>
                        {msg.sender === 'user' ? (
                          <div className="bg-violet-650 text-white rounded-tr-none p-3.5 rounded-2xl shadow-sm text-sm whitespace-pre-wrap leading-relaxed">
                            {msg.text}
                          </div>
                        ) : (
                          <div className="bg-slate-950 border border-slate-850 text-slate-200 rounded-tl-none p-3.5 rounded-2xl shadow-sm text-sm leading-relaxed">
                            <div 
                              className="markdown-content"
                              dangerouslySetInnerHTML={{ __html: marked.parse(msg.text || '') }}
                            />
                          </div>
                        )}
                        <span className="text-[9px] text-slate-500 mt-1 mx-1">
                          {msg.sender === 'user' ? 'Du (Agent)' : 'IT-Assistent'}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {isBehalfTyping && (
                    <div className="flex gap-3 max-w-[85%]">
                      <div className="w-8 h-8 rounded-xl bg-violet-600/10 text-violet-400 border border-violet-500/25 flex items-center justify-center shrink-0 mt-1 shadow-md">
                        <i className="fa-solid fa-robot text-xs"></i>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-850 p-4 rounded-2xl rounded-tl-none">
                        <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <form onSubmit={handleSendBehalfMessage} className="p-4 border-t border-slate-800 bg-slate-950/20 shrink-0 flex gap-3">
                  <input
                    type="text"
                    value={behalfInput}
                    onChange={(e) => setBehalfInput(e.target.value)}
                    placeholder="Problem oder Benutzerdaten beschreiben..."
                    className="flex-grow bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!behalfInput.trim() || isBehalfTyping}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 text-white font-bold px-5 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-md"
                  >
                    <i className="fa-solid fa-paper-plane"></i>
                  </button>
                </form>
              </>
            ) : (
              /* Review Form Mode */
              <form onSubmit={handleSubmitBehalfForm} className="flex flex-col flex-grow overflow-hidden">
                <div className="p-6 overflow-y-auto space-y-4 flex-grow">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex gap-3 items-start mb-2">
                    <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400"><i className="fa-solid fa-circle-check text-base"></i></div>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-300">Daten erfolgreich erfasst!</h4>
                      <p className="text-[11px] text-slate-400 mt-1">Die KI hat die Ticket-Details extrahiert. Bitte überprüfe die Angaben unten und passe sie ggf. an.</p>
                    </div>
                  </div>

                  {/* Betroffener User */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Name des Benutzers</label>
                      <input
                        type="text"
                        value={behalfFormName}
                        onChange={(e) => setBehalfFormName(e.target.value)}
                        placeholder="z. B. Julian Jost"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">E-Mail-Adresse *</label>
                      <input
                        type="email"
                        required
                        value={behalfFormEmail}
                        onChange={(e) => setBehalfFormEmail(e.target.value)}
                        placeholder="z. B. julian@schule.de"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Telefonnummer & Zuweisung */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Telefonnummer (optional)</label>
                      <input
                        type="text"
                        value={behalfFormPhone}
                        onChange={(e) => setBehalfFormPhone(e.target.value)}
                        placeholder="z. B. 0123-456789"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Zuweisen an *</label>
                      <select
                        value={behalfFormAssignee}
                        onChange={(e) => setBehalfFormAssignee(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                      >
                        <option value="auto">Automatische Zuweisung (KI)</option>
                        <option value="unassigned">Keine Zuweisung (Offen)</option>
                        {agents.map((ag) => (
                          <option key={ag.id} value={ag.id}>
                            {ag.name ? `${ag.name} (${ag.email})` : ag.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Ticket-Betreff / Titel *</label>
                    <input
                      type="text"
                      required
                      value={behalfFormTitle}
                      onChange={(e) => setBehalfFormTitle(e.target.value)}
                      placeholder="z. B. Outlook Anmeldeproblem"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>

                  {/* Problembeschreibung */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Problembeschreibung</label>
                    <textarea
                      value={behalfFormDescription}
                      onChange={(e) => setBehalfFormDescription(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Bisherige Lösungsversuche */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Bisherige Lösungsversuche</label>
                    <textarea
                      value={behalfFormAttempts}
                      onChange={(e) => setBehalfFormAttempts(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                    />
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/40 shrink-0 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowBehalfForm(false)}
                    className="border border-slate-800 hover:bg-slate-800 text-slate-350 font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    Zurück zum Chat
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBehalfTicket}
                    className="bg-emerald-650 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                  >
                    {isSubmittingBehalfTicket && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    )}
                    <span>Ticket final erstellen</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

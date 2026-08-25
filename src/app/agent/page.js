'use client';

import { useState, useEffect, useRef } from 'react';
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
  const [ticketCounts, setTicketCounts] = useState({ active: 0, unread: 0, mine: 0, unassigned: 0, closed: 0 });
  const [agents, setAgents] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('active'); // 'active', 'mine', 'unassigned', 'closed'
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;
  const [logoutLabel, setLogoutLabel] = useState('Abmelden');
  const activeTicketsRef = useRef([]);
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
        if (data.text) {
          setBehalfMessages(prev => [...prev, { sender: 'bot', text: data.text }]);
        }
        
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
      } else {
        const errData = await res.json().catch(() => ({}));
        setBehalfMessages(prev => [...prev, { sender: 'bot', text: `Fehler beim Generieren der Antwort: ${errData.error || 'Serverfehler'}` }]);
      }
    } catch (err) {
      console.error('Fehler bei On-Behalf Chat:', err);
      setBehalfMessages(prev => [...prev, { sender: 'bot', text: 'Verbindungsfehler beim Senden der Nachricht.' }]);
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

  // Multi-Toast Stack Notification State für Agenten
  const [toastNotifications, setToastNotifications] = useState([]);

  // Sound-Effekt abspielen bei neuer Benachrichtigung (Web Audio API)
  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  };

  const addToastNotification = (toastObj) => {
    const toastId = `toast-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newToast = { ...toastObj, id: toastId };

    setToastNotifications(prev => [...prev.slice(-3), newToast]); // Stapelt bis zu 4 Toasts gleichzeitig
    playNotificationSound();

    setTimeout(() => {
      setToastNotifications(prev => prev.filter(t => t.id !== toastId));
    }, 7000);
  };

  const removeToastNotification = (toastId) => {
    setToastNotifications(prev => prev.filter(t => t.id !== toastId));
  };

  // Live Heartbeat & Hintergrund-Aktualisierung für Agenten
  useEffect(() => {
    if (!user) return;

    const pingHeartbeat = () => {
      fetch(`/api/live/sync?roomType=dashboard&roomId=global&myRole=${user.role || 'agent'}&myEmail=${encodeURIComponent(user.email || '')}`)
        .catch(() => {});
    };

    pingHeartbeat();

    const interval = setInterval(() => {
      // 1. Heartbeat pingen, damit Agent immer live "Online" ist
      pingHeartbeat();

      // 2. Aktive Tickets stumm neu laden für Live-Pushs & Zähler-Updates
      fetch('/api/tickets?status=active')
        .then(r => r.json())
        .then(data => {
          if (data.counts) {
            setTicketCounts(data.counts);
          }

          if (data.tickets) {
            const prevActive = activeTicketsRef.current;
            if (prevActive.length > 0) {
              const prevIds = new Set(prevActive.map(t => t.id));
              const brandNewTickets = data.tickets.filter(t => !prevIds.has(t.id));
              
              if (brandNewTickets.length > 0) {
                for (const newest of brandNewTickets) {
                  addToastNotification({
                    type: 'new_ticket',
                    title: `Neues Ticket: ${newest.title}`,
                    text: `Erstellt von ${newest.creatorName || newest.creatorEmail}`,
                    ticketId: newest.id
                  });
                }
              } else {
                const newlyUnreadTickets = data.tickets.filter(nt => {
                  const ot = prevActive.find(p => p.id === nt.id);
                  return ot && ot.hasUnread === 0 && nt.hasUnread === 1;
                });
                for (const newlyUnread of newlyUnreadTickets) {
                  addToastNotification({
                    type: 'new_message',
                    title: `Neue Nachricht in #${newlyUnread.id}`,
                    text: `${newlyUnread.title} (${newlyUnread.creatorEmail})`,
                    ticketId: newlyUnread.id
                  });
                }
              }
            }
            activeTicketsRef.current = data.tickets;

            // NUR aktualisieren, wenn der Agent nicht gerade in der geschlossenen Ansicht stöbert
            setTickets(prev => {
              if (filter === 'closed') return prev;
              return data.tickets;
            });
          }
        })
        .catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [user, filter]);

  useEffect(() => {
    if (user) loadData();
  }, [filter]);

  const loadData = async () => {
    try {
      const statusParam = filter === 'closed' ? 'closed' : filter === 'all' ? 'all' : 'active';
      const [ticketsRes, agentsRes] = await Promise.all([
        fetch(`/api/tickets?status=${statusParam}`),
        fetch('/api/agents')
      ]);

      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setTickets(data.tickets || []);
        if (data.counts) {
          setTicketCounts(data.counts);
        }
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

  const handleReopenTicket = async (ticketId) => {
    if (!confirm(`Ticket #${ticketId} wirklich wieder öffnen?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen' })
      });

      if (res.ok) {
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Wiedereröffnen.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  const filteredTickets = tickets.filter(t => {
    if (filter === 'unread') {
      if (!(t.hasUnread === 1 && t.status !== 'closed')) return false;
    } else if (filter === 'mine') {
      if (!((t.status === 'open' || t.status === 'assigned') && t.assignedAgentId === user?.id)) return false;
    } else if (filter === 'unassigned') {
      if (!((t.status === 'open' || t.status === 'assigned') && !t.assignedAgentId)) return false;
    } else if (filter === 'active') {
      if (!(t.status === 'open' || t.status === 'assigned')) return false;
    } else if (filter === 'closed') {
      if (t.status !== 'closed') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const idMatch = t.id?.toLowerCase().includes(q);
      const titleMatch = t.title?.toLowerCase().includes(q);
      const emailMatch = t.creatorEmail?.toLowerCase().includes(q);
      const nameMatch = t.creatorName?.toLowerCase().includes(q);
      const agentMatch = t.assignedAgentEmail?.toLowerCase().includes(q);
      return idMatch || titleMatch || emailMatch || nameMatch || agentMatch;
    }

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / ITEMS_PER_PAGE));
  const paginatedTickets = filteredTickets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
        <div className="bg-slate-900/50 p-5 md:p-6 border border-slate-800 rounded-2xl space-y-4 shadow-md">
          {/* Top Row: Title + Action Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">Support-Ticket-Übersicht</h2>
              <p className="text-xs text-slate-400 mt-0.5">Verwalte, weise zu und beantworte Support-Tickets</p>
            </div>
            <button
              onClick={handleOpenBehalfModal}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 self-start sm:self-auto shadow-md hover:shadow-violet-600/20 cursor-pointer shrink-0"
            >
              <i className="fa-solid fa-plus-circle text-sm"></i>
              <span>Neues Ticket (im Namen von...)</span>
            </button>
          </div>
          
          {/* Bottom Row: Filter Tabs & Live Search Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
            {/* Filter Tabs */}
            <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs font-semibold overflow-x-auto no-scrollbar gap-1 shrink-0">
              <button 
                onClick={() => setFilter('active')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${filter === 'active' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span>Aktiv</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filter === 'active' ? 'bg-violet-700 text-white' : 'bg-slate-900 text-slate-400'}`}>{ticketCounts.active}</span>
              </button>
              <button 
                onClick={() => setFilter('unread')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${filter === 'unread' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <i className="fa-solid fa-envelope text-amber-400 text-xs"></i>
                <span>Ungelesen</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filter === 'unread' ? 'bg-violet-700 text-white' : 'bg-slate-900 text-slate-400'}`}>{ticketCounts.unread}</span>
              </button>
              <button 
                onClick={() => setFilter('mine')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${filter === 'mine' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span>Mir zugewiesen</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filter === 'mine' ? 'bg-violet-700 text-white' : 'bg-slate-900 text-slate-400'}`}>{ticketCounts.mine}</span>
              </button>
              <button 
                onClick={() => setFilter('unassigned')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${filter === 'unassigned' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span>Unzugewiesen</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filter === 'unassigned' ? 'bg-violet-700 text-white' : 'bg-slate-900 text-slate-400'}`}>{ticketCounts.unassigned}</span>
              </button>
              <button 
                onClick={() => setFilter('closed')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${filter === 'closed' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span>Geschlossen</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filter === 'closed' ? 'bg-violet-700 text-white' : 'bg-slate-900 text-slate-400'}`}>{ticketCounts.closed}</span>
              </button>
            </div>

            {/* Live Search Bar */}
            <div className="relative w-full lg:w-72 xl:w-80 shrink-0">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tickets durchsuchen..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1 text-xs"
                  title="Suche leeren"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tickets Table / List */}
        {filteredTickets.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <div className="text-slate-600 text-4xl"><i className="fa-regular fa-folder-open"></i></div>
            <p className="text-sm text-slate-400">
              {searchQuery ? `Keine Tickets gefunden für "${searchQuery}".` : 'Keine Support-Tickets in dieser Ansicht vorhanden.'}
            </p>
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
                  {paginatedTickets.map((tk) => {
                    
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
                      <tr key={tk.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-violet-400 font-bold whitespace-nowrap">
                          {tk.id}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 max-w-[180px] sm:max-w-xs md:max-w-md">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {tk.hasUnread === 1 && tk.status !== 'closed' && (
                              <span 
                                className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md text-[9px] font-bold shrink-0 shadow-sm"
                                title="Ungelesene Nachrichten vorhanden"
                              >
                                <i className="fa-solid fa-envelope text-amber-400 animate-bounce"></i>
                                <span>Neu</span>
                              </span>
                            )}
                            <Link 
                              href={`/agent/tickets/${tk.id}`} 
                              className={`font-bold hover:text-violet-400 transition-colors block truncate ${tk.hasUnread === 1 && tk.status !== 'closed' ? 'text-white font-extrabold' : 'text-slate-200'}`}
                            >
                              {tk.title}
                            </Link>
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            Aktualisiert: {parseUtcDate(tk.updatedAt || tk.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-300 font-semibold">{tk.creatorName || tk.creatorEmail.split('@')[0]}</span>
                            {tk.isRegisteredUser === 1 ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-bold" title="Angemeldeter Benutzer (Passwort/IDP verifiziert)">
                                <i className="fa-solid fa-circle-check text-[8px]"></i>
                                <span>Verifiziert</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[9px] bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.2 rounded-full" title="Gast / Unverifiziert">
                                <span>Gast</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 block truncate">{tk.creatorEmail}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap">
                          {tk.status !== 'closed' ? (
                            <select
                              value={tk.assignedAgentId || ''}
                              onChange={(e) => handleQuickAssign(tk.id, e.target.value)}
                              className="bg-slate-950 border border-slate-800 text-slate-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:border-violet-500 font-medium cursor-pointer"
                            >
                              <option value="">(Nicht zugewiesen)</option>
                              {agents.map((ag) => (
                                <option key={ag.id} value={ag.id}>
                                  {ag.name || ag.email}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">
                              Geschlossen
                              {tk.closedByName && (
                                <span className="block not-italic text-[10px] text-slate-400 font-medium">
                                  von {tk.closedByName}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            {tk.status === 'closed' && (
                              <button
                                onClick={() => handleReopenTicket(tk.id)}
                                className="w-7 h-7 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-sm"
                                title="Ticket wieder öffnen"
                              >
                                <i className="fa-solid fa-lock-open text-xs"></i>
                              </button>
                            )}
                            <Link 
                              href={`/agent/tickets/${tk.id}`}
                              className="w-7 h-7 rounded-lg bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/30 flex items-center justify-center transition-all shrink-0 shadow-sm"
                              title="Ticket bearbeiten / ansehen"
                            >
                              <i className="fa-solid fa-pen-to-square text-xs"></i>
                            </Link>
                            {user?.role === 'admin' && (
                              <button
                                onClick={() => handleDeleteTicket(tk.id)}
                                className="w-7 h-7 rounded-lg bg-red-650/20 hover:bg-red-650 text-red-300 hover:text-white border border-red-500/30 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-sm"
                                title="Ticket unwiderruflich löschen"
                              >
                                <i className="fa-solid fa-trash-can text-xs"></i>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="bg-slate-950/60 border-t border-slate-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <div className="text-[11px]">
                  Zeige <span className="font-bold text-slate-200">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> bis <span className="font-bold text-slate-200">{Math.min(currentPage * ITEMS_PER_PAGE, filteredTickets.length)}</span> von <span className="font-bold text-slate-200">{filteredTickets.length}</span> Tickets
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="bg-slate-850 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 border border-slate-750 px-3 py-1.5 rounded-xl font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <i className="fa-solid fa-chevron-left text-[10px]"></i>
                    <span>Zurück</span>
                  </button>
                  <span className="px-2 text-[11px] font-bold text-slate-300">
                    Seite {currentPage} von {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="bg-slate-850 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 border border-slate-750 px-3 py-1.5 rounded-xl font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span>Weiter</span>
                    <i className="fa-solid fa-chevron-right text-[10px]"></i>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

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

      {/* Gestapelte Toast-Benachrichtigungen (Mobil: unten von unten nachschiebend, Desktop: unten rechts von rechts einschiebend) */}
      {toastNotifications.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 flex flex-col gap-3 items-stretch sm:items-end pointer-events-none">
          {toastNotifications.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto max-w-md w-full sm:w-96 bg-slate-900/95 backdrop-blur-md border border-violet-500/40 p-4 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-start gap-3.5 text-white animate-toast-mobile sm:animate-toast-desktop transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                <i className="fa-solid fa-bell text-lg animate-bounce"></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">
                    {toast.type === 'new_ticket' ? 'Neues Support-Ticket' : 'Neue Nachricht'}
                  </span>
                  <button 
                    onClick={() => removeToastNotification(toast.id)}
                    className="text-slate-400 hover:text-white p-1 transition-colors cursor-pointer"
                    title="Schließen"
                  >
                    <i className="fa-solid fa-xmark text-sm"></i>
                  </button>
                </div>
                <h5 className="text-sm font-bold text-white truncate mt-0.5">
                  {toast.title}
                </h5>
                <p className="text-xs text-slate-300 line-clamp-2 mt-1">
                  {toast.text}
                </p>
                {toast.ticketId && (
                  <Link
                    href={`/agent/tickets/${toast.ticketId}`}
                    onClick={() => removeToastNotification(toast.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 mt-2.5 transition-colors"
                  >
                    <span>Zum Ticket wechseln</span>
                    <i className="fa-solid fa-arrow-right text-[10px]"></i>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

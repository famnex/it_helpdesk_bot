'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { marked } from 'marked';
import { renderMarkdownWithLinks } from '@/lib/formatting';

const getCleanImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  let clean = url.replace(/^\/helpdesk/, '');
  if (clean.startsWith('/uploads/')) {
    clean = clean.replace(/^\/uploads\//, '/api/uploads/');
  }
  if (!clean.startsWith('/')) clean = '/' + clean;
  return `/helpdesk${clean}`;
};

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

export default function AgentTicketDetailPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [agents, setAgents] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Forms
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [attachment, setAttachment] = useState(null); // { file, previewUrl, name }
  const [solutionText, setSolutionText] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeSuccessChunks, setCloseSuccessChunks] = useState(null);
  const [isSilentClose, setIsSilentClose] = useState(false);

  // Edit Title States
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastTypedTimeRef = useRef(0);
  const maxTicketMsgIdRef = useRef(0);
  const router = useRouter();

  const [isOtherPartyTyping, setIsOtherPartyTyping] = useState(false);
  const [partnerPresence, setPartnerPresence] = useState(null);
  const [otherTicketsRef, setOtherTicketsRef] = useState([]);
  const [toastNotifications, setToastNotifications] = useState([]);

  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
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

    setToastNotifications(prev => [...prev.slice(-3), newToast]);
    playNotificationSound();

    setTimeout(() => {
      setToastNotifications(prev => prev.filter(t => t.id !== toastId));
    }, 7000);
  };

  const removeToastNotification = (toastId) => {
    setToastNotifications(prev => prev.filter(t => t.id !== toastId));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('Die Datei überschreitet die maximale Größe von 10 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const isImg = file.type.startsWith('image/');
    let previewUrl = null;
    if (isImg) {
      previewUrl = URL.createObjectURL(file);
    }
    setAttachment({
      file,
      previewUrl,
      name: file.name,
      isImage: isImg
    });
  };

  const handleRemoveAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          loadData();
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOtherPartyTyping]);

  // Live Syncing: Nachrichten & Tipp-Status ("...") alle 1.5 Sekunden prüfen
  useEffect(() => {
    if (!id || !user) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/live/sync?roomType=ticket&roomId=${id}&lastMsgId=${maxTicketMsgIdRef.current}&myRole=${user.role}&myEmail=${encodeURIComponent(user.email || '')}`);
        if (res.ok) {
          const data = await res.json();
          setIsOtherPartyTyping(!!data.isOtherPartyTyping);
          if (data.partnerPresence) setPartnerPresence(data.partnerPresence);

          if (data.newMessages && data.newMessages.length > 0) {
            const newNumericIds = data.newMessages.map(m => typeof m.id === 'number' ? m.id : 0);
            if (newNumericIds.length > 0) {
              maxTicketMsgIdRef.current = Math.max(maxTicketMsgIdRef.current, ...newNumericIds);
            }

            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id).filter(Boolean));
              const existingTexts = new Set(prev.map(m => (m.text || '').trim()));
              const toAdd = data.newMessages.filter(nm => !existingIds.has(nm.id) && !existingTexts.has((nm.text || '').trim()));
              if (toAdd.length === 0) return prev;
              return [...prev, ...toAdd];
            });
          }
        }
      } catch (e) {
        // Fehler beim Polling ignorieren
      }

      // Stumme Abfrage nur AKTIVER offener Tickets, um Benachrichtigungen für ANDERE Tickets zu zeigen
      fetch('/api/tickets?status=active')
        .then(r => r.json())
        .then(data => {
          if (data.tickets) {
            setOtherTicketsRef(prev => {
              if (prev.length > 0) {
                const newlyUnreadOthers = data.tickets.filter(nt => {
                  if (nt.id === id) return false; // Das aktuell geöffnete Ticket ignorieren
                  const ot = prev.find(p => p.id === nt.id);
                  return ot && ot.hasUnread === 0 && nt.hasUnread === 1;
                });
                for (const newlyUnreadOther of newlyUnreadOthers) {
                  addToastNotification({
                    type: 'new_message',
                    title: `Neue Nachricht in #${newlyUnreadOther.id}`,
                    text: `${newlyUnreadOther.title} (${newlyUnreadOther.creatorEmail})`,
                    ticketId: newlyUnreadOther.id
                  });
                }
              }
              return data.tickets;
            });
          }
        })
        .catch(() => {});
    }, 1500);

    return () => clearInterval(interval);
  }, [id, user]);

  const handleReplyInputChange = (e) => {
    const val = e.target.value;
    setReplyText(val);

    const now = Date.now();
    if (now - lastTypedTimeRef.current > 2000) {
      lastTypedTimeRef.current = now;
      fetch('/api/live/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomType: 'ticket',
          roomId: id,
          role: user?.role || 'agent',
          email: user?.email || '',
          isTyping: true
        })
      }).catch(() => {});
    }
  };

  const isNearBottomRef = useRef(true);

  const handleScroll = (e) => {
    const el = e.target;
    if (el) {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }
  };

  const scrollToBottom = (force = false) => {
    if (force || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const loadData = async () => {
    try {
      const [ticketRes, agentsRes] = await Promise.all([
        fetch(`/api/tickets/${id}`),
        fetch('/api/agents')
      ]);

      if (ticketRes.ok) {
        const data = await ticketRes.json();
        setTicket(data.ticket);
        
        let ticketMessages = data.messages || [];
        const numericTicketIds = ticketMessages.map(m => typeof m.id === 'number' ? m.id : 0);
        if (numericTicketIds.length > 0) {
          maxTicketMsgIdRef.current = Math.max(...numericTicketIds, 0);
        }
        if (data.ticket.chatId) {
          try {
            const chatRes = await fetch(`/api/chat?chatId=${data.ticket.chatId}`);
            if (chatRes.ok) {
              const chatData = await chatRes.json();
              const chatMessages = chatData.messages || [];
              const ticketCreatedEventIndex = chatMessages.findIndex(m => m.text && m.text.startsWith('[SYSTEM_EVENT: TICKET_CREATED:'));
              
              let preTicketMessages = [];
              let postTicketMessages = [];
              
              if (ticketCreatedEventIndex !== -1) {
                preTicketMessages = chatMessages.slice(0, ticketCreatedEventIndex);
                postTicketMessages = chatMessages.slice(ticketCreatedEventIndex + 1);
              } else {
                preTicketMessages = chatMessages;
              }

              const ticketCreatedTime = data.ticket.createdAt ? new Date(data.ticket.createdAt).getTime() : 0;

              const chatHistory = preTicketMessages.map(m => {
                const mTime = m.createdAt ? new Date(m.createdAt).getTime() : 0;
                // Pre-Ticket ist eine Nachricht nur dann, wenn sie VOR der Ticketerstellung gesendet wurde
                const isPre = ticketCreatedTime > 0 ? (mTime < ticketCreatedTime - 1000) : true;
                return {
                  ...m,
                  isPreTicket: isPre,
                  senderRole: m.sender === 'user' ? 'customer' : 'bot',
                  senderEmail: m.sender === 'user' ? (data.ticket.creatorEmail || 'Kunde') : 'KI-Bot',
                  senderName: m.sender === 'user' ? (data.ticket.creatorName || 'Kunde') : 'IT-Helpdesk-Bot',
                  text: m.text,
                  imageUrl: m.imageUrl,
                  createdAt: m.createdAt
                };
              });

              const missingPostMessages = postTicketMessages
                .map(m => ({
                  ...m,
                  isPreTicket: false,
                  senderRole: m.sender === 'user' ? 'customer' : 'bot',
                  senderEmail: m.sender === 'user' ? (data.ticket.creatorEmail || 'Kunde') : 'KI-Bot',
                  senderName: m.sender === 'user' ? (data.ticket.creatorName || 'Kunde') : 'IT-Helpdesk-Bot',
                  text: m.text,
                  imageUrl: m.imageUrl,
                  createdAt: m.createdAt
                }))
                .filter(pm => {
                  const existsInTicket = ticketMessages.some(tm => 
                    tm.senderRole === pm.senderRole && 
                    tm.text === pm.text
                  );
                  return !existsInTicket;
                });

              const combined = [...chatHistory, ...missingPostMessages, ...ticketMessages];
              
              // Eindeutige Nachrichten filtern (um Duplikate aus Chat-Import und Pre-Ticket-Fetch zu verhindern)
              const seenMap = new Set();
              const deduplicated = [];
              for (const m of combined) {
                const key = `${m.senderRole || m.sender}_${(m.text || '').trim()}_${m.imageUrl || ''}`;
                if (!seenMap.has(key)) {
                  seenMap.add(key);
                  deduplicated.push(m);
                }
              }

              deduplicated.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
              setMessages(deduplicated);
            } else {
              const seenMap = new Set();
              const deduplicated = [];
              for (const m of ticketMessages) {
                const key = `${m.senderRole || m.sender}_${(m.text || '').trim()}_${m.imageUrl || ''}`;
                if (!seenMap.has(key)) {
                  seenMap.add(key);
                  deduplicated.push(m);
                }
              }
              setMessages(deduplicated);
            }
          } catch (e) {
            console.error('Fehler beim Laden des Pre-Ticket-Chats:', e);
            const seenMap = new Set();
            const deduplicated = [];
            for (const m of ticketMessages) {
              const key = `${m.senderRole || m.sender}_${(m.text || '').trim()}_${m.imageUrl || ''}`;
              if (!seenMap.has(key)) {
                seenMap.add(key);
                deduplicated.push(m);
              }
            }
            setMessages(deduplicated);
          }
        } else {
          const seenMap = new Set();
          const deduplicated = [];
          for (const m of ticketMessages) {
            const key = `${m.senderRole || m.sender}_${(m.text || '').trim()}_${m.imageUrl || ''}`;
            if (!seenMap.has(key)) {
              seenMap.add(key);
              deduplicated.push(m);
            }
          }
          setMessages(deduplicated);
        }
      } else {
        router.push('/agent');
      }

      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Fehler beim Laden der Ticket-Details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if ((!replyText.trim() && !attachment) || isSending) return;

    setIsSending(true);
    try {
      let uploadedUrl = null;
      if (attachment?.file) {
        const formData = new FormData();
        formData.append('file', attachment.file);
        const uploadRes = await fetch('/api/tickets/upload', {
          method: 'POST',
          body: formData
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedUrl = uploadData.url;
        } else {
          alert('Fehler beim Hochladen des Dateianhangs.');
          setIsSending(false);
          return;
        }
      }

      const res = await fetch(`/api/tickets/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: replyText,
          is_internal: isInternal,
          imageUrl: uploadedUrl
        })
      });
      if (res.ok) {
        setReplyText('');
        handleRemoveAttachment();
        setIsInternal(false);
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Senden.');
      }
    } catch (err) {
      console.error('Fehler beim Senden:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleAssign = async (agentId) => {
    try {
      const res = await fetch(`/api/tickets/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_agent_id: agentId })
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error('Fehler bei Zuweisung:', err);
    }
  };

  const handleCloseTicket = async (e) => {
    e.preventDefault();
    if (!isSilentClose && !solutionText.trim()) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/tickets/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solution: solutionText, silent: isSilentClose })
      });
      const data = await res.json();
      setIsSending(false);
      
      if (res.ok) {
        setCloseSuccessChunks(data.savedChunks || []);
        setShowCloseModal(false);
        setSolutionText('');
        setIsSilentClose(false);
        await loadData();
      } else {
        alert(data.error || 'Fehler beim Schließen.');
      }
    } catch (err) {
      console.error('Fehler beim Schließen des Tickets:', err);
      setIsSending(false);
    }
  };

  const handleSaveTitle = async (e) => {
    if (e) e.preventDefault();
    if (!editedTitle.trim() || isSavingTitle) return;

    setIsSavingTitle(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle.trim() })
      });
      if (res.ok) {
        setIsEditingTitle(false);
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Ändern des Themas.');
      }
    } catch (err) {
      console.error('Fehler beim Aktualisieren des Themas:', err);
    } finally {
      setIsSavingTitle(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center flex-col gap-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Lade Ticket...</p>
      </div>
    );
  }

  if (!ticket) return null;

  let statusLabel = 'Offen';
  let statusClass = 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
  if (ticket.status === 'assigned') {
    statusLabel = 'Zugeordnet';
    statusClass = 'bg-violet-500/10 text-violet-400 border border-violet-500/20';
  } else if (ticket.status === 'closed') {
    statusLabel = 'Gelöst';
    statusClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Compact Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-5 py-2 sm:py-2.5 flex items-center justify-between gap-2.5 shrink-0 shadow-lg z-20 sticky top-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link href="/agent" className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 sm:p-2 rounded-lg border border-slate-700 transition-colors flex items-center justify-center shrink-0 text-xs" title="Zurück zur Übersicht">
            <i className="fa-solid fa-arrow-left"></i>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {isEditingTitle ? (
                <form onSubmit={handleSaveTitle} className="flex items-center gap-1.5 w-full max-w-md">
                  <input 
                    type="text" 
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-violet-500 text-slate-200 flex-1"
                    disabled={isSavingTitle}
                    autoFocus
                  />
                  <button 
                    type="submit" 
                    disabled={isSavingTitle || !editedTitle.trim()}
                    className="bg-emerald-650 hover:bg-emerald-700 text-white p-1.5 rounded-lg text-xs flex items-center justify-center shrink-0 w-7 h-7 transition-colors disabled:opacity-40"
                    title="Speichern"
                  >
                    <i className="fa-solid fa-check"></i>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsEditingTitle(false)}
                    disabled={isSavingTitle}
                    className="bg-slate-800 hover:bg-slate-750 text-slate-300 p-1.5 rounded-lg text-xs flex items-center justify-center shrink-0 w-7 h-7 transition-colors"
                    title="Abbrechen"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap max-w-full">
                  <span className="font-mono text-slate-400 text-xs font-bold shrink-0">{ticket.id}</span>
                  <span className="text-slate-600 font-bold">•</span>
                  <h1 className="text-xs sm:text-sm font-bold text-white max-w-[140px] sm:max-w-xs md:max-w-md lg:max-w-lg truncate">{ticket.title}</h1>
                  <button
                    onClick={() => {
                      setEditedTitle(ticket.title);
                      setIsEditingTitle(true);
                    }}
                    className="text-slate-500 hover:text-slate-300 p-0.5 transition-colors"
                    title="Thema bearbeiten"
                  >
                    <i className="fa-solid fa-pen text-[9px]"></i>
                  </button>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusClass} shrink-0`}>{statusLabel}</span>
                </div>
              )}
            </div>
            
            {/* Sub-header meta line with user status */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 mt-0.5">
              <span className="truncate max-w-[180px] sm:max-w-xs">
                Ersteller: <span className="font-semibold text-slate-200">{ticket.creatorName ? `${ticket.creatorName} (${ticket.creatorEmail})` : ticket.creatorEmail}</span>
              </span>

              {partnerPresence && (
                <span className="inline-flex items-center gap-1.5 text-[9px] font-medium px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    partnerPresence.isOnline 
                      ? 'bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]' 
                      : 'bg-slate-500'
                  }`}></span>
                  <span className={partnerPresence.isOnline ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {partnerPresence.statusText}
                  </span>
                </span>
              )}

              {/* Status-Badge: Angemeldeter User vs. Gast */}
              {ticket.isRegisteredUser === 1 ? (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-full shrink-0">
                  <i className="fa-solid fa-user-check text-[8px]"></i>
                  <span>Angemeldeter User</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded-full shrink-0">
                  <i className="fa-solid fa-user-slash text-[8px]"></i>
                  <span>Gast / Nicht angemeldet</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        {ticket.status !== 'closed' && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <select 
              value={ticket.assignedAgentId || ''}
              onChange={(e) => handleAssign(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:border-violet-500 text-slate-200 max-w-[110px] sm:max-w-[150px] truncate"
            >
              <option value="">-- Zuweisen --</option>
              {agents.map(ag => (
                <option key={ag.id} value={ag.id}>
                  {ag.name ? `${ag.name} (${ag.email.split('@')[0]})` : ag.email.split('@')[0]} ({ag.role === 'admin' ? 'Admin' : 'Agent'})
                </option>
              ))}
            </select>

            <button 
              onClick={() => setShowCloseModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-2.5 py-1 rounded-lg transition-all shadow-md flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <i className="fa-solid fa-check text-[10px]"></i>
              <span className="hidden sm:inline">Schließen</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Layout (Split View) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-0">
        
        {/* Chat History */}
        <main className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-950/20 min-h-0">
          
          {/* Success chunks display banner */}
          {closeSuccessChunks && (
            <div className="bg-emerald-950/80 border-b border-emerald-500/50 p-4 shrink-0 animate-fade-in space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-200 flex items-center gap-1.5">
                  <i className="fa-solid fa-brain"></i>
                  <span>KI-Gedächtnis aktualisiert!</span>
                </span>
                <button onClick={() => setCloseSuccessChunks(null)} className="text-emerald-400 hover:text-emerald-200 text-xs"><i className="fa-solid fa-xmark"></i></button>
              </div>
              <p className="text-[10px] text-slate-400">
                Die Lösung wurde analysiert und {closeSuccessChunks.filter(c => c.isNew).length} neue Chunks wurden der Wissensdatenbank hinzugefügt. ({closeSuccessChunks.filter(c => !c.isNew).length} Duplikate verworfen).
              </p>
            </div>
          )}

          {/* Messages scroll list */}
          <div onScroll={handleScroll} className="flex-grow overflow-y-auto p-6 space-y-6">
            
            {ticket.status === 'closed' && ticket.solution && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 shadow-lg max-w-2xl mx-auto flex items-start gap-4 mb-2 animate-fade-in">
                <div className="text-emerald-500 bg-emerald-500/20 p-2.5 rounded-xl"><i className="fa-solid fa-circle-check text-xl"></i></div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-200">Ticket erfolgreich gelöst</h4>
                  <p className="text-xs font-bold text-slate-300 mt-2">Hinterlegte Lösung:</p>
                  <p className="text-xs text-slate-400 mt-1 bg-slate-950 p-3 rounded-lg border border-slate-800">{ticket.solution}</p>
                </div>
              </div>
            )}

            {messages.map((msg, index) => {
              const isAgent = msg.senderRole === 'agent' || msg.senderRole === 'admin';
              const isBot = msg.senderRole === 'bot';
              const isSystem = msg.senderRole === 'system';
              const isInternalMessage = msg.isInternal === 1;
              const isRightAligned = isAgent || isBot;

              if (msg.text && msg.text.startsWith('[SYSTEM_EVENT:')) {
                return null;
              }

              if (isSystem) {
                return (
                  <div key={index} className="flex justify-center">
                    <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-500 px-3.5 py-1.5 rounded-xl shadow-sm font-bold tracking-wide uppercase">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              const firstTicketIndex = messages.findIndex(m => !m.isPreTicket);
              const isFirstTicketMessage = firstTicketIndex !== -1 && index === firstTicketIndex && messages.some(m => m.isPreTicket);

              // Avatar rendering helper
              const renderAvatar = () => {
                if (msg.senderRole === 'bot') {
                  return (
                    <div className="w-8 h-8 rounded-xl bg-violet-650/10 border border-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 mt-1 shadow-md">
                      <i className="fa-solid fa-robot text-xs"></i>
                    </div>
                  );
                }
                if (msg.senderAvatarUrl) {
                  return (
                    <img 
                      src={msg.senderAvatarUrl} 
                      alt="Avatar" 
                      className="w-8 h-8 rounded-xl object-cover border border-slate-850 shadow-md mt-1 shrink-0" 
                    />
                  );
                }
                const avatarBg = isAgent 
                  ? (isInternalMessage ? 'bg-violet-950 border border-violet-500/30 text-violet-400' : 'bg-slate-700 text-slate-300') 
                  : 'bg-sky-500/10 border border-sky-500/20 text-sky-400';
                return (
                  <div className={`w-8 h-8 rounded-xl ${avatarBg} flex items-center justify-center shrink-0 mt-1 shadow-md`}>
                    <i className={`fa-solid fa-${isAgent ? 'user-tie' : 'user'} text-xs`}></i>
                  </div>
                );
              };

              return (
                <div key={index} className="space-y-4">
                  {index === 0 && msg.isPreTicket && (
                    <div className="flex items-center gap-4 py-4 justify-center">
                      <div className="h-px bg-slate-800 flex-1"></div>
                      <span className="text-[9px] bg-slate-900 border border-slate-800 text-slate-500 px-3 py-1 rounded-full font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                        <i className="fa-solid fa-clock-rotate-left text-[10px]"></i>
                        <span>Chatverlauf vor Ticket</span>
                      </span>
                      <div className="h-px bg-slate-800 flex-1"></div>
                    </div>
                  )}
                  {isFirstTicketMessage && (
                    <div className="flex items-center gap-4 py-4 justify-center">
                      <div className="h-px bg-slate-800 flex-1"></div>
                      <span className="text-[9px] bg-slate-900 border border-slate-800 text-violet-400 px-3 py-1 rounded-full font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                        <i className="fa-solid fa-ticket-simple text-[10px]"></i>
                        <span>Ticket wurde erstellt</span>
                      </span>
                      <div className="h-px bg-slate-800 flex-1"></div>
                    </div>
                  )}
                  <div 
                    className={`flex gap-3 max-w-[80%] ${isRightAligned ? 'ml-auto flex-row-reverse' : ''} animate-fade-in`}
                  >
                    {renderAvatar()}
                    <div className={`flex flex-col ${isRightAligned ? 'items-end' : 'items-start'} max-w-full`}>
                      {/* Internal vermerk header */}
                      {isInternalMessage && (
                        <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                          <i className="fa-solid fa-lock text-[8px]"></i>
                          <span>Interner Vermerk (nur Mitarbeiter)</span>
                        </span>
                      )}
                      <div 
                        className={`${isRightAligned ? (isInternalMessage ? 'bg-amber-950/40 text-amber-100 border-2 border-amber-500/50 rounded-tr-none shadow-amber-950/30' : isBot ? 'bg-slate-850/85 border border-slate-750 text-slate-200 rounded-tr-none' : 'bg-violet-600 text-white rounded-tr-none') : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'} p-3.5 rounded-2xl shadow-md text-sm leading-relaxed`}
                      >
                        {msg.imageUrl && (
                          msg.imageUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) || msg.imageUrl.startsWith('data:image/') ? (
                            <div className="mb-2 max-w-xs overflow-hidden rounded-lg border border-slate-800 shadow-sm bg-slate-950">
                              <img 
                                src={getCleanImageUrl(msg.imageUrl)} 
                                alt="Angehängtes Bild" 
                                className="max-h-48 w-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(getCleanImageUrl(msg.imageUrl), '_blank')}
                              />
                            </div>
                          ) : (
                            <div className="mb-2">
                              <a
                                href={getCleanImageUrl(msg.imageUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 bg-slate-950/80 hover:bg-slate-900 border border-slate-700/60 text-sky-400 hover:text-sky-300 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all shadow-sm"
                              >
                                <i className="fa-solid fa-paperclip text-slate-400"></i>
                                <span>Anhang öffnen ({msg.imageUrl.split('/').pop() || 'Datei'})</span>
                                <i className="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                              </a>
                            </div>
                          )
                        )}
                        <div 
                          className="markdown-content"
                          dangerouslySetInnerHTML={{ __html: renderMarkdownWithLinks(msg.text || '') }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 mx-1">
                        {msg.senderRole === 'bot' ? 'IT-Helpdesk-Bot' : (msg.senderName || msg.senderEmail.split('@')[0])} - {parseUtcDate(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing Indicator */}
            {isOtherPartyTyping && (
              <div className="flex items-center gap-2 max-w-full animate-fade-in my-2">
                <div className="w-8 h-8 rounded-xl bg-sky-600/20 border border-sky-500/30 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0">
                  <i className="fa-solid fa-user"></i>
                </div>
                <div className="bg-slate-900 border border-slate-800 text-slate-400 px-4 py-2.5 rounded-2xl rounded-tl-none flex items-center gap-1.5 text-xs shadow-md">
                  <span className="font-semibold text-slate-300 mr-1">Kunde tippt</span>
                  <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Form */}
          {ticket.status !== 'closed' ? (
            <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0 sticky bottom-0 z-20">
              {/* Verstecktes Input für Dateiauswahl */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv"
              />

              <form onSubmit={handleSendReply} className={`max-w-4xl mx-auto flex flex-col gap-3 rounded-2xl p-2.5 shadow-inner transition-all ${
                isInternal 
                  ? 'bg-amber-950/20 border-2 border-amber-500/70 ring-1 ring-amber-500/30' 
                  : 'bg-slate-950 border border-slate-800'
              }`}>
                {isInternal && (
                  <div className="bg-amber-500/15 border border-amber-500/30 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in mx-1">
                    <i className="fa-solid fa-triangle-exclamation text-amber-400 text-sm"></i>
                    <span>INTERNE NOTIZ: Diese Nachricht ist nur für Support-Mitarbeiter sichtbar (Kunde sieht nichts).</span>
                  </div>
                )}

                <div className="flex justify-between items-center px-2 border-b border-slate-900 pb-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-slate-800 text-amber-500 bg-transparent focus:ring-0 focus:ring-offset-0"
                    />
                    <span className={`flex items-center gap-1 font-bold ${isInternal ? 'text-amber-300' : 'text-slate-400'}`}>
                      <i className="fa-solid fa-lock text-[10px]"></i>
                      <span>Als internen Vermerk speichern (Kunde sieht das nicht)</span>
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-slate-400 hover:text-sky-400 transition-colors flex items-center gap-1.5 font-medium px-2 py-1 rounded-lg hover:bg-slate-900"
                    title="Datei oder Bild anfügen"
                  >
                    <i className="fa-solid fa-paperclip text-sm"></i>
                    <span>Anhang anfügen</span>
                  </button>
                </div>

                {/* Anhang Vorschau */}
                {attachment && (
                  <div className="mx-2 p-2 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs animate-fade-in">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {attachment.isImage && attachment.previewUrl ? (
                        <img src={attachment.previewUrl} alt="Preview" className="w-10 h-10 object-cover rounded-lg border border-slate-800 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-sky-950/60 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-file text-sm"></i>
                        </div>
                      )}
                      <div className="truncate">
                        <span className="font-semibold text-slate-200 block truncate">{attachment.name}</span>
                        <span className="text-[10px] text-slate-400">Angehängte Datei bereit zum Senden</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveAttachment}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800 ml-2 shrink-0"
                      title="Anhang entfernen"
                    >
                      <i className="fa-solid fa-xmark text-sm"></i>
                    </button>
                  </div>
                )}
                
                <div className="flex items-end gap-3">
                  <textarea 
                    value={replyText}
                    onChange={handleReplyInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply(e);
                      }
                    }}
                    placeholder={isInternal ? "Schreibe eine INTERNE Notiz (nur für Kollegen sichtbar)..." : "Antworte dem Kunden..."}
                    rows="1"
                    className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[40px] py-2 px-2 text-sm text-slate-200 placeholder-slate-600 outline-none"
                    disabled={isSending}
                  />
                  <button 
                    type="submit"
                    disabled={(!replyText.trim() && !attachment) || isSending}
                    className={`p-3 transition-colors rounded-xl shrink-0 w-11 h-11 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed shadow-md text-white ${
                      isInternal 
                        ? 'bg-amber-600 hover:bg-amber-500' 
                        : 'bg-sky-600 hover:bg-sky-700'
                    }`}
                    title={isInternal ? "Interne Notiz speichern" : "Antwort senden"}
                  >
                    <i className={isInternal ? "fa-solid fa-floppy-disk text-sm" : "fa-solid fa-paper-plane text-sm"}></i>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0 text-center text-xs text-slate-500 font-bold uppercase tracking-wider sticky bottom-0 z-20">
              <i className="fa-solid fa-lock mr-1.5"></i>
              Das Ticket wurde gelöst und archiviert.
            </div>
          )}

        </main>

      </div>

      {/* Modal zum Schließen des Tickets */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <form onSubmit={handleCloseTicket} className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-emerald-500">
                <i className="fa-solid fa-circle-check text-xl"></i>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Ticket schließen & lösen</h3>
                <p className="text-[10px] text-slate-400">Trage die bestätigte Lösung ein. Die KI lernt aus dieser Lösung für zukünftige Anfragen.</p>
              </div>
            </div>

             <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Lösung (Pflichtfeld, außer bei lautlosem Schließen)</label>
                <textarea 
                  value={solutionText}
                  onChange={(e) => setSolutionText(e.target.value)}
                  placeholder="Beschreibe die genaue Lösung (z.B. Smartboard HDMI-Kabel an Wandpanel von Port 1 auf Port 2 umgesteckt)..."
                  rows="4"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  required={!isSilentClose}
                  disabled={isSilentClose}
                />
              </div>

              <div>
                <label className="flex items-start gap-2.5 cursor-pointer py-1 select-none">
                  <input
                    type="checkbox"
                    checked={isSilentClose}
                    onChange={(e) => setIsSilentClose(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 mt-0.5"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-200">Ticket ohne Nachricht und Speichern der Lösung schließen</span>
                    <span className="text-[9px] text-slate-500">Es wird keine Lösungsbenachrichtigung an den Kunden gesendet, kein Lösungsvermerk abgefragt und keine KI-Wissensextraktion durchgeführt.</span>
                  </div>
                </label>
              </div>
              
              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowCloseModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  disabled={isSending}
                >
                  Abbrechen
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  disabled={isSending || (!isSilentClose && !solutionText.trim())}
                >
                  {isSending ? 'Verarbeite...' : 'Ticket schließen'}
                </button>
              </div>
            </div>
          </form>
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

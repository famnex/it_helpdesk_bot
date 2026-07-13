'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { marked } from 'marked';

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
  const [solutionText, setSolutionText] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeSuccessChunks, setCloseSuccessChunks] = useState(null);

  const messagesEndRef = useRef(null);
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
          loadData();
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        if (data.ticket.chatId) {
          try {
            const chatRes = await fetch(`/api/chat?chatId=${data.ticket.chatId}`);
            if (chatRes.ok) {
              const chatData = await chatRes.json();
              const chatHistory = (chatData.messages || []).map(m => ({
                ...m,
                isPreTicket: true,
                senderRole: m.sender === 'user' ? 'customer' : 'bot',
                senderEmail: m.sender === 'user' ? (data.ticket.creatorEmail || 'Kunde') : 'KI-Bot',
                text: m.text,
                createdAt: m.createdAt
              }));
              setMessages([...chatHistory, ...ticketMessages]);
            } else {
              setMessages(ticketMessages);
            }
          } catch (e) {
            console.error('Fehler beim Laden des Pre-Ticket-Chats:', e);
            setMessages(ticketMessages);
          }
        } else {
          setMessages(ticketMessages);
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
    if (!replyText.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: replyText,
          is_internal: isInternal
        })
      });
      if (res.ok) {
        setReplyText('');
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
    if (!solutionText.trim()) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/tickets/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solution: solutionText })
      });
      const data = await res.json();
      setIsSending(false);
      
      if (res.ok) {
        setCloseSuccessChunks(data.savedChunks || []);
        setShowCloseModal(false);
        await loadData();
      } else {
        alert(data.error || 'Fehler beim Schließen.');
      }
    } catch (err) {
      console.error('Fehler beim Schließen des Tickets:', err);
      setIsSending(false);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans h-screen overflow-hidden">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-lg z-20 relative">
        <div className="flex items-center gap-3">
          <Link href="/agent" className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl border border-slate-700 transition-colors flex items-center justify-center">
            <i className="fa-solid fa-arrow-left"></i>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white max-w-xs sm:max-w-md md:max-w-xl truncate">{ticket.title}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400 mt-0.5">
              <span>Ticket ID: <span className="font-mono">{ticket.id}</span></span>
              <div className="flex items-center gap-1.5">
                <span>Ersteller:</span>
                <div className="inline-flex flex-col leading-none">
                  {ticket.creatorName && (
                    <span className="font-bold text-white text-[10px] mb-0.5">{ticket.creatorName}</span>
                  )}
                  <span className="text-slate-400 font-mono text-[9px]">{ticket.creatorEmail}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Trigger / Zuweisung in Header */}
        {ticket.status !== 'closed' && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-bold hidden sm:inline">Ticket-Zuweisung:</span>
            <select 
              value={ticket.assignedAgentId || ''}
              onChange={(e) => handleAssign(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500 text-slate-200"
            >
              <option value="">-- Nicht zugewiesen --</option>
              {agents.map(ag => (
                <option key={ag.id} value={ag.id}>
                  {ag.email.split('@')[0]} ({ag.role})
                </option>
              ))}
            </select>

            <button 
              onClick={() => setShowCloseModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5"
            >
              <i className="fa-solid fa-check"></i>
              <span>Ticket schließen</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Layout (Split View) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Chat History */}
        <main className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-950/20">
          
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
          <div className="flex-grow overflow-y-auto p-6 space-y-6">
            
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

              if (isSystem) {
                return (
                  <div key={index} className="flex justify-center">
                    <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-500 px-3.5 py-1.5 rounded-xl shadow-sm font-bold tracking-wide uppercase">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              const isFirstTicketMessage = !msg.isPreTicket && (index === 0 || messages[index - 1]?.isPreTicket);

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
                        <span className="text-[9px] text-violet-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                          <i className="fa-solid fa-lock text-[8px]"></i>
                          <span>Interner Vermerk (nur Mitarbeiter)</span>
                        </span>
                      )}
                      <div 
                        className={`${isRightAligned ? (isInternalMessage ? 'bg-violet-950/60 text-violet-200 border border-violet-500/20 rounded-tr-none' : isBot ? 'bg-slate-850/85 border border-slate-750 text-slate-200 rounded-tr-none' : 'bg-violet-600 text-white rounded-tr-none') : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'} p-3.5 rounded-2xl shadow-md text-sm leading-relaxed`}
                      >
                        <div 
                          className="markdown-content"
                          dangerouslySetInnerHTML={{ __html: marked.parse(msg.text || '') }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 mx-1">
                        {msg.senderRole === 'bot' ? 'IT-Helpdesk-Bot' : (msg.senderName || msg.senderEmail.split('@')[0])} - {new Date(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Form */}
          {ticket.status !== 'closed' ? (
            <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
              <form onSubmit={handleSendReply} className="max-w-4xl mx-auto flex flex-col gap-3 bg-slate-950 border border-slate-800 rounded-2xl p-2.5 shadow-inner">
                <div className="flex justify-between items-center px-2 border-b border-slate-900 pb-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-slate-800 text-violet-600 bg-transparent focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="flex items-center gap-1">
                      <i className="fa-solid fa-lock text-[10px]"></i>
                      <span>Als internen Vermerk speichern (Kunde sieht das nicht)</span>
                    </span>
                  </label>
                </div>
                
                <div className="flex items-end gap-3">
                  <textarea 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply(e);
                      }
                    }}
                    placeholder={isInternal ? "Schreibe eine interne Notiz..." : "Antworte dem Kunden..."}
                    rows="1"
                    className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[40px] py-2 px-2 text-sm text-slate-200 placeholder-slate-600 outline-none"
                    disabled={isSending}
                  />
                  <button 
                    type="submit"
                    disabled={!replyText.trim() || isSending}
                    className={`p-3 transition-colors rounded-xl shrink-0 w-11 h-11 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed shadow-md text-white ${isInternal ? 'bg-violet-600 hover:bg-violet-700' : 'bg-sky-600 hover:bg-sky-700'}`}
                  >
                    <i className="fa-solid fa-paper-plane text-sm"></i>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0 text-center text-xs text-slate-500 font-bold uppercase tracking-wider">
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
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Lösung (Pflichtfeld)</label>
                <textarea 
                  value={solutionText}
                  onChange={(e) => setSolutionText(e.target.value)}
                  placeholder="Beschreibe die genaue Lösung (z.B. Smartboard HDMI-Kabel an Wandpanel von Port 1 auf Port 2 umgesteckt)..."
                  rows="4"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  required
                />
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
                  disabled={isSending || !solutionText.trim()}
                >
                  {isSending ? 'Verarbeite...' : 'Lösung speichern'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

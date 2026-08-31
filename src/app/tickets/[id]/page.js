'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { marked } from 'marked';
import { renderMarkdownWithLinks, getDateDividerLabel, isDifferentDay, parseUtcDate } from '@/lib/formatting';

const getCleanImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  let str = String(url).replace(/https?:\/\/cloud\.mso-hef\.de\/uploads\//gi, 'https://cloud.mso-hef.de/helpdesk/uploads/');
  str = str.replace(/https?:\/\/cloud\.mso-hef\.de\/api\/uploads\//gi, 'https://cloud.mso-hef.de/helpdesk/api/uploads/');
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  let clean = str.replace(/^\/helpdesk/, '');
  if (clean.startsWith('/uploads/')) {
    clean = clean.replace(/^\/uploads\//, '/api/uploads/');
  }
  if (!clean.startsWith('/')) clean = '/' + clean;
  return `/helpdesk${clean}`;
};



export default function CustomerTicketDetailPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const ratedParam = searchParams.get('rated');
  const scoreParam = searchParams.get('score');

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [user, setUser] = useState(null);
  const [isOtherPartyTyping, setIsOtherPartyTyping] = useState(false);
  const [partnerPresence, setPartnerPresence] = useState(null);

  // Rating States
  const [selectedRating, setSelectedRating] = useState(() => {
    if (scoreParam) {
      const s = parseInt(scoreParam, 10);
      if (s >= 1 && s <= 5) return s;
    }
    return 0;
  });
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [isFeedbackSaved, setIsFeedbackSaved] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(() => {
    return !!scoreParam || ratedParam === 'true';
  });

  // Flagging Message States
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flaggingMessageId, setFlaggingMessageId] = useState(null);
  const [flaggingMessageIndex, setFlaggingMessageIndex] = useState(null);
  const [flagReasonText, setFlagReasonText] = useState('');

  const messagesEndRef = useRef(null);
  const topFeedbackRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const lastTypedTimeRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    // Session prüfen
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.user) {
          router.push('/');
        } else {
          setUser(data.user);
          loadTicketDetails();
        }
      })
      .catch(() => {
        router.push('/');
      });
  }, [id]);

  useEffect(() => {
    if (ticket?.status === 'closed' || scoreParam || ratedParam === 'true') {
      isNearBottomRef.current = false;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      topFeedbackRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      scrollToBottom();
    }
  }, [messages, isOtherPartyTyping, ticket?.status, scoreParam, ratedParam]);

  // SSE Live Stream Setup mit Fallback auf 5s-Polling
  useEffect(() => {
    if (!id || !user) return;

    let eventSource = null;
    try {
      eventSource = new EventSource(`/api/live/sse?roomType=ticket&roomId=${id}&myRole=customer&myEmail=${encodeURIComponent(user.email || '')}`);
      
      eventSource.addEventListener('messages', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.newMessages && data.newMessages.length > 0) {
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id).filter(Boolean));
              const toAdd = data.newMessages.filter(nm => !existingIds.has(nm.id));
              if (toAdd.length === 0) return prev;
              const formattedToAdd = toAdd.map(m => ({
                ...m,
                senderRole: m.senderRole || 'agent',
                senderEmail: m.senderEmail,
                senderName: m.senderName || 'Support-Mitarbeiter',
                text: m.text,
                createdAt: m.createdAt
              }));
              return [...prev, ...formattedToAdd];
            });
          }
        } catch (err) {}
      });

      eventSource.addEventListener('ticket_meta', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.ticketMeta) {
            setTicket(prev => prev ? ({
              ...prev,
              status: data.ticketMeta.status,
              solution: data.ticketMeta.solution,
              closedAt: data.ticketMeta.closedAt,
              closedByName: data.ticketMeta.closedByName,
              rating: data.ticketMeta.rating,
              ratingFeedback: data.ticketMeta.ratingFeedback,
              assignedAgentName: data.ticketMeta.assignedAgentName
            }) : prev);
          }
        } catch (err) {}
      });

      eventSource.addEventListener('sync', (e) => {
        try {
          const data = JSON.parse(e.data);
          setIsOtherPartyTyping(!!data.isOtherPartyTyping);
          if (data.partnerPresence) setPartnerPresence(data.partnerPresence);
        } catch (err) {}
      });
    } catch (err) {
      console.warn('SSE nicht verfügbar, nutze Polling.');
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [id, user]);

  // Live Syncing Fallback-Polling alle 5 Sekunden
  useEffect(() => {
    if (!id || !user) return;

    const interval = setInterval(async () => {
      try {
        const lastMsg = messages[messages.length - 1];
        const lastMsgId = lastMsg?.id && typeof lastMsg.id === 'number' ? lastMsg.id : 0;

        const res = await fetch(`/api/live/sync?roomType=ticket&roomId=${id}&lastMsgId=${lastMsgId}&myRole=customer&myEmail=${encodeURIComponent(user.email || '')}`);
        if (res.ok) {
          const data = await res.json();
          setIsOtherPartyTyping(!!data.isOtherPartyTyping);
          if (data.partnerPresence) setPartnerPresence(data.partnerPresence);

          if (data.ticketMeta) {
            setTicket(prev => {
              if (!prev) return prev;
              if (prev.status !== data.ticketMeta.status || prev.solution !== data.ticketMeta.solution || prev.rating !== data.ticketMeta.rating) {
                return {
                  ...prev,
                  status: data.ticketMeta.status,
                  solution: data.ticketMeta.solution,
                  closedAt: data.ticketMeta.closedAt,
                  closedByName: data.ticketMeta.closedByName,
                  rating: data.ticketMeta.rating,
                  ratingFeedback: data.ticketMeta.ratingFeedback,
                  assignedAgentName: data.ticketMeta.assignedAgentName
                };
              }
              return prev;
            });
          }

          if (data.newMessages && data.newMessages.length > 0) {
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id).filter(Boolean));
              const toAdd = data.newMessages.filter(nm => !existingIds.has(nm.id));
              if (toAdd.length === 0) return prev;
              const formattedToAdd = toAdd.map(m => ({
                ...m,
                senderRole: m.senderRole || 'agent',
                senderEmail: m.senderEmail,
                senderName: m.senderName || 'Support-Mitarbeiter',
                text: m.text,
                createdAt: m.createdAt
              }));
              return [...prev, ...formattedToAdd];
            });
          }
        }
      } catch (e) {
        // Fehler beim Polling ignorieren
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id, user, messages]);

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
          role: 'customer',
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

  const loadTicketDetails = async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        if (data.ticket) {
          if (data.ticket.rating && !scoreParam) {
            setSelectedRating(data.ticket.rating);
          }
          if (data.ticket.ratingFeedback) {
            setRatingComment(data.ticket.ratingFeedback);
            setIsFeedbackSaved(true);
          }
        }
        
        let ticketMessages = data.messages || [];
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

              const chatHistory = preTicketMessages.map(m => ({
                ...m,
                isPreTicket: true,
                senderRole: m.sender === 'user' ? 'customer' : 'bot',
                senderEmail: m.sender === 'user' ? (data.ticket.creatorEmail || 'Kunde') : 'KI-Bot',
                senderName: m.sender === 'user' ? (data.ticket.creatorName || 'Kunde') : 'IT-Helpdesk-Bot',
                text: m.text,
                createdAt: m.createdAt
              }));

              const missingPostMessages = postTicketMessages
                .map(m => ({
                  ...m,
                  isPreTicket: false,
                  senderRole: m.sender === 'user' ? 'customer' : 'bot',
                  senderEmail: m.sender === 'user' ? (data.ticket.creatorEmail || 'Kunde') : 'KI-Bot',
                  senderName: m.sender === 'user' ? (data.ticket.creatorName || 'Kunde') : 'IT-Helpdesk-Bot',
                  text: m.text,
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
        router.push('/tickets');
      }
    } catch (err) {
      console.error('Fehler beim Laden der Ticket-Details:', err);
    } finally {
      setIsLoading(false);
    }
  };
  const handleFlagMessage = (messageId, msgIndex) => {
    if (!messageId) return;
    setFlaggingMessageId(messageId);
    setFlaggingMessageIndex(msgIndex);
    setFlagReasonText('');
    setShowFlagModal(true);
  };

  const submitFlagMessage = async () => {
    if (!flaggingMessageId) return;
    try {
      const res = await fetch('/api/chat/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: flaggingMessageId, reason: flagReasonText })
      });
      if (res.ok) {
        setMessages(prev => {
          const updated = [...prev];
          if (updated[flaggingMessageIndex]) {
            updated[flaggingMessageIndex] = { ...updated[flaggingMessageIndex], isFlagged: true };
          }
          return updated;
        });
        setShowFlagModal(false);
      }
    } catch (err) {
      console.error('Fehler beim Melden der Nachricht:', err);
    }
  };

  const handleSubmitRating = async (starCount) => {
    const finalRating = starCount || selectedRating;
    if (!finalRating) return;

    if (ratingComment.trim()) {
      setIsSavingFeedback(true);
    } else {
      setIsSubmittingRating(true);
    }

    try {
      const res = await fetch(`/api/tickets/${id}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: finalRating, feedback: ratingComment })
      });
      if (res.ok) {
        setRatingSubmitted(true);
        setSelectedRating(finalRating);
        if (ratingComment.trim()) {
          setIsFeedbackSaved(true);
        }
        setTicket(prev => prev ? ({ ...prev, rating: finalRating, ratingFeedback: ratingComment }) : prev);
      }
    } catch (e) {
      console.error('Fehler beim Senden der Bewertung:', e);
    } finally {
      setIsSubmittingRating(false);
      setIsSavingFeedback(false);
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
        body: JSON.stringify({ text: replyText })
      });
      if (res.ok) {
        setReplyText('');
        // Verlauf neu laden
        await loadTicketDetails();
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Senden der Antwort.');
      }
    } catch (err) {
      console.error('Fehler beim Senden der Antwort:', err);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center flex-col gap-4">
        <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Lade Ticket...</p>
      </div>
    );
  }

  if (!ticket) return null;

  // Status Badge bestimmen
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
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-lg z-20 relative w-full">
        <div className="flex items-center gap-3">
          <Link href="/tickets" className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl border border-slate-700 transition-colors flex items-center justify-center">
            <i className="fa-solid fa-arrow-left"></i>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white max-w-xs sm:max-w-md md:max-w-xl truncate">{ticket.title}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] text-slate-400">Ticket ID: <span className="font-mono">{ticket.id}</span></p>
              {partnerPresence && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[10px] font-medium shadow-inner">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    partnerPresence.isOnline 
                      ? 'bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]' 
                      : 'bg-slate-500'
                  }`}></span>
                  <span className={partnerPresence.isOnline ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {partnerPresence.statusText}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

{/* Ticket Body & Messages Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-0 w-full">
        
        {/* Chat Verlauf */}
        <main className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-950/20 min-h-0 w-full">
          
          {/* Nachrichtenhistorie */}
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6">
            
            {/* Lösungsbox oben anzeigen, falls geschlossen */}
            {ticket.status === 'closed' && ticket.solution && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 shadow-lg max-w-2xl mx-auto flex items-start gap-4 mb-2 animate-fade-in">
                <div className="text-emerald-500 bg-emerald-500/20 p-2.5 rounded-xl"><i className="fa-solid fa-circle-check text-xl"></i></div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-emerald-200">Dieses Ticket wurde abgeschlossen</h4>
                  <p className="text-xs font-bold text-slate-300 mt-2">Abschlussnachricht des Support-Teams:</p>
                  <p className="text-xs text-slate-300 mt-1 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed whitespace-pre-wrap">{ticket.solution}</p>
                </div>
              </div>
            )}

            {/* Kundenzufriedenheits-Rating (1-5 Sterne) */}
            {ticket.status === 'closed' && (
              <div ref={topFeedbackRef} className="bg-slate-900/90 border border-violet-500/30 rounded-2xl p-5 shadow-lg max-w-2xl mx-auto mb-4 animate-fade-in">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                      <i className="fa-solid fa-star text-sm"></i>
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white">Wie zufrieden warst du mit unserem Support?</h4>
                      <p className="text-[11px] text-slate-400">Klicke auf die Sterne, um deine Bewertung abzugeben oder jederzeit anzupassen.</p>
                    </div>
                  </div>
                  {(ticket.rating || selectedRating > 0) && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                      {ticket.rating || selectedRating}/5 Sterne
                    </span>
                  )}
                </div>

                {isSubmittingRating ? (
                  <div className="bg-slate-950/60 border border-violet-500/30 rounded-xl p-5 flex items-center justify-center gap-3 text-xs text-violet-300 animate-pulse my-2">
                    <i className="fa-solid fa-circle-notch fa-spin text-lg text-violet-400"></i>
                    <span className="font-semibold text-sm">Bewertung wird übermittelt...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Sterne-Auswahl (immer anklickbar & editierbar) */}
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-semibold">Deine Sterne:</span>
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((star) => {
                            const currentScore = hoverRating || selectedRating || ticket.rating || 0;
                            const isFilled = star <= currentScore;
                            return (
                              <button
                                key={star}
                                type="button"
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                onClick={() => {
                                  setSelectedRating(star);
                                  handleSubmitRating(star);
                                }}
                                className="p-1 text-2xl sm:text-3xl transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                                title={`${star} von 5 Sternen`}
                              >
                                <i className={`fa-star ${isFilled ? 'fa-solid text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'fa-regular text-slate-600 hover:text-amber-400/50'}`}></i>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      
                      <div className="text-xs font-bold text-amber-300 sm:text-right">
                        {(hoverRating || selectedRating || ticket.rating) === 5 ? 'Hervorragend! ⭐⭐⭐⭐⭐' :
                         (hoverRating || selectedRating || ticket.rating) === 4 ? 'Sehr gut! ⭐⭐⭐⭐' :
                         (hoverRating || selectedRating || ticket.rating) === 3 ? 'Gut ⭐⭐⭐' :
                         (hoverRating || selectedRating || ticket.rating) === 2 ? 'Verbesserungswürdig ⭐⭐' :
                         (hoverRating || selectedRating || ticket.rating) === 1 ? 'Unzufrieden ⭐' : 
                         <span className="text-slate-500 font-normal">Sterne auswählen...</span>}
                      </div>
                    </div>

                    {/* Optionales Feedback-Kommentarfeld */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={ratingComment}
                        onChange={(e) => {
                          setRatingComment(e.target.value);
                          setIsFeedbackSaved(false);
                        }}
                        placeholder="Möchtest du uns noch etwas mitteilen? (Optional)"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmitRating(selectedRating || ticket.rating)}
                        disabled={isSavingFeedback || !ratingComment.trim()}
                        className={`font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md shrink-0 flex items-center justify-center gap-1.5 ${
                          isFeedbackSaved 
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 cursor-default'
                            : 'bg-violet-600 hover:bg-violet-500 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        {isSavingFeedback ? (
                          <>
                            <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                            <span>Wird gespeichert...</span>
                          </>
                        ) : isFeedbackSaved ? (
                          <>
                            <i className="fa-solid fa-check text-xs"></i>
                            <span>Feedback gesendet!</span>
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-paper-plane text-xs"></i>
                            <span>Feedback senden</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, index) => {
              const isSystem = msg.senderRole === 'system';
              const prevMsg = index > 0 ? messages[index - 1] : null;
              const showDateDivider = !prevMsg || isDifferentDay(msg.createdAt, prevMsg?.createdAt);
              
              if (msg.text && msg.text.startsWith('[SYSTEM_EVENT:')) {
                return null;
              }

              if (isSystem) {
                return (
                  <div key={index} className="space-y-3">
                    {showDateDivider && (
                      <div className="flex items-center gap-4 py-2 justify-center my-2">
                        <div className="h-px bg-slate-800 flex-1"></div>
                        <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 font-semibold px-3 py-1 rounded-full shadow-sm tracking-wide">
                          {getDateDividerLabel(msg.createdAt)}
                        </span>
                        <div className="h-px bg-slate-800 flex-1"></div>
                      </div>
                    )}
                    <div className="flex justify-center">
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-500 px-3.5 py-1.5 rounded-xl shadow-sm font-bold tracking-wide uppercase">
                        {msg.text}
                      </span>
                    </div>
                  </div>
                );
              }

              const isMyMessage = user ? msg.senderEmail === user.email : msg.senderRole === 'customer';
              const isBot = msg.senderRole === 'bot' || (msg.senderEmail && msg.senderEmail.toLowerCase().includes('bot'));
              const isSupportTeam = !isBot && !isMyMessage && (
                msg.senderRole === 'system' ||
                !msg.senderName ||
                msg.senderName.toLowerCase().includes('support-team')
              );
              const isAgent = !isBot && !isMyMessage && !isSupportTeam;

              const avatarBg = isMyMessage
                ? 'bg-slate-700 text-slate-300'
                : isAgent
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                  : isSupportTeam
                    ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                    : 'bg-sky-500/10 text-sky-400 border border-sky-500/20';

              return (
                <div key={index} className="space-y-4">
                  {showDateDivider && (
                    <div className="flex items-center gap-4 py-2 justify-center my-2">
                      <div className="h-px bg-slate-800 flex-1"></div>
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 font-semibold px-3 py-1 rounded-full shadow-sm tracking-wide">
                        {getDateDividerLabel(msg.createdAt)}
                      </span>
                      <div className="h-px bg-slate-800 flex-1"></div>
                    </div>
                  )}
                  <div 
                    className={`flex gap-3 max-w-[80%] ${isMyMessage ? 'ml-auto flex-row-reverse' : ''} animate-fade-in`}
                  >
                    <div className={`w-8 h-8 rounded-xl ${avatarBg} flex items-center justify-center shrink-0 mt-1 shadow-md overflow-hidden`}>
                      {isMyMessage ? (
                        <i className="fa-solid fa-user text-xs"></i>
                      ) : isAgent ? (
                        msg.senderAvatarUrl ? (
                          <img 
                            src={getCleanImageUrl(msg.senderAvatarUrl)} 
                            alt={msg.senderName || 'Agent'} 
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : (
                          <i className="fa-solid fa-headset text-xs"></i>
                        )
                      ) : isSupportTeam ? (
                        <i className="fa-solid fa-desktop text-xs"></i>
                      ) : (
                        <i className="fa-solid fa-robot text-xs"></i>
                      )}
                    </div>
                    <div className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'} max-w-full`}>
                      <div 
                        className={`${
                          isMyMessage 
                            ? 'bg-sky-600 text-white rounded-tr-none' 
                            : isAgent 
                              ? 'bg-slate-900 border border-emerald-500/30 text-slate-200 rounded-tl-none' 
                              : isSupportTeam 
                                ? 'bg-slate-900 border border-violet-500/30 text-slate-200 rounded-tl-none' 
                                : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                        } p-3.5 rounded-2xl shadow-md text-sm leading-relaxed`}
                      >
                        <div 
                          className="markdown-content"
                          dangerouslySetInnerHTML={{ __html: renderMarkdownWithLinks(msg.text || '') }}
                        />
                        {msg.imageUrl && (
                          msg.imageUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) || msg.imageUrl.startsWith('data:image/') ? (
                            <img 
                              src={getCleanImageUrl(msg.imageUrl)} 
                              alt="Foto" 
                              onClick={() => window.open(getCleanImageUrl(msg.imageUrl), '_blank')}
                              className="max-w-xs max-h-48 rounded-xl object-contain border border-white/20 shadow-sm mt-2 block cursor-pointer" 
                            />
                          ) : (
                            <div className="mt-2">
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
                      </div>
                      <div className="flex items-center gap-2 mt-1 mx-1">
                        <span className="text-[9px] text-slate-500">
                          {isBot ? 'IT-Helpdesk-Bot' : isMyMessage ? 'Du' : isSupportTeam ? 'Support-Team' : (msg.senderRole === 'customer' ? (msg.senderName || 'Kunde') : `${msg.senderName || 'Support-Mitarbeiter'} (${msg.senderRole === 'admin' ? 'IT-Administrator' : 'IT-Support'})`)} - {parseUtcDate(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                        </span>
                        {isBot && msg.id && (
                          <button
                            type="button"
                            onClick={() => handleFlagMessage(msg.id, index)}
                            disabled={msg.isFlagged}
                            className={`text-[9px] flex items-center gap-1 transition-all ${msg.isFlagged ? 'text-red-500 font-bold' : 'text-slate-500 hover:text-red-400 cursor-pointer'}`}
                            title={msg.isFlagged ? "Diese Antwort wurde gemeldet" : "Diese Antwort als fehlerhaft/komisch melden"}
                          >
                            <i className={`fa-${msg.isFlagged ? 'solid' : 'regular'} fa-flag`}></i>
                            <span>{msg.isFlagged ? 'Gemeldet' : 'Melden'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Tipp-Indikator ("...") */}
            {isOtherPartyTyping && (
              <div className="flex items-center gap-2 max-w-full animate-fade-in my-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                  <i className="fa-solid fa-headset"></i>
                </div>
                <div className="bg-slate-900 border border-emerald-500/30 text-slate-400 px-4 py-2.5 rounded-2xl rounded-tl-none flex items-center gap-1.5 text-xs shadow-md">
                  <span className="font-semibold text-emerald-300 mr-1">Support schreibt</span>
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Antworten Form */}
          {ticket.status !== 'closed' ? (
            <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0 z-10 shadow-lg w-full">
              <form onSubmit={handleSendReply} className="max-w-4xl mx-auto flex items-end gap-3 bg-slate-950 border border-slate-800 rounded-2xl p-2.5 focus-within:ring-2 focus-within:ring-sky-500/20 focus-within:border-sky-500 transition-all shadow-inner">
                <textarea 
                  value={replyText}
                  onChange={handleReplyInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply(e);
                    }
                  }}
                  placeholder="Antworte dem IT-Support..."
                  rows="1"
                  className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[40px] py-2 px-3 text-sm text-slate-200 placeholder-slate-600 outline-none"
                  disabled={isSending}
                />
                <button 
                  type="submit"
                  disabled={!replyText.trim() || isSending}
                  className="p-3 bg-sky-600 hover:bg-sky-700 text-white transition-colors rounded-xl shrink-0 w-11 h-11 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                >
                  <i className="fa-solid fa-paper-plane text-sm"></i>
                </button>
              </form>
            </div>
          ) : (
            <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0 text-center text-xs text-slate-500 font-bold uppercase tracking-wider">
              <i className="fa-solid fa-lock mr-1.5"></i>
              Das Ticket ist geschlossen und schreibgeschützt.
            </div>
          )}

        </main>

        {/* Modal zum Melden einer Antwort (global positioniert) */}
        {showFlagModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl text-red-500 animate-pulse">
                  <i className="fa-solid fa-flag text-xl"></i>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Antwort melden</h3>
                  <p className="text-[10px] text-slate-400">Hilf uns, den IT-Helpdesk-Bot zu verbessern. Was ist an dieser Antwort falsch oder unpassend?</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Problembeschreibung (Optional)</label>
                  <textarea 
                    value={flagReasonText}
                    onChange={(e) => setFlagReasonText(e.target.value)}
                    placeholder="z.B. Die genannte Tastenkombination ist falsch, die Lösung passt nicht zu meinem Drucker-Problem, etc."
                    rows="3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowFlagModal(false);
                      setFlagReasonText('');
                    }}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button 
                    type="button"
                    onClick={submitFlagMessage}
                    className="flex-1 py-2 bg-red-650 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <i className="fa-solid fa-paper-plane text-[10px]"></i>
                    <span>Meldung absenden</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

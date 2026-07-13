'use client';
 
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { marked } from 'marked';
 
export default function CustomerChatPage() {
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [user, setUser] = useState(null);
  
  // Magic Link States
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSuccess, setMagicSuccess] = useState('');
  const [magicError, setMagicError] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);
 
  // Ticket Creation States
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [showConfirmTicket, setShowConfirmTicket] = useState(false);
  const [pendingTicketTitle, setPendingTicketTitle] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [ticketCreationLoading, setTicketCreationLoading] = useState(false);

  // Active Tickets States
  const [activeTickets, setActiveTickets] = useState([]);
  const [showTicketPrompt, setShowTicketPrompt] = useState(false);

  // Photo Upload States
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);
  
  const messagesEndRef = useRef(null);

  // Frage-Vorschläge (dynamisch aus der Datenbank)
  const [suggestions, setSuggestions] = useState([]);

  function getGreetingText(currentUser) {
    if (currentUser && currentUser.name) {
      const firstName = currentUser.name.split(' ')[0];
      return `Hallo ${firstName}! Schön, dass du da bist. Ich bin dein digitaler Helfer für Fragen zu Benutzerkonten, Moodle, Schulportal, Webuntis und allen IT-Systemen. Beschreibe mir dein Problem. Falls wir keine Lösung finden, kann ich direkt ein Ticket für dich erstellen.`;
    } else if (currentUser) {
      return `Hallo! Schön, dass du da bist. Ich bin dein digitaler Helfer für Fragen zu Benutzerkonten, Moodle, Schulportal, Webuntis und allen IT-Systemen. Beschreibe mir dein Problem. Falls wir keine Lösung finden, kann ich direkt ein Ticket für dich erstellen.`;
    }
    return `Hallo! Ich bin dein digitaler Helfer für Fragen zu Benutzerkonten, Moodle, Schulportal, Webuntis und allen IT-Systemen. Beschreibe mir dein Problem. Falls wir keine Lösung finden, kann ich direkt ein Ticket für dich erstellen. *(Tipp: Wenn du deine Tickets verwalten willst, gib oben deine E-Mail für einen Anmeldelink ein!)*`;
  }
 
  useEffect(() => {
    // 1. Erst-Einrichtung (Setup) prüfen
    fetch('/api/setup')
      .then(res => res.json())
      .then(setupData => {
        if (setupData.setupRequired) {
          window.location.href = '/helpdesk/setup';
          return;
        }

        // 2. Token aus der URL prüfen (Auto-Login)
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
          window.location.href = `/helpdesk/api/auth/callback?token=${urlToken}`;
          return;
        }

        // 3. Normale Session prüfen
        fetch('/api/auth/me')
          .then(res => res.json())
          .then(data => {
            if (data.user) {
              setUser(data.user);
              // Laden der offenen Tickets des Benutzers
              fetch('/api/tickets')
                .then(res => res.json())
                .then(ticketData => {
                  const openTickets = (ticketData.tickets || []).filter(t => t.status !== 'closed');
                  if (openTickets.length > 0) {
                    setActiveTickets(openTickets);
                    setShowTicketPrompt(true);
                  }
                })
                .catch(err => console.error('Fehler beim Laden der Tickets:', err));
            }
          });
      })
      .catch(err => console.error('Fehler beim Setup-Check:', err));
 
    // Immer eine neue ChatId beim Laden der Seite generieren (neuer Chat bei jedem Aufruf)
    const newChatId = `chat-${Math.floor(100000 + Math.random() * 900000)}`;
    sessionStorage.setItem('support_chat_id', newChatId);
    setChatId(newChatId);
 
    // Chatverlauf laden (für den neuen leeren Chat)
    fetch(`/api/chat?chatId=${newChatId}`)
      .then(res => res.json())
      .then(data => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          // Standard-Begrüßung
          setMessages([
            {
              sender: 'bot',
              text: getGreetingText(null)
            }
          ]);
        }
      });
    // 4. Häufige Fragen (Wissensdatenbank-Artikel) laden
    fetch('/api/knowledge')
      .then(res => res.json())
      .then(data => {
        if (data.chunks && data.chunks.length > 0) {
          // Nimm bis zu 3 echte Einträge als Vorschläge
          const dynamicSuggestions = data.chunks.slice(0, 3).map(chunk => ({
            label: chunk.title,
            query: chunk.title
          }));
          setSuggestions([
            { label: '🎟️ Support-Ticket erstellen', action: 'create_ticket' },
            ...dynamicSuggestions
          ]);
        } else {
          setSuggestions([
            { label: '🎟️ Support-Ticket erstellen', action: 'create_ticket' },
            { label: 'WLAN einrichten', query: 'Wie verbinde ich mich mit dem Schul-WLAN?' },
            { label: 'Drucker installieren', query: 'Wie installiere ich den Drucker im Lehrerzimmer?' },
            { label: 'Smartboard flackert', query: 'Das Smartboard flackert - was kann ich tun?' }
          ]);
        }
      })
      .catch(() => {
        setSuggestions([
          { label: '🎟️ Support-Ticket erstellen', action: 'create_ticket' },
          { label: 'WLAN einrichten', query: 'Wie verbinde ich mich mit dem Schul-WLAN?' },
          { label: 'Drucker installieren', query: 'Wie installiere ich den Drucker im Lehrerzimmer?' },
          { label: 'Smartboard flackert', query: 'Das Smartboard flackert - was kann ich tun?' }
        ]);
      });
  }, []);

  // Begrüßung aktualisieren, sobald Benutzerdaten geladen sind
  useEffect(() => {
    if (messages.length === 1 && messages[0].sender === 'bot') {
      setMessages([
        {
          sender: 'bot',
          text: getGreetingText(user)
        }
      ]);
    }
  }, [user]);
 
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, showTicketPrompt]);
 
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
 
  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert('Das Foto darf maximal 4 MB groß sein.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Es sind nur Bilddateien erlaubt.');
      return;
    }
    setSelectedPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDiscardPhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async (e, suggestionText = '') => {
    if (e) e.preventDefault();
    
    const textToSend = suggestionText || inputValue;
    if ((!textToSend.trim() && !selectedPhoto) || isTyping) return;
 
    const userText = textToSend;
    const currentPhoto = selectedPhoto;
    const currentPreview = photoPreview;

    setInputValue('');
    handleDiscardPhoto();
    
    // User-Nachricht lokal hinzufügen (mit lokaler Bildvorschau, falls vorhanden)
    setMessages(prev => [...prev, { 
      sender: 'user', 
      text: userText,
      imageUrl: currentPreview 
    }]);
    setIsTyping(true);
 
    try {
      const formData = new FormData();
      formData.append('chatId', chatId);
      formData.append('text', userText);
      if (currentPhoto) {
        formData.append('photo', currentPhoto);
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        body: formData
      });
 
      if (!res.ok) throw new Error('API-Fehler');
 
      const data = await res.json();
      
      // Bot-Nachricht hinzufügen
      setMessages(prev => [...prev, { sender: 'bot', text: data.text }]);
      setIsTyping(false);
 
      // Falls die KI ein Ticket triggert
      if (data.ticketCreated) {
        setPendingTicketTitle(userText || 'Support-Anfrage über Chat-Assistent');
        if (user) {
          // Wenn eingeloggt, aktive Bestätigung anfordern
          setShowConfirmTicket(true);
        } else {
          // Andernfalls E-Mail abfragen
          setShowEmailPrompt(true);
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Entschuldigung, meine Serververbindung klemmt gerade.' }]);
      setIsTyping(false);
    }
  };
 
  // Ticket direkt erstellen (wenn angemeldet)
  const createTicketDirectly = async (title, email) => {
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, creator_email: email, chat_id: chatId })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, { 
          sender: 'system', 
          text: `Support-Ticket ${data.ticketId} wurde erfolgreich für dich erstellt!`,
          isTicketUI: true,
          ticketId: data.ticketId
        }]);
      }
    } catch (err) {
      console.error('Ticket konnte nicht erstellt werden:', err);
    }
  };
 
  // Ticket als Gast erstellen (nach E-Mail-Eingabe)
  const handleCreateGuestTicket = async (e) => {
    e.preventDefault();
    if (!guestEmail.trim()) return;
 
    setTicketCreationLoading(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pendingTicketTitle, creator_email: guestEmail, chat_id: chatId })
      });
      
      const data = await res.json();
      setTicketCreationLoading(false);
      setShowEmailPrompt(false);
 
      if (data.success) {
        setMessages(prev => [...prev, { 
          sender: 'system', 
          text: `Support-Ticket ${data.ticketId} wurde erfolgreich für ${guestEmail} erstellt!`,
          isTicketUI: true,
          ticketId: data.ticketId
        }]);
        setGuestEmail('');
      } else {
        alert(data.error || 'Fehler beim Erstellen.');
      }
    } catch (err) {
      console.error(err);
      setTicketCreationLoading(false);
      alert('Ticket konnte nicht erstellt werden.');
    }
  };
 
  // Magic Link anfordern
  const handleMagicLink = async (e) => {
    e.preventDefault();
    if (!magicEmail.trim()) return;
 
    setMagicLoading(true);
    setMagicSuccess('');
    setMagicError('');
 
    try {
      const res = await fetch('/api/auth/magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: magicEmail })
      });
      const data = await res.json();
      setMagicLoading(false);
      if (res.ok) {
        setMagicSuccess('Anmeldelink wurde per E-Mail gesendet (prüfe dein Maildev-Postfach)!');
        setMagicEmail('');
      } else {
        setMagicError(data.error || 'Fehler beim Senden.');
      }
    } catch (err) {
      console.error(err);
      setMagicLoading(false);
      setMagicError('Verbindungsfehler.');
    }
  };

  const handleSuggestionClick = (s) => {
    if (s.action === 'create_ticket') {
      setMessages(prev => [
        ...prev,
        {
          sender: 'user',
          text: 'Ich möchte ein Support-Ticket erstellen.'
        },
        {
          sender: 'bot',
          text: 'Gerne helfe ich dir beim Erstellen eines Support-Tickets.\n\nBitte beschreibe mir kurz dein Problem:\n1. Welches System oder Gerät ist betroffen? (z. B. Moodle, MSO-WLAN, PC im Raum X)\n2. Welche Fehlermeldung oder welches Verhalten tritt auf?\n3. Lade bei Bedarf ein Foto/Screenshot über das Büroklammer-Symbol hoch.\n\nSobald du mir geantwortet hast, werde ich alle Daten sammeln und dir anbieten, das Ticket zu erstellen.'
        }
      ]);
    } else {
      handleSend(null, s.query);
    }
  };
 
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 z-20 relative shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-sky-500 text-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
            <i className="fa-solid fa-graduation-cap text-2xl"></i>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">IT-Helpdesk / Ticketsystem</h1>
            <p className="text-[10px] text-sky-400 font-semibold tracking-wider">KI SUPPORT ASSISTENT</p>
          </div>
        </div>
 
        {/* Auth / Magic Link Bereich */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300">
                <i className="fa-solid fa-user text-slate-400 mr-1.5"></i>
                {user.email} ({user.role === 'customer' ? 'Kunde' : user.role})
              </span>
              <Link 
                href="/knowledge"
                className="bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-750 font-medium text-xs px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <i className="fa-solid fa-book-open text-sky-400"></i>
                <span>Wissensdatenbank</span>
              </Link>
              <Link 
                href={user.role === 'customer' ? '/tickets' : `/${user.role}`}
                className="bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <i className="fa-solid fa-ticket"></i>
                <span>
                  {user.role === 'customer' 
                    ? `Meine Tickets (${activeTickets.length} offen)` 
                    : 'Portal öffnen'}
                </span>
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Magic Link Form */}
              <form onSubmit={handleMagicLink} className="flex gap-2 items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <input 
                  type="email" 
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  placeholder="Tickets per E-Mail abrufen..."
                  className="bg-transparent border-none text-xs text-slate-200 placeholder-slate-500 px-2 py-1 focus:outline-none focus:ring-0 w-48"
                  required
                />
                <button 
                  type="submit" 
                  disabled={magicLoading}
                  className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {magicLoading ? '...' : 'Anfordern'}
                </button>
              </form>
              
              <div className="w-px h-6 bg-slate-800 hidden md:block"></div>
              
              <Link 
                href="/knowledge"
                className="bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 font-medium text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
              >
                <i className="fa-solid fa-book-open text-sky-400"></i>
                <span>Wissensdatenbank</span>
              </Link>
 
              <div className="w-px h-6 bg-slate-800 hidden md:block"></div>
              
              <Link 
                href="/login"
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium text-xs px-4 py-2 rounded-xl transition-all"
              >
                <i className="fa-solid fa-user-shield mr-1.5"></i>
                Mitarbeiter
              </Link>
            </div>
          )}
        </div>
      </header>
 
      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-950 relative">
        
        {/* Magic link feedback notice */}
        {(magicSuccess || magicError) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-md w-full px-4 animate-fade-in">
            {magicSuccess && (
              <div className="bg-emerald-950 border border-emerald-500 text-emerald-200 text-xs p-3 rounded-xl flex justify-between items-center shadow-lg">
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-circle-check text-emerald-400"></i>
                  <span>{magicSuccess}</span>
                </span>
                <button onClick={() => setMagicSuccess('')} className="text-emerald-400 hover:text-emerald-200"><i className="fa-solid fa-xmark"></i></button>
              </div>
            )}
            {magicError && (
              <div className="bg-red-950 border border-red-500 text-red-200 text-xs p-3 rounded-xl flex justify-between items-center shadow-lg">
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-circle-xmark text-red-400"></i>
                  <span>{magicError}</span>
                </span>
                <button onClick={() => setMagicError('')} className="text-red-400 hover:text-red-200"><i className="fa-solid fa-xmark"></i></button>
              </div>
            )}
          </div>
        )}
 
        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-slate-950/20">
          <div className="flex justify-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-900 border border-slate-800 px-4 py-1 rounded-full shadow-inner">
              Verschlüsselte KI-Sitzung
            </span>
          </div>
 
          {messages.map((msg, index) => {
            if (msg.isTicketUI) {
              return (
                <div key={index} className="flex justify-center w-full animate-fade-in my-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl max-w-md w-full shadow-lg relative overflow-hidden flex items-start gap-4">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
                    <div className="text-amber-500 bg-amber-500/20 p-2.5 rounded-xl"><i className="fa-solid fa-ticket-simple text-xl"></i></div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-amber-200">Support-Ticket erstellt</h4>
                        <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">{msg.ticketId}</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-2">
                        Dein Anliegen wurde erfolgreich eskaliert. Unsere IT-Admins wurden benachrichtigt.
                      </p>
                    </div>
                  </div>
                </div>
              );
            }
 
            const isUser = msg.sender === 'user';
            const isSystem = msg.sender === 'system';
            
            if (isSystem) {
              return (
                <div key={index} className="flex justify-center">
                  <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 px-3.5 py-1.5 rounded-xl shadow-sm italic">
                    {msg.text}
                  </span>
                </div>
              );
            }
 
            return (
              <div key={index} className="space-y-4">
                <div 
                  className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : ''} animate-fade-in`}
                >
                  <div className={`w-9 h-9 rounded-xl ${isUser ? 'bg-slate-700 text-slate-300' : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'} flex items-center justify-center shrink-0 mt-1 shadow-md`}>
                    <i className={`fa-${isUser ? 'regular fa-user' : 'solid fa-robot'} text-sm`}></i>
                  </div>
                  <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full`}>
                    {isUser ? (
                      <div 
                        className="bg-sky-600 text-white rounded-tr-none p-4 rounded-2xl shadow-md text-sm whitespace-pre-wrap leading-relaxed flex flex-col gap-2"
                      >
                        {msg.imageUrl && (
                          <img 
                            src={msg.imageUrl} 
                            alt="Hochgeladenes Bild" 
                            className="max-w-xs max-h-48 rounded-xl object-contain border border-white/20 shadow-sm" 
                          />
                        )}
                        {msg.text && <span>{msg.text}</span>}
                      </div>
                    ) : (
                      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none p-4 rounded-2xl shadow-md text-sm leading-relaxed flex flex-col gap-2">
                        {msg.imageUrl && (
                          <img 
                            src={msg.imageUrl} 
                            alt="Bild" 
                            className="max-w-xs max-h-48 rounded-xl object-contain border border-slate-800 shadow-sm" 
                          />
                        )}
                        <div 
                          className="markdown-content"
                          dangerouslySetInnerHTML={{ __html: marked.parse(msg.text || '') }} 
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Ticket Prompt Box direkt unter der ersten Bot-Nachricht */}
                {index === 0 && showTicketPrompt && activeTickets.length > 0 && (
                  <div className="flex gap-3 max-w-[85%] animate-fade-in mt-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0 mt-1 shadow-md">
                      <i className="fa-solid fa-robot text-sm"></i>
                    </div>
                    <div className="flex flex-col items-start max-w-full">
                      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none p-4 rounded-2xl shadow-md text-sm leading-relaxed">
                        <p className="font-bold mb-2">Ich sehe, du hast bereits offene Anfragen. Geht es darum oder möchtest du etwas Neues fragen?</p>
                        <div className="space-y-2 mt-3">
                          {activeTickets.map(tk => (
                            <Link 
                              key={tk.id} 
                              href={`/tickets/${tk.id}`}
                              className="flex items-center justify-between gap-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/50 p-3 rounded-xl transition-all w-full text-left"
                            >
                              <span className="truncate pr-4 text-xs font-semibold text-slate-300">
                                <span className="text-sky-400 font-mono font-bold">{tk.id}</span>: {tk.title}
                              </span>
                              <i className="fa-solid fa-arrow-right text-sky-500 text-xs shrink-0"></i>
                            </Link>
                          ))}
                          <button 
                            type="button"
                            onClick={() => setShowTicketPrompt(false)}
                            className="w-full py-2 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-350 rounded-xl text-xs font-semibold mt-1 transition-all"
                          >
                            Ein anderes / neues Problem beschreiben
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
 
          {/* Prompt-Vorschläge (nur am Anfang und wenn kein Ticket-Prompt da ist) */}
          {messages.length === 1 && !isTyping && !showTicketPrompt && (
            <div className="max-w-4xl mx-auto pl-12 pr-6 animate-fade-in space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Häufige Fragen:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestionClick(s)}
                    className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/30 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow text-slate-300 hover:text-white cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex gap-3 max-w-[85%] animate-fade-in">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 mt-1 shadow-md">
                <i className="fa-solid fa-robot text-sm"></i>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl rounded-tl-none shadow-md flex items-center">
                <div className="typing-indicator flex">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
 
          <div ref={messagesEndRef} />
        </div>
 
        {/* Input Area */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 relative shrink-0">
          
          <form onSubmit={handleSend} className="max-w-4xl mx-auto flex flex-col bg-slate-950 border border-slate-800 rounded-2xl p-2.5 focus-within:ring-2 focus-within:ring-sky-500/20 focus-within:border-sky-500 transition-all shadow-inner">
            
            {/* Foto-Vorschau */}
            {photoPreview && (
              <div className="flex items-center gap-3 p-2 border-b border-slate-900 pb-2 mb-2 animate-fade-in">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-800 shadow">
                  <img src={photoPreview} alt="Vorschau" className="w-full h-full object-cover" />
                  <button 
                    type="button" 
                    onClick={handleDiscardPhoto}
                    className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ausgewähltes Foto</p>
                  <p className="text-xs text-slate-300 truncate max-w-xs">{selectedPhoto?.name}</p>
                </div>
              </div>
            )}

            <div className="flex items-end gap-3">
              {/* Foto anhängen Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-450 hover:text-slate-200 transition-colors rounded-xl shrink-0 w-11 h-11 flex items-center justify-center shadow-md cursor-pointer"
                title="Foto anhängen"
              >
                <i className="fa-solid fa-paperclip text-sm"></i>
              </button>
              
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoSelect}
                accept="image/*"
                className="hidden"
              />

              <textarea 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Beschreibe dein IT-Problem oder lade ein Foto hoch..."
                rows="1"
                className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[40px] py-2 px-1 text-sm text-slate-200 placeholder-slate-600 outline-none"
              />
              <button 
                type="submit"
                disabled={(!inputValue.trim() && !selectedPhoto) || isTyping}
                className="p-3 bg-sky-600 hover:bg-sky-700 text-white transition-colors rounded-xl shrink-0 w-11 h-11 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed shadow-md cursor-pointer"
              >
                <i className="fa-solid fa-paper-plane text-sm"></i>
              </button>
            </div>
          </form>
        </div>
 
      </main>

      {/* Modal Ticket Bestätigung (für angemeldete Nutzer, global positioniert) */}
      {showConfirmTicket && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-sky-500/10 border border-sky-500/20 p-2.5 rounded-xl text-sky-500">
                <i className="fa-solid fa-circle-question text-xl"></i>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Support-Ticket erstellen?</h3>
                <p className="text-[10px] text-slate-400">Bestätige die Erstellung des IT-Tickets.</p>
              </div>
            </div>
            <p className="text-xs text-slate-350 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              Möchtest du ein Ticket mit folgendem Betreff für dich erstellen?<br/>
              <strong className="text-white mt-1.5 block">"{pendingTicketTitle}"</strong>
            </p>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setShowConfirmTicket(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Abbrechen
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  setShowConfirmTicket(false);
                  await createTicketDirectly(pendingTicketTitle, user.email);
                }}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold"
              >
                Ja, Ticket erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal E-Mail Prompt bei Ticket-Erstellung (Gäste, global positioniert) */}
      {showEmailPrompt && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <form onSubmit={handleCreateGuestTicket} className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl text-amber-500">
                <i className="fa-solid fa-circle-question text-xl"></i>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">E-Mail für IT-Ticket benötigt</h3>
                <p className="text-[10px] text-slate-400">Um dein Ticket zu eröffnen, benötigen wir deine E-Mail-Adresse.</p>
              </div>
            </div>

            <div className="space-y-3">
              <input 
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="deine.adresse@schule.de"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                required
                disabled={ticketCreationLoading}
              />
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowEmailPrompt(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold"
                  disabled={ticketCreationLoading}
                >
                  Abbrechen
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  disabled={ticketCreationLoading}
                >
                  {ticketCreationLoading ? 'Erstelle...' : 'Ticket erstellen'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

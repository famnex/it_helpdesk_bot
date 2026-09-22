'use client';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { notify } from '@/lib/feedback';
import { attachmentError, ATTACHMENT_ACCEPT, pasteAttachment, isImageAttachment } from '@/lib/attachments';
import AttachmentView from '@/components/AttachmentView';
import Dialog from '@/components/Dialog';
 
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { marked } from 'marked';
import { renderMarkdownWithLinks, getDateDividerLabel, isDifferentDay, parseUtcDate } from '@/lib/formatting';
import UserNavMenu from '@/components/UserNavMenu';
import { getOrCreateDeviceFingerprint } from '@/lib/fingerprint';

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

  // Mobile Menu & Logout States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // DSGVO Consent States
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentCheckbox, setConsentCheckbox] = useState(false);

  // Chatbot Deactivation & Direct Ticket States
  const [isChatbotDisabled, setIsChatbotDisabled] = useState(false);
  const [directTicketStep, setDirectTicketStep] = useState(0); // 0 = not started, 1 = awaiting title, 2 = awaiting description
  const [directTicketTitle, setDirectTicketTitle] = useState('');
  const [directTicketTexts, setDirectTicketTexts] = useState([]); // Array to store description messages
  const [directTicketPhotos, setDirectTicketPhotos] = useState([]); // Array to store uploaded photo objects/paths

  // Missbrauch, IP-Sperren & ProxyCheck States
  const [isLoadingInitialCheck, setIsLoadingInitialCheck] = useState(true);
  const [isChatAborted, setIsChatAborted] = useState(false);
  const [isIpBanned, setIsIpBanned] = useState(false);
  const [bannedUntil, setBannedUntil] = useState(null);
  const [isSecurityBlocked, setIsSecurityBlocked] = useState(false);
  const [securityCategory, setSecurityCategory] = useState(null);
  const [securityMessage, setSecurityMessage] = useState(null);

  const handleAcceptConsent = () => {
    localStorage.setItem('it_helpdesk_bot_consent', 'true');
    setIsChatbotDisabled(false);
    setShowConsentModal(false);
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
    window.location.reload();
  };
 
  // Ticket Creation States
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [showConfirmTicket, setShowConfirmTicket] = useState(false);
  const [pendingTicketTitle, setPendingTicketTitle] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [ticketCreationLoading, setTicketCreationLoading] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [partnerPresence, setPartnerPresence] = useState(null);
  const lastChatMsgIdRef = useRef(0);
  const lastTicketMsgIdRef = useRef(0);

  const triggerTicketCreation = (title = '') => {
    setPendingTicketTitle(title || 'Support-Anfrage über Chat-Assistent');
    if (user) {
      setShowConfirmTicket(true);
    } else {
      setShowEmailPrompt(true);
    }
  };

  // Active Tickets States
  const [activeTickets, setActiveTickets] = useState([]);
  const [showTicketPrompt, setShowTicketPrompt] = useState(false);

  // Photo Upload States
  const [sendError, setSendError] = useState('');
  const sendId = useRef(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);
  useUnsavedChanges(!!inputValue.trim() || !!selectedPhoto);
  const [sendStatus, setSendStatus] = useState('');

  // Flagging Message States
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flaggingMessageId, setFlaggingMessageId] = useState(null);
  const [flaggingMessageIndex, setFlaggingMessageIndex] = useState(null);
  const [flagReasonText, setFlagReasonText] = useState('');
  
  const messagesEndRef = useRef(null);

  // Frage-Vorschläge (dynamisch aus der Datenbank)
  const [suggestions, setSuggestions] = useState([]);

  function getFirstName(fullName) {
    if (!fullName) return '';
    
    // 1. Falls ein Komma enthalten ist (z.B. "Fleischer, Stefan" oder "Fleischer, Stefan Dr.")
    if (fullName.includes(',')) {
      const parts = fullName.split(',');
      if (parts.length > 1) {
        const afterComma = parts[1].trim();
        return afterComma.split(' ')[0];
      }
    }
    
    // 2. Normaler Name mit Leerzeichen (z.B. "Stefan Fleischer" oder "OStD Karsten Backhaus")
    const words = fullName.trim().split(/\s+/);
    
    // Finde das erste Wort, das kein generischer Titel ist
    const lowercaseTitles = ['ostd', 'std', 'str', 'dr.', 'dr', 'prof.', 'prof', 'hr.', 'fr.'];
    for (const word of words) {
      const cleanWord = word.toLowerCase().replace(/[^a-zäöüß.]/g, '');
      if (!lowercaseTitles.includes(cleanWord)) {
        return word;
      }
    }
    
    return words[0] || '';
  }

  function getGreetingText(currentUser) {
    if (currentUser && currentUser.name) {
      const firstName = getFirstName(currentUser.name);
      return `Hallo ${firstName}! Schön, dass du da bist. Ich bin dein digitaler Helfer für Fragen zu Benutzerkonten, Moodle, Schulportal, Webuntis und allen IT-Systemen. Beschreibe mir dein Problem. Falls wir keine Lösung finden, kann ich direkt ein Ticket für dich erstellen.`;
    } else if (currentUser) {
      return `Hallo! Schön, dass du da bist. Ich bin dein digitaler Helfer für Fragen zu Benutzerkonten, Moodle, Schulportal, Webuntis und allen IT-Systemen. Beschreibe mir dein Problem. Falls wir keine Lösung finden, kann ich direkt ein Ticket für dich erstellen.`;
    }
    return `Hallo! Ich bin dein digitaler Helfer für Fragen zu Benutzerkonten, Moodle, Schulportal, Webuntis und allen IT-Systemen. Beschreibe mir dein Problem. Falls wir keine Lösung finden, kann ich direkt ein Ticket für dich erstellen. *(Tipp: Wenn du deine Tickets verwalten willst, gib oben deine E-Mail für einen Anmeldelink ein!)*`;
  }
 
  useEffect(() => {
    // DSGVO-Einwilligung prüfen
    const consent = localStorage.getItem('it_helpdesk_bot_consent');
    if (consent !== 'true') {
      queueMicrotask(() => setShowConsentModal(true));
    }

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
        const urlToken = params.get('sso_token') || params.get('token');
        if (urlToken) {
          window.location.href = `/helpdesk/api/auth/callback?token=${urlToken}`;
          return;
        }

        // 3. Normale Session prüfen
        const sessionId = localStorage.getItem('it_helpdesk_session_uuid') || '';
        fetch('/api/auth/me', {
          headers: { 'X-User-Session-Id': sessionId }
        })
          .then(res => res.json())
          .then(data => {
            let currentUser = null;
            if (data.user) {
              setUser(data.user);
              currentUser = data.user;
              // Laden der offenen Tickets des Benutzers
              fetch('/api/tickets')
                .then(res => res.json())
                .then(ticketData => {
                  const openTickets = (ticketData.tickets || []).filter(t => t.status !== 'closed' && t.creatorEmail === data.user.email);
                  if (openTickets.length > 0) {
                    setActiveTickets(openTickets);
                    setShowTicketPrompt(true);
                  }
                })
                .catch(err => console.error('Fehler beim Laden der Tickets:', err));
            }

            // Action check
            const action = params.get('action');
            if (action === 'create_ticket') {
              setPendingTicketTitle('Support-Anfrage über Chat-Assistent');
              if (!currentUser) {
                setShowEmailPrompt(true);
              } else {
                setShowConfirmTicket(true);
              }
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          });
      })
      .catch(err => console.error('Fehler beim Setup-Check:', err));
 
    // Prüfen, ob bereits ein aktiver Chat in der aktuellen Browser-Sitzung existiert (oder neuen erstellen)
    let activeChatId = sessionStorage.getItem('support_chat_id');
    if (!activeChatId) {
      activeChatId = `chat-${crypto.randomUUID()}`;
      sessionStorage.setItem('support_chat_id', activeChatId);
    }
    queueMicrotask(() => setChatId(activeChatId));

    // Persistente Sitzungs-ID für Missbrauchsnachverfolgung generieren
    let persistentSessionId = localStorage.getItem('it_helpdesk_session_uuid');
    if (!persistentSessionId) {
      persistentSessionId = 'sess-' + Math.floor(100000 + Math.random() * 900000) + '-' + Date.now();
      localStorage.setItem('it_helpdesk_session_uuid', persistentSessionId);
    }
    sessionStorage.setItem('it_helpdesk_session_uuid', persistentSessionId);
 
    // Chatverlauf laden (für den aktiven Chat)
    fetch(`/api/chat?chatId=${activeChatId}`, {
      headers: {
        'X-User-Session-Id': persistentSessionId,
        'X-Device-Fingerprint': getOrCreateDeviceFingerprint()
      }
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (data.isIpBanned) {
          setIsIpBanned(true);
          if (data.bannedUntil) setBannedUntil(data.bannedUntil);
        }
        if (data.isSecurityBlocked) {
          setIsSecurityBlocked(true);
          setSecurityCategory(data.securityCategory);
          setSecurityMessage(data.securityMessage);
        }
        if (data.isAbusive) {
          setIsChatAborted(true);
        }
        if (data.accessDenied) {
          const newId = `chat-${crypto.randomUUID()}`; setChatId(newId); sessionStorage.setItem('support_chat_id',newId);
          setSendError('Der alte Verlauf ist nicht mehr zugänglich. Ein neuer Chat wurde geöffnet.');
        }
        if (data.aiEnabled === false) {
          setIsChatbotDisabled(true); setDirectTicketStep(2);
          setDirectTicketTexts((data.messages || []).filter(m => m.sender==='user' && !m.text?.startsWith('[SYSTEM_EVENT:')).map(m => m.text || ''));
          setDirectTicketPhotos((data.messages || []).filter(m => m.sender==='user' && m.imageUrl).map(m => m.imageUrl));
        }
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
          const numericIds = data.messages.map(m => typeof m.id === 'number' ? m.id : 0);
          if (numericIds.length > 0) {
            lastChatMsgIdRef.current = Math.max(...numericIds, 0);
          }
        } else {
          // Standard-Begrüßung
          setMessages([
            {
              sender: 'bot',
              text: getGreetingText(null)
            }
          ]);
        }
      })
      .catch(err => {
        console.error('Fehler beim Initial-Check:', err);
      })
      .finally(() => {
        setIsLoadingInitialCheck(false);
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


 
  // Live-Sync Polling (1,5 Sekunden Intervall für Support-Agenten Tipp-Indikator & Live-Nachrichten)
  useEffect(() => {
    if (!chatId) return;

    const pollLiveSync = async () => {
      try {
        const myEmail = user?.email || '';
        const res = await fetch(`/api/live/sync?roomType=chat&roomId=${chatId}&lastMsgId=${lastChatMsgIdRef.current}&lastTicketMsgId=${lastTicketMsgIdRef.current}&myRole=customer&myEmail=${encodeURIComponent(myEmail)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setIsAgentTyping(!!data.isOtherPartyTyping);
            if (data.partnerPresence) {
              setPartnerPresence(data.partnerPresence);
            }

            // Neue Chat-Nachrichten
            if (data.newMessages && data.newMessages.length > 0) {
              const maxId = Math.max(...data.newMessages.map(m => m.id));
              if (maxId > lastChatMsgIdRef.current) {
                lastChatMsgIdRef.current = maxId;
              }

              const newChatItems = data.newMessages.map(m => ({
                id: m.id,
                sender: m.sender,
                text: m.text, imageUrl: m.imageUrl || null, attachmentName: m.attachmentName,
                isFlagged: m.isFlagged,
                createdAt: m.createdAt
              }));

              setMessages(prev => {
                const merged = [...prev];
                for (const incoming of newChatItems) {
                  if (merged.some(m => m.id === incoming.id)) continue;
                  const pending = merged.findIndex(m => m.localId && !m.id && m.sender === incoming.sender && m.text === incoming.text);
                  if (pending >= 0) merged[pending] = {...merged[pending],...incoming};
                  else merged.push(incoming);
                }
                return merged;
              });
            }

            // Neue Ticket-Nachrichten vom Support/Agent
            if (data.newTicketMessages && data.newTicketMessages.length > 0) {
              const maxTicketId = Math.max(...data.newTicketMessages.map(m => m.id));
              if (maxTicketId > lastTicketMsgIdRef.current) {
                lastTicketMsgIdRef.current = maxTicketId;

                const formattedTicketMsgs = data.newTicketMessages
                  .filter(m => {
                    // System-Events, interne Notizen und Kunden-Chat-Duplikate überspringen
                    if (m.isInternal || m.sourceChatMessageId) return false;
                    if (m.senderRole === 'customer') return false;
                    if (m.senderRole === 'system') return false;
                    if (m.text && (
                      m.text.startsWith('[SYSTEM_EVENT:') || 
                      m.text.startsWith('[Ticket aus Chat') || 
                      m.text.startsWith('Ticket TK-') || 
                      m.text.startsWith('Ticket wurde') ||
                      m.text.startsWith('[Zusatzinformationen aus Chat')
                    )) return false;
                    return true;
                  })
                  .map(m => {
                    const isHumanAgent = (m.senderRole === 'agent' || m.senderRole === 'admin') && 
                      m.senderName && 
                      !m.senderName.toLowerCase().includes('support-team') && 
                      !m.senderName.toLowerCase().includes('helpdesk-bot') &&
                      !m.senderName.toLowerCase().includes('system');

                    return {
                      id: `ticket-msg-${m.id}`,
                      sender: isHumanAgent ? 'agent' : 'support',
                      senderRole: m.senderRole,
                      senderName: isHumanAgent ? m.senderName : 'Support-Team',
                      senderAvatarUrl: m.senderAvatarUrl || null,
                      text: m.text, imageUrl: m.imageUrl || null, attachmentName: m.attachmentName,
                      createdAt: m.createdAt
                    };
                  });

                setMessages(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const toAdd = formattedTicketMsgs.filter(m => !existingIds.has(m.id));
                  if (toAdd.length === 0) return prev;
                  return [...prev, ...toAdd];
                });
              }
            }
          }
        }
      } catch (err) {
        // Stiller Fallback bei Verbindungsabbrüchen
      }
    };

    pollLiveSync();
    const interval = setInterval(pollLiveSync, 1500);
    return () => clearInterval(interval);
  }, [chatId, user]);

  const isNearBottomRef = useRef(true);

  const handleScroll = (e) => {
    const el = e.target;
    if (el) {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }
  };

  function scrollToBottom(force = false) {
    if (force || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isAgentTyping, showTicketPrompt]);
 

 
  const selectPhoto = (file) => {
    if (!file) return;
    const error = attachmentError(file);
    if (error) { setSendError(error); return; }
    if (selectedPhoto && !window.confirm('Den bereits gewählten Anhang ersetzen?')) return;
    setSendError('');
    sendId.current = null;
    setSelectedPhoto(file);
    if (isImageAttachment(file.name)) {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    } else setPhotoPreview(null);
  };
  const handlePhotoSelect = e => selectPhoto(e.target.files?.[0]);

  const handleDiscardPhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const lastTypedTimeRef = useRef(0);
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    sendId.current = null;

    const now = Date.now();
    if (now - lastTypedTimeRef.current > 2000) {
      lastTypedTimeRef.current = now;
      fetch('/api/live/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomType: 'chat',
          roomId: chatId,
          role: 'customer',
          email: user?.email || '',
          isTyping: true
        })
      }).catch(() => {});
    }
  };

  const handleSend = async (e, suggestionText = '') => {
    if (e) e.preventDefault();
    
    if (isIpBanned || isSecurityBlocked || isChatAborted || isLoadingInitialCheck) {
      return;
    }
    
    const textToSend = suggestionText || inputValue;
    if ((!textToSend.trim() && !selectedPhoto) || isTyping) return;
 
    const userText = textToSend;
    const currentPhoto = selectedPhoto;
    const currentPreview = photoPreview;

    setSendError('');
    sendId.current ||= crypto.randomUUID();
    const draftId = sendId.current;
    
    // User-Nachricht lokal im Chat anzeigen
    setMessages(prev => [...prev, { 
      localId: draftId, sender: 'user',
      text: userText,
      imageUrl: currentPreview, attachmentName: currentPhoto?.name
    }]);

    if (isChatbotDisabled) {
      setIsTyping(true);
      try {
        const form = new FormData();
        form.append('chatId',chatId); form.append('text',userText);
        form.append('skip_bot','true'); form.append('aiEnabled','false');
        if (currentPhoto) form.append('photo',currentPhoto);
        const res = await fetch('/api/chat',{method:'POST',headers:{'Idempotency-Key':sendId.current},body:form});
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Senden fehlgeschlagen.');
        if (userText.trim()) setDirectTicketTexts(prev => [...prev,userText]);
        if (data.imageUrl) setDirectTicketPhotos(prev => [...prev,data.imageUrl]);
        const sentId = sendId.current;
        setMessages(prev => prev.map(m => m.localId === sentId ? {...m,id:data.userMessageId,imageUrl:data.imageUrl || null} : m));
        setInputValue(''); handleDiscardPhoto(); sendId.current = null; setSendStatus('Gesendet');
        return true;
      } catch (err) {
        const failedId = sendId.current;
        setMessages(prev => prev.filter(m => m.localId !== failedId));
        setSendError(err.message + ' Dein Entwurf ist erhalten. Bitte erneut senden.');
        return false;
      } finally { setIsTyping(false); }
    }

    setIsTyping(true);
 
    try {
      const formData = new FormData();
      formData.append('chatId', chatId);
      formData.append('text', userText);
      formData.append('aiEnabled', 'true');
      if (currentPhoto) {
        formData.append('photo', currentPhoto);
      }

      const persistentSessionId = sessionStorage.getItem('it_helpdesk_session_uuid') || '';

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Idempotency-Key': sendId.current,
          'X-User-Session-Id': persistentSessionId,
          'X-Device-Fingerprint': getOrCreateDeviceFingerprint()
        },
        body: formData
      });

      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        if (errData.isIpBanned) {
          setIsIpBanned(true);
          setBannedUntil(errData.bannedUntil);
          setMessages(prev => [...prev, {
            sender: 'bot',
            text: `🚫 **IP-Adresse gesperrt:** Chateingaben von dieser IP-Adresse sind für 24 Stunden gesperrt${errData.bannedUntil ? ` (bis ${new Date(errData.bannedUntil).toLocaleString('de-DE')} Uhr)` : ''}.\n\n💡 **Hinweis für Schul-PCs:** Die Sperre ist an die IP-Adresse dieses Computers gebunden. Falls ein vorheriger Nutzer diesen PC gesperrt hat, kannst du für Support-Anfragen einfach ein **anderes Gerät** (z. B. dein Smartphone oder Tablet) nutzen.`
          }]);
        } else if (errData.isSecurityBlocked) {
          setIsSecurityBlocked(true);
          setSecurityCategory(errData.securityCategory);
          setSecurityMessage(errData.securityMessage);
          setMessages(prev => [...prev, {
            sender: 'bot',
            text: `🛡️ **Sicherheitshinweis (${errData.securityCategory || 'Anonymisierungs-Schutz'}):** ${errData.securityMessage || errData.error}`
          }]);
        } else if (errData.isAbusive) {
          setIsChatAborted(true);
          setMessages(prev => [...prev, {
            sender: 'bot',
            text: '⛔ Dieses Gespräch wurde wegen eines Richtlinienverstoßes beendet und kann nicht fortgeführt werden. Bitte starte einen neuen Chat für sachliche IT-Anfragen.'
          }]);
        } else {
          setMessages(prev => [...prev, { sender: 'bot', text: errData.error || 'Zugriff verweigert.' }]);
        }
        throw new Error(errData.error || 'Zugriff verweigert.');
      }

      if (!res.ok) {
        let errData = {};
        try {
          errData = await res.json();
        } catch (e) {}
        const serverError = errData.error || errData.message;
        throw new Error(serverError || 'API-Fehler');
      }

      const data = await res.json();
      const sentId = sendId.current;
      setMessages(prev => prev.map(m => m.localId === sentId ? {...m,id:data.userMessageId,imageUrl:data.imageUrl || null} : m));
      setInputValue(''); handleDiscardPhoto(); sendId.current = null; setSendStatus('Gesendet');

      if (data.isIpBanned) {
        setIsIpBanned(true);
        setBannedUntil(data.bannedUntil);
      }
      if (data.isAbusive) {
        setIsChatAborted(true);
      }
      
      // Falls ein Bild hochgeladen wurde, die temporäre blob-URL in den Nachrichten durch die permanente Server-URL ersetzen
      if (data.imageUrl) {
        const cleanServerUrl = getCleanImageUrl(data.imageUrl);
        setMessages(prev => {
          const updated = [...prev];
          const lastUserMsgIdx = updated.findLastIndex(m => m.sender === 'user' && m.imageUrl);
          if (lastUserMsgIdx !== -1) {
            updated[lastUserMsgIdx] = { ...updated[lastUserMsgIdx], imageUrl: cleanServerUrl };
          }
          return updated;
        });
      }

      // Falls die Konversation mit einem älteren Chat zusammengeführt wurde, sofort in diesen wechseln!
      if (data.isMerged && data.targetChatId) {
        const targetId = data.targetChatId;
        setChatId(targetId);
        sessionStorage.setItem('support_chat_id', targetId);
        localStorage.setItem('it_helpdesk_chat_id', targetId);
        
        try {
          const fetchRes = await fetch(`/api/chat?chatId=${targetId}`);
          if (fetchRes.ok) {
            const chatData = await fetchRes.json();
            if (chatData.messages && chatData.messages.length > 0) {
              setMessages(chatData.messages);
            } else {
              setMessages(prev => prev.some(m => m.id === data.botMessageId) ? prev : [...prev, { id: data.botMessageId, sender: 'bot', text: data.text, isFlagged: false }]);
            }
          }
        } catch (e) {
          console.error('Fehler beim Laden des zusammengeführten Chats:', e);
          setMessages(prev => prev.some(m => m.id === data.botMessageId) ? prev : [...prev, { id: data.botMessageId, sender: 'bot', text: data.text, isFlagged: false }]);
        }
      } else if (data.text) {
        // Bot-Nachricht hinzufügen (nur wenn Antwort-Text vorhanden ist)
        setMessages(prev => prev.some(m => m.id === data.botMessageId) ? prev : [...prev, { id: data.botMessageId, sender: 'bot', text: data.text, isFlagged: false }]);
      }

      setIsTyping(false);
 
      // Falls die KI ein Ticket triggert
      if (data.ticketCreated) {
        if (data.autoTicketId) {
          setMessages(prev => [...prev, { 
            sender: 'system', 
            text: `Support-Ticket #${data.autoTicketId} wurde automatisch für dich in der Datenbank erstellt! Ein IT-Administrator kümmert sich darum.`,
            isTicketUI: true,
            ticketId: data.autoTicketId
          }]);
        } else {
          setPendingTicketTitle(data.proposedTitle || userText || 'Support-Anfrage über Chat-Assistent');
          if (user) {
            setShowConfirmTicket(true);
          } else {
            setShowEmailPrompt(true);
          }
        }
      }
    } catch (err) {
      const failedId = sendId.current;
      setMessages(prev => prev.filter(m => m.localId !== failedId));
      setSendError(err.message + ' Dein Entwurf ist erhalten. Bitte erneut senden.');
      console.error('Chat-Fehler:', err);
      const isAdmin = user && user.role === 'admin';
      const displayMsg = (isAdmin && err.message && err.message !== 'API-Fehler')
        ? `⚠️ Admin-Hinweis: ${err.message}`
        : 'Entschuldigung, meine Serververbindung klemmt gerade.';
      setMessages(prev => [...prev, { sender: 'bot', text: displayMsg }]);
      setIsTyping(false);
    }
  };

  const handleStartNewChat = () => {
    if ((inputValue.trim() || selectedPhoto) && !window.confirm('Neuen Chat starten und diesen Entwurf verwerfen?')) return;
    handleDiscardPhoto();
    const newChatId = `chat-${crypto.randomUUID()}`;
    setChatId(newChatId);
    sessionStorage.setItem('support_chat_id', newChatId);
    setIsChatAborted(false);
    setMessages([{ sender: 'bot', text: getGreetingText(user) }]);
    setInputValue('');
  };
 
  const sendSystemEventToBot = async (eventText) => {
    setIsTyping(true);
    try {
      const persistentSessionId = sessionStorage.getItem('it_helpdesk_session_uuid') || '';

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Session-Id': persistentSessionId
        },
        body: JSON.stringify({ 
          chatId, 
          text: eventText
        })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { 
          id: data.botMessageId,
          sender: 'bot', 
          text: data.text,
          isFlagged: false
        }]);
      }
    } catch (err) {
      console.error('Fehler bei System-Event an Bot:', err);
    } finally {
      setIsTyping(false);
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

  // Ticket direkt erstellen (wenn angemeldet)
  const createTicketDirectly = async (title, email) => {
    setTicketCreationLoading(true);
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
        await sendSystemEventToBot(`[SYSTEM_EVENT: TICKET_CREATED: ${data.ticketId}]`);
      }
    } catch (err) {
      console.error('Ticket konnte nicht erstellt werden:', err);
    } finally {
      setTicketCreationLoading(false);
      setShowConfirmTicket(false);
      setShowEmailPrompt(false);
    }
  };
 
  // Direktes Ticket absenden im Deaktiviert-Modus
  const submitDirectTicket = async () => {
    if (isTyping || ticketCreationLoading) return;
    if (!directTicketTexts.length && !directTicketPhotos.length && !inputValue.trim() && !selectedPhoto) return;
    if (inputValue.trim() || selectedPhoto) {
      const sent = await handleSend();
      if (!sent) return;
    }

    setTicketCreationLoading(true);
    const emailToUse = user ? user.email : guestEmail;

    if (!emailToUse) {
      setPendingTicketTitle('Support-Anfrage');
      setShowEmailPrompt(true);
      setTicketCreationLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: 'Support-Anfrage', 
          creator_email: emailToUse, 
          chat_id: chatId
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, {
          sender: 'system',
          text: `Dein Support-Ticket ${data.ticketId} wurde erfolgreich erstellt! Ein IT-Administrator wird sich darum kümmern.`,
          isTicketUI: true,
          ticketId: data.ticketId
        }]);

        setDirectTicketStep(0);
        setDirectTicketTitle('');
        setDirectTicketTexts([]);
        setDirectTicketPhotos([]);
        setIsChatbotDisabled(true);
      }
    } catch (err) {
      console.error(err);
      notify('Fehler beim Erstellen des Tickets.');
    } finally {
      setTicketCreationLoading(false);
    }
  };

  // Chatbot Toggle Handler
  const handleChatbotToggle = async (checked) => {
    if (isTyping) return;
    if (checked) {
      try {
        const res = await fetch('/api/chat',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatId,aiEnabled:false})});
        if (!res.ok) throw new Error('Modus konnte nicht geändert werden. Bitte erneut versuchen.');
      } catch(e) { setSendError(e.message); return; }
    }
    if (!checked) {
      if (!window.confirm('KI-Unterstützung startet einen neuen, getrennten Chat. Der bisherige Verlauf bleibt ohne KI. Fortfahren?')) return;
      const nextId = `chat-${crypto.randomUUID()}`;
      setChatId(nextId); sessionStorage.setItem('support_chat_id',nextId);
      setMessages([{sender:'bot',text:getGreetingText(user)}]);
      setDirectTicketTexts([]); setDirectTicketPhotos([]);
      setShowConsentModal(true);
    }
    setIsChatbotDisabled(checked);
    setDirectTicketStep(checked ? 2 : 0);
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
        body: JSON.stringify({ 
          title: pendingTicketTitle || 'Support-Anfrage', 
          creator_email: guestEmail, 
          chat_id: chatId
        })
      });
      
      const data = await res.json();
      setTicketCreationLoading(false);
      setShowEmailPrompt(false);
 
      if (data.success) {
        setMessages(prev => [...prev, { 
          sender: 'system', 
          text: `Support-Ticket ${data.ticketId} wurde erfolgreich für ${guestEmail} erstellt! Ein IT-Administrator wird sich darum kümmern.`,
          isTicketUI: true,
          ticketId: data.ticketId
        }]);
        setGuestEmail('');

        if (isChatbotDisabled) {
          setDirectTicketStep(0);
          setDirectTicketTitle('');
          setDirectTicketTexts([]);
          setDirectTicketPhotos([]);
          setIsChatbotDisabled(false);
        } else {
          await sendSystemEventToBot(`[SYSTEM_EVENT: TICKET_CREATED: ${data.ticketId}]`);
        }
      } else {
        notify(data.error || 'Fehler beim Erstellen.');
      }
    } catch (err) {
      console.error(err);
      setTicketCreationLoading(false);
      notify('Ticket konnte nicht erstellt werden.');
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
 
  if (isLoadingInitialCheck) {
    return (
      <div className="min-h-screen h-[100dvh] w-full flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-400 font-semibold tracking-wide">IT-Helpdesk wird geladen...</span>
        </div>
      </div>
    );
  }

  if (isIpBanned) {
    return (
      <div className="min-h-screen h-[100dvh] w-full flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans p-4 relative overflow-hidden">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-fade-in relative z-10">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400 text-2xl shadow-inner">
            <i className="fa-solid fa-mobile-screen-button"></i>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Dieses Gerät ist gesperrt</h2>
            <p className="text-xs text-red-300 font-semibold leading-relaxed">
              Aufgrund wiederholter Verstöße gegen die Nutzungsrichtlinien wurde dieses Gerät (Device Fingerprint) für 24 Stunden für den IT-Support-Chat gesperrt.
            </p>
          </div>

          {bannedUntil && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-4 text-xs space-y-1">
              <span className="text-slate-400 block text-xs font-bold uppercase tracking-wider">Sperre aktiv bis:</span>
              <strong className="text-red-300 font-mono text-sm block">
                {new Date(bannedUntil).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr am {new Date(bannedUntil).toLocaleDateString('de-DE')}
              </strong>
            </div>
          )}

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left text-xs text-slate-400 space-y-2 leading-relaxed">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <i className="fa-solid fa-circle-info text-sky-400"></i>
              <span>Warum ist das Gerät gesperrt?</span>
            </div>
            <p className="text-xs text-slate-400">
              Unser IT-Helpdesk schützt sich automatisch vor Beleidigungen, Spam und Trolling. Die Sperre gilt gerätebezogen für 24 Stunden ab dem letzten Verstoß.
            </p>
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Device ID:</span>
              <span className="font-mono text-violet-300 font-semibold">{getOrCreateDeviceFingerprint()}</span>
            </div>
          </div>

          <div className="pt-2">
            <Link 
              href="/login" 
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl transition-all border border-slate-700"
            >
              <i className="fa-solid fa-right-to-bracket text-sky-400"></i>
              <span>Mitarbeiter-Login (Staff Bypass)</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen h-[100dvh] w-full flex flex-col bg-slate-950 font-sans text-slate-100 relative overflow-hidden">
      
      {/* Header (Fest am oberen Bildschirmland fixiert) */}
      <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 py-2 sm:py-3.5 flex justify-between items-center z-30 fixed top-0 left-0 right-0 shadow-lg h-14 sm:h-[72px] w-full">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-sky-500 text-white p-1.5 sm:p-2.5 rounded-xl shadow-md flex items-center justify-center shrink-0">
            <i className="fa-solid fa-graduation-cap text-lg sm:text-2xl"></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-lg font-bold text-white tracking-tight leading-tight">IT-Helpdesk / Ticketsystem</h1>
              {partnerPresence && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/90 border border-slate-800 text-xs sm:text-xs font-medium shadow-inner shrink-0">
                  <span className={`w-2 h-2 rounded-full ${
                    partnerPresence.isOnline 
                      ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' 
                      : 'bg-slate-500'
                  }`}></span>
                  <span className={partnerPresence.isOnline ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {partnerPresence.statusText}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs sm:text-xs text-sky-400 font-semibold tracking-wider uppercase">KI Support Assistent</p>
          </div>
        </div>

        {/* Hamburger-Button für kleine Bildschirme */}
        <button 
          type="button" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden text-slate-400 hover:text-white p-1.5 rounded-xl border border-slate-800 bg-slate-950/60 focus:outline-none transition-colors"
        >
          <i className={`fa-solid ${mobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-sm`}></i>
        </button>
 
        {/* Desktop Menu - nur auf md: und größer */}
        <div className="hidden md:flex items-center gap-3 text-sm">
          <Link 
            href="/knowledge"
            className="bg-slate-800 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold text-xs px-3.5 py-1.5 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <i className="fa-solid fa-book-open text-sky-400"></i>
            <span>Wissensdatenbank</span>
          </Link>

          {user ? (
            <UserNavMenu user={user} currentView="chat" onLogout={handleLogout} />
          ) : (
            <div className="flex items-center gap-3">
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
              
              <div className="w-px h-6 bg-slate-800"></div>
              
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

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-14 left-0 right-0 bg-slate-900 border-b border-slate-800 p-4 shadow-2xl flex flex-col gap-3 animate-fade-in z-35">
            <Link 
              href="/knowledge"
              onClick={() => setMobileMenuOpen(false)}
              className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-book-open text-sky-400"></i>
              <span>Wissensdatenbank</span>
            </Link>

            {user ? (
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                <div className="text-xs text-slate-300 font-semibold px-2 py-1.5 flex items-center gap-2 bg-slate-950/70 rounded-lg">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="w-5 h-5 rounded-full object-cover border border-slate-700" />
                  ) : (
                    <i className="fa-solid fa-user text-sky-400"></i>
                  )}
                  <span className="truncate">{user.name || user.email}</span>
                </div>

                {user.role === 'customer' && (
                  <Link 
                    href="/tickets"
                    onClick={() => setMobileMenuOpen(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-ticket text-sky-400"></i>
                    <span>Meine Tickets ({activeTickets.length} offen)</span>
                  </Link>
                )}

                {(user.role === 'agent' || user.role === 'admin') && (
                  <Link 
                    href="/agent"
                    onClick={() => setMobileMenuOpen(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-ticket text-violet-400"></i>
                    <span>Agenten-Portal</span>
                  </Link>
                )}

                {user.role === 'admin' && (
                  <Link 
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-gears text-purple-400"></i>
                    <span>Admin-Bereich</span>
                  </Link>
                )}

                {(user.role === 'agent' || user.role === 'admin') && (
                  <Link 
                    href="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-id-badge text-emerald-400"></i>
                    <span>Mein Profil</span>
                  </Link>
                )}

                <button 
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                  className="bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-400 font-semibold text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 mt-1"
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  <span>Abmelden</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 pt-2 border-t border-slate-800">
                {/* Magic Link Form */}
                <form onSubmit={(e) => { setMobileMenuOpen(false); handleMagicLink(e); }} className="flex flex-col gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <label className="text-xs font-bold text-slate-500 px-1">TICKETS PER MAIL ABRUFEN</label>
                  <div className="flex gap-2">
                    <input 
                      type="email" 
                      value={magicEmail}
                      onChange={(e) => setMagicEmail(e.target.value)}
                      placeholder="Deine E-Mail..."
                      className="bg-transparent border-none text-xs text-slate-200 placeholder-slate-500 px-2 py-1.5 focus:outline-none focus:ring-0 flex-1 min-w-0"
                      required
                    />
                    <button 
                      type="submit" 
                      disabled={magicLoading}
                      className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                    >
                      {magicLoading ? '...' : 'Anfordern'}
                    </button>
                  </div>
                </form>

                <Link 
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-user-shield"></i>
                  <span>Mitarbeiter-Login</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </header>
 
      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-950 relative w-full pt-14 sm:pt-[72px] pb-[100px] sm:pb-[140px]">
        
        {/* Magic link feedback notice */}
        {(magicSuccess || magicError) && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-45 max-w-md w-full px-4 animate-fade-in">
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
        <div onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-6 space-y-4 sm:space-y-6 scroll-smooth bg-slate-950/20">
          <div className="flex justify-center">
            <span className="text-xs sm:text-xs text-slate-500 font-bold uppercase tracking-widest bg-slate-900 border border-slate-800 px-3 py-0.5 rounded-full shadow-inner">
              Verschlüsselte KI-Sitzung
            </span>
          </div>



          {/* Nachrichten-Liste */}
          {messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDateDivider = !prevMsg || isDifferentDay(msg.createdAt, prevMsg?.createdAt);

            if (msg.isTicketUI) {
              return (
                <div key={index} className="space-y-3">
                  {showDateDivider && (
                    <div className="flex items-center gap-4 py-2 justify-center my-2">
                      <div className="h-px bg-slate-800 flex-1"></div>
                      <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 font-semibold px-3 py-1 rounded-full shadow-sm tracking-wide">
                        {getDateDividerLabel(msg.createdAt)}
                      </span>
                      <div className="h-px bg-slate-800 flex-1"></div>
                    </div>
                  )}
                  <div className="flex justify-center w-full animate-fade-in my-4">
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
                </div>
              );
            }
 
            if (msg.text && msg.text.startsWith('[SYSTEM_EVENT: TICKET_CREATED:')) {
              const ticketId = msg.text.replace('[SYSTEM_EVENT: TICKET_CREATED:', '').replace(']', '').trim();
              return (
                <div key={index} className="space-y-3">
                  {showDateDivider && (
                    <div className="flex items-center gap-4 py-2 justify-center my-2">
                      <div className="h-px bg-slate-800 flex-1"></div>
                      <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 font-semibold px-3 py-1 rounded-full shadow-sm tracking-wide">
                        {getDateDividerLabel(msg.createdAt)}
                      </span>
                      <div className="h-px bg-slate-800 flex-1"></div>
                    </div>
                  )}
                  <div className="flex justify-center w-full animate-fade-in my-4">
                    <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl max-w-md w-full shadow-lg relative overflow-hidden flex items-start gap-4">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
                      <div className="text-amber-500 bg-amber-500/20 p-2.5 rounded-xl"><i className="fa-solid fa-ticket-simple text-xl"></i></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold text-amber-200">Support-Ticket erstellt</h4>
                          <a 
                            href={`/helpdesk/tickets/${ticketId}`}
                            className="text-xs font-mono font-bold text-amber-400 hover:text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded transition-colors"
                          >
                            {ticketId}
                          </a>
                        </div>
                        <p className="text-xs text-slate-300 mt-2">
                          Dein Anliegen wurde erfolgreich eskaliert. Unsere IT-Admins wurden benachrichtigt.
                          <br />
                          <a 
                            href={`/helpdesk/tickets/${ticketId}`} 
                            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-bold mt-2 transition-colors"
                          >
                            <span>Ticket anzeigen</span>
                            <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            if (msg.text && msg.text.startsWith('[SYSTEM_EVENT:')) {
              return null;
            }

            const isUser = msg.sender === 'user';
            const isSystem = msg.sender === 'system';
            const isAgent = msg.sender === 'agent';
            const isSupportTeam = msg.sender === 'support';
            const isBot = !isUser && !isSystem && !isAgent && !isSupportTeam;
            
            if (isSystem) {
              return (
                <div key={index} className="space-y-3">
                  {showDateDivider && (
                    <div className="flex items-center gap-4 py-2 justify-center my-2">
                      <div className="h-px bg-slate-800 flex-1"></div>
                      <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 font-semibold px-3 py-1 rounded-full shadow-sm tracking-wide">
                        {getDateDividerLabel(msg.createdAt)}
                      </span>
                      <div className="h-px bg-slate-800 flex-1"></div>
                    </div>
                  )}
                  <div className="flex justify-center">
                    <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 px-3.5 py-1.5 rounded-xl shadow-sm italic">
                      {msg.text}
                    </span>
                  </div>
                </div>
              );
            }
 
            return (
              <div key={index} className="space-y-4">
                {showDateDivider && (
                  <div className="flex items-center gap-4 py-2 justify-center my-2">
                    <div className="h-px bg-slate-800 flex-1"></div>
                    <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 font-semibold px-3 py-1 rounded-full shadow-sm tracking-wide">
                      {getDateDividerLabel(msg.createdAt)}
                    </span>
                    <div className="h-px bg-slate-800 flex-1"></div>
                  </div>
                )}
                <div 
                  className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : ''} animate-fade-in`}
                >
                  <div className={`w-9 h-9 rounded-xl ${
                    isUser 
                      ? 'bg-slate-700 text-slate-300' 
                      : isAgent 
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : isSupportTeam
                          ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                          : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                  } flex items-center justify-center shrink-0 mt-1 shadow-md overflow-hidden`}>
                    {isUser ? (
                      <i className="fa-regular fa-user text-sm"></i>
                    ) : isAgent ? (
                      msg.senderAvatarUrl ? (
                        <img 
                          src={getCleanImageUrl(msg.senderAvatarUrl)} 
                          alt={msg.senderName || 'Agent'} 
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <i className="fa-solid fa-headset text-sm"></i>
                      )
                    ) : isSupportTeam ? (
                      <i className="fa-solid fa-desktop text-sm"></i>
                    ) : (
                      <i className="fa-solid fa-robot text-sm"></i>
                    )}
                  </div>
                  <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full`}>
                    {isUser ? (
                      <div 
                        className="bg-sky-600 text-white rounded-tr-none p-4 rounded-2xl shadow-md text-sm whitespace-pre-wrap leading-relaxed flex flex-col gap-2"
                      >
                        <AttachmentView url={msg.imageUrl} name={msg.attachmentName} />
                        {msg.text && <span>{msg.text}</span>}
                      </div>
                    ) : (
                      <div className={`border text-slate-100 rounded-tl-none p-4 rounded-2xl shadow-md text-sm leading-relaxed flex flex-col gap-2 ${
                        isAgent 
                          ? 'bg-slate-900 border-emerald-500/30' 
                          : isSupportTeam 
                            ? 'bg-slate-900 border-violet-500/30' 
                            : 'bg-slate-900 border-slate-800'
                      }`}>
                        <AttachmentView url={msg.imageUrl} name={msg.attachmentName} />
                        <div 
                          className="markdown-content"
                          dangerouslySetInnerHTML={{ __html: renderMarkdownWithLinks(msg.text || '') }} 
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 mx-1">
                      <span className="text-xs text-slate-500">
                        {isUser 
                          ? (user?.name || 'Du') 
                          : isAgent 
                            ? (msg.senderName || 'Support-Mitarbeiter') 
                            : isSupportTeam 
                              ? 'Support-Team' 
                              : 'IT-Helpdesk-Bot'} {msg.createdAt ? `- ${parseUtcDate(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : ''}
                      </span>
                      {isBot && msg.id && (
                        <button
                          type="button"
                          onClick={() => handleFlagMessage(msg.id, index)}
                          disabled={msg.isFlagged}
                          className={`text-xs flex items-center gap-1 transition-all ${msg.isFlagged ? 'text-red-500 font-bold' : 'text-slate-500 hover:text-red-400 cursor-pointer'}`}
                          title={msg.isFlagged ? "Diese Antwort wurde gemeldet" : "Diese Antwort als fehlerhaft/komisch melden"}
                        >
                          <i className={`fa-${msg.isFlagged ? 'solid' : 'regular'} fa-flag`}></i>
                          <span>{msg.isFlagged ? 'Gemeldet' : 'Melden'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ticket Prompt Box direkt unter der ersten Bot-Nachricht */}
                {index === 0 && showTicketPrompt && activeTickets.length > 0 && (
                  <div className="flex gap-3 w-full max-w-[85%] sm:max-w-md animate-fade-in mt-3 overflow-hidden">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0 mt-1 shadow-md">
                      <i className="fa-solid fa-robot text-sm"></i>
                    </div>
                    <div className="flex flex-col items-start max-w-full min-w-0 w-full">
                      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none p-4 rounded-2xl shadow-md text-sm leading-relaxed w-full overflow-hidden">
                        <p className="font-bold mb-2 text-xs md:text-sm">Ich sehe, du hast bereits offene Anfragen. Geht es darum oder möchtest du etwas Neues fragen?</p>
                        <div className="space-y-2 mt-3 w-full">
                          {activeTickets.map(tk => (
                            <Link 
                              key={tk.id} 
                              href={`/tickets/${tk.id}`}
                              className="flex items-center justify-between gap-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 p-2.5 rounded-xl transition-all w-full text-left min-w-0 overflow-hidden"
                            >
                              <span className="truncate text-xs md:text-xs font-semibold text-slate-300 min-w-0 flex-1 block">
                                <span className="text-sky-400 font-mono font-bold">{tk.id}</span>: {tk.title}
                              </span>
                              <i className="fa-solid fa-arrow-right text-sky-500 text-xs shrink-0"></i>
                            </Link>
                          ))}
                          <button 
                            type="button"
                            onClick={() => setShowTicketPrompt(false)}
                            className="w-full py-2 bg-slate-800 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold mt-1 transition-all"
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

          {/* Schnell-Vorschläge (falls vorhanden) */}
          {messages.length === 1 && !isTyping && !showTicketPrompt && (
            <div className="space-y-2 pt-2 animate-fade-in max-w-2xl mx-auto">
              <p className="text-xs uppercase font-bold text-slate-500 tracking-wider">Häufige Themen:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestionClick(s)}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/30 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow text-slate-300 hover:text-white cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Support-Agent Tipp-Indikator ("...") solange der Agent schreibt */}
          {isAgentTyping && (
            <div className="flex gap-2.5 max-w-[92%] md:max-w-[75%] mr-auto animate-fade-in my-2">
              <div className="w-7 h-7 md:w-9 md:h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 shadow-md text-xs md:text-sm">
                <i className="fa-solid fa-headset"></i>
              </div>
              <div className="bg-slate-900 border border-emerald-500/30 text-slate-400 px-3.5 py-2.5 rounded-2xl rounded-tl-none flex items-center gap-1.5 text-xs shadow-md">
                <span className="font-semibold text-emerald-300 mr-1">Support schreibt</span>
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          )}

          {/* Bot Tipp-Indikator ("...") solange die KI antwortet */}
          {isTyping && (
            <div className="flex gap-2.5 max-w-[92%] md:max-w-[75%] mr-auto animate-fade-in my-2">
              <div className="w-7 h-7 md:w-9 md:h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 mt-0.5 shadow-md text-xs md:text-sm">
                <i className="fa-solid fa-robot"></i>
              </div>
              <div className="bg-slate-900 border border-slate-800 text-slate-400 px-3.5 py-2.5 rounded-2xl rounded-tl-none flex items-center gap-1.5 text-xs shadow-md">
                <span className="font-semibold text-slate-300 mr-1">IT-Helpdesk-Bot schreibt</span>
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
 
        {/* Input Area (Fest am unteren Bildschirmrand fixiert) */}
        <div className="p-2 sm:p-4 bg-slate-900 border-t border-slate-800 fixed bottom-0 left-0 right-0 z-20 shadow-lg flex flex-col gap-1.5 sm:gap-3 w-full">
          
          {isIpBanned ? (
            <div className="max-w-4xl mx-auto w-full bg-red-950/70 border border-red-500/40 rounded-2xl p-4 text-center space-y-3 animate-fade-in shadow-xl">
              <div className="flex items-center justify-center gap-2 text-red-400 font-bold text-sm">
                <i className="fa-solid fa-ban text-base"></i>
                <span>IP-Adresse für Chateingaben gesperrt</span>
              </div>
              <p className="text-xs text-red-200/90 leading-relaxed max-w-xl mx-auto">
                Aufgrund wiederholter Verstöße gegen die Nutzungsrichtlinien wurde die IP-Adresse dieses Geräts für 24 Stunden für alle Chateingaben gesperrt
                {bannedUntil ? ` (gesperrt bis ${new Date(bannedUntil).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr am ${new Date(bannedUntil).toLocaleDateString('de-DE')})` : ''}.
              </p>
              
              <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl text-xs text-slate-300 max-w-lg mx-auto text-left flex items-start gap-2.5 shadow-inner">
                <div className="w-5 h-5 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="fa-solid fa-desktop text-xs"></i>
                </div>
                <div>
                  <strong className="text-slate-200 block font-semibold mb-0.5">Sitzt du an einem gemeinsam genutzten Schul-PC?</strong>
                  <span className="leading-relaxed">
                    Die Sperre ist an die IP-Adresse dieses Computers gebunden. Wenn ein vorheriger Nutzer die Sperre ausgelöst hat, kannst du für Support-Hilfe einfach ein <strong>anderes Gerät</strong> (z. B. dein eigenes Smartphone oder Tablet) nutzen.
                  </span>
                </div>
              </div>
            </div>
          ) : isSecurityBlocked ? (
            <div className="max-w-4xl mx-auto w-full bg-slate-900 border border-sky-500/40 rounded-2xl p-4 text-center space-y-3 animate-fade-in shadow-xl">
              <div className="flex items-center justify-center gap-2 text-sky-400 font-bold text-sm">
                <i className="fa-solid fa-shield-halved text-base"></i>
                <span>Sicherheitsprüfung: {securityCategory || 'Anonymisierungs-Schutz'}</span>
              </div>
              <p className="text-xs text-slate-200/90 leading-relaxed max-w-xl mx-auto">
                {securityMessage || 'Der Zugriff über diese Netzwerkverbindung ist aus Sicherheitsgründen blockiert.'}
              </p>
              
              <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl text-xs text-slate-300 max-w-lg mx-auto text-left flex items-start gap-2.5 shadow-inner">
                <div className="w-5 h-5 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="fa-solid fa-lightbulb text-xs"></i>
                </div>
                <div>
                  <strong className="text-slate-200 block font-semibold mb-0.5">Was kann ich tun?</strong>
                  <span className="leading-relaxed">
                    {securityCategory === 'VPN' ? (
                      'Bitte deaktiviere deinen VPN-Dienst oder Cloudflare WARP und lade die Seite neu, um den IT-Support zu nutzen.'
                    ) : securityCategory === 'Proxy' ? (
                      'Bitte deaktiviere deinen Proxy-Server in den Systemeinstellungen und lade die Seite neu.'
                    ) : securityCategory === 'TOR' ? (
                      'Der Support-Chat ist über das TOR-Netzwerk nicht verfügbar. Bitte nutze einen Standard-Browser mit regulärer Internetverbindung.'
                    ) : (securityCategory === 'Kompromittierte IP' || securityCategory === 'Verdächtig' || securityCategory === 'Risiko-IP') ? (
                      'Diese IP-Adresse wurde als auffällig eingestuft. Wenn du mit einem VPN oder Proxy verbunden bist, ist dies oft der Grund – bitte deaktiviere den Dienst. Andernfalls nutze bitte das reguläre Schul-WLAN oder dein Mobilfunknetz.'
                    ) : (
                      'Falls du ein VPN oder einen Proxy nutzt, deaktiviere diesen bitte oder greife über das reguläre Schul-WLAN auf das Support-System zu.'
                    )}
                  </span>
                </div>
              </div>
            </div>
          ) : isChatAborted ? (
            <div className="max-w-4xl mx-auto w-full bg-amber-950/60 border border-amber-500/40 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in shadow-xl">
              <div className="flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-300">Gespräch beendet</h4>
                  <p className="text-xs text-slate-300">
                    Dieses Gespräch wurde wegen eines Richtlinienverstoßes beendet. Du kannst ein neues Gespräch für sachliche IT-Anfragen starten.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartNewChat}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5 cursor-pointer w-full sm:w-auto justify-center"
              >
                <i className="fa-solid fa-rotate-right"></i>
                <span>Neuen Chat starten</span>
              </button>
            </div>
          ) : (
            <>
              {/* Chatbot Deactivation Toggle */}
              <div className="max-w-4xl w-full mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-2 border-b border-slate-800/60 pb-1.5 sm:pb-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isChatbotDisabled}
                    onChange={(e) => handleChatbotToggle(e.target.checked)}
                    className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 rounded border-slate-800 bg-slate-950 text-sky-500 focus:ring-sky-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs sm:text-xs font-semibold text-slate-200">KI-Support-Assistenten ausschalten</span>
                    <span className="text-xs sm:text-xs text-slate-500 hidden sm:inline">
                      Deaktiviert die automatische KI. Du wirst direkt durch den Anlegeprozess für ein Support-Ticket geleitet.
                    </span>
                  </div>
                </label>
                {isChatbotDisabled && (
                  <button
                    type="button"
                    onClick={submitDirectTicket}
                    disabled={ticketCreationLoading || (directTicketTexts.length === 0 && directTicketPhotos.length === 0 && !inputValue.trim() && !selectedPhoto)}
                    className="w-full sm:w-auto bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <i className="fa-solid fa-paper-plane"></i>
                    <span>{ticketCreationLoading ? 'Sende...' : 'Ticket jetzt einsenden'}</span>
                  </button>
                )}
              </div>

              <p role="status" className="text-sm text-slate-300">{isTyping ? 'Wird gesendet …' : sendError ? 'Senden fehlgeschlagen' : sendStatus}</p>
              {sendError && <p role="alert" className="max-w-4xl mx-auto p-3 text-sm text-amber-300">{sendError}</p>}
              {selectedPhoto && !isImageAttachment(selectedPhoto.name) && <p className="text-sm text-slate-300">Diese Datei wird an den Support weitergegeben. Der Bot wertet Dokumente nicht aus.</p>}
              <form onSubmit={handleSend} className="max-w-4xl mx-auto w-full flex flex-col bg-slate-950 border border-slate-800 rounded-2xl p-1.5 sm:p-2.5 focus-within:ring-2 focus-within:ring-sky-500/20 focus-within:border-sky-500 transition-all shadow-inner">
                
                {/* Foto-Vorschau */}
                {selectedPhoto && (
                  <div className="flex items-center gap-2.5 p-1.5 border-b border-slate-900 pb-1.5 mb-1.5 animate-fade-in">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-800 shadow">
                      {photoPreview ? <img src={photoPreview} alt="Vorschau" className="w-full h-full object-cover" /> : <span aria-hidden="true">📎</span>}
                      <button 
                        type="button" 
                        onClick={handleDiscardPhoto}
                        aria-label="Anhang entfernen"
                        className="absolute top-0.5 right-0.5 bg-black/70 hover:bg-black text-white rounded-full w-4 h-4 flex items-center justify-center text-xs transition-colors cursor-pointer"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Anhang gewählt</p>
                      <p className="text-xs text-slate-300 truncate max-w-xs">{selectedPhoto?.name}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-end gap-2 sm:gap-3">
                  {/* Foto anhängen Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isChatAborted || isIpBanned || isTyping}
                    className="p-2 sm:p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-colors rounded-xl shrink-0 w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center shadow-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Datei oder Bild anhängen"
                  >
                    <i className="fa-solid fa-paperclip text-xs sm:text-sm"></i>
                  </button>
                  
                  <input 
                    type="file"
                    ref={fileInputRef}
                    disabled={isTyping}
                    onChange={handlePhotoSelect}
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                  />

                  <textarea 
                    value={inputValue}
                    onChange={handleInputChange}
                    onPaste={e => pasteAttachment(e,selectPhoto,setSendError)}
                    disabled={isChatAborted || isIpBanned || isTyping}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={isChatbotDisabled ? "Problem beschreiben oder Foto hochladen..." : "Problem beschreiben oder Foto hochladen..."}
                    rows="1"
                    className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-28 min-h-[36px] sm:min-h-[40px] py-1.5 px-1 text-xs sm:text-sm text-slate-200 placeholder-slate-600 outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <button 
                    type="submit"
                    disabled={(!inputValue.trim() && !selectedPhoto) || isTyping || isChatAborted || isIpBanned}
                    className="p-2 sm:p-3 bg-sky-600 hover:bg-sky-700 text-white transition-colors rounded-xl shrink-0 w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed shadow-md cursor-pointer"
                  >
                    <i className="fa-solid fa-paper-plane text-xs sm:text-sm"></i>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
 
      </main>

      {/* Modal Ticket Bestätigung (für angemeldete Nutzer, global positioniert) */}
      {showConfirmTicket && (
        <Dialog title="Ticket erstellen" onClose={() => setShowConfirmTicket(false)}>
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-sky-500/10 border border-sky-500/20 p-2.5 rounded-xl text-sky-500">
                <i className="fa-solid fa-circle-question text-xl"></i>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Support-Ticket erstellen?</h3>
                <p className="text-xs text-slate-400">Bestätige die Erstellung des IT-Tickets.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              Möchtest du ein Ticket mit folgendem Betreff für dich erstellen?<br/>
              <strong className="text-white mt-1.5 block">&quot;{pendingTicketTitle}&quot;</strong>
            </p>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setShowConfirmTicket(false)}
                disabled={ticketCreationLoading}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Abbrechen
              </button>
              <button 
                type="button" 
                disabled={ticketCreationLoading}
                onClick={() => createTicketDirectly(pendingTicketTitle, user.email)}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-75 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                {ticketCreationLoading ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin text-sm"></i>
                    <span>Erstelle Ticket...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check text-xs"></i>
                    <span>Ja, Ticket erstellen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal E-Mail Prompt bei Ticket-Erstellung (Gäste, global positioniert) */}
      {showEmailPrompt && (
        <Dialog title="Kontakt für das Ticket" onClose={() => setShowEmailPrompt(false)}>
          <form onSubmit={handleCreateGuestTicket} className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl text-amber-500">
                <i className="fa-solid fa-circle-question text-xl"></i>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">E-Mail für IT-Ticket benötigt</h3>
                <p className="text-xs text-slate-400">Um dein Ticket zu eröffnen, benötigen wir deine E-Mail-Adresse.</p>
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
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  disabled={ticketCreationLoading}
                >
                  Abbrechen
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
                  disabled={ticketCreationLoading || !guestEmail || !guestEmail.includes('@')}
                >
                  {ticketCreationLoading ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-sm"></i>
                      <span>Erstelle Ticket...</span>
                    </>
                  ) : (
                    <span>Ticket erstellen</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </Dialog>
      )}
      {/* Modal zum Melden einer Antwort (global positioniert) */}
      {showFlagModal && (
        <Dialog title="Antwort melden" onClose={() => setShowFlagModal(false)}>
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl text-red-500 animate-pulse">
                <i className="fa-solid fa-flag text-xl"></i>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Antwort melden</h3>
                <p className="text-xs text-slate-400">Hilf uns, den IT-Helpdesk-Bot zu verbessern. Was ist an dieser Antwort falsch oder unpassend?</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-bold block mb-1">Problembeschreibung (Optional)</label>
                <textarea 
                  value={flagReasonText}
                  onChange={(e) => setFlagReasonText(e.target.value)}
                  placeholder="z.B. Die genannte Tastenkombination ist falsch, die Lösung passt nicht zu meinem Drucker-Problem, etc."
                  rows="3"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
              
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowFlagModal(false);
                    setFlagReasonText('');
                  }}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  Abbrechen
                </button>
                <button 
                  type="button"
                  onClick={submitFlagMessage}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-paper-plane text-xs"></i>
                  <span>Meldung absenden</span>
                </button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* DSGVO Consent Modal */}
      {showConsentModal && (
        <Dialog title="Supportweg wählen" onClose={() => { setIsChatbotDisabled(true); setDirectTicketStep(2); setShowConsentModal(false); }}>
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col p-6 space-y-4">
            <div className="flex items-center gap-3 text-sky-400">
              <div className="bg-sky-500/10 p-2 rounded-xl border border-sky-500/20">
                <i className="fa-solid fa-shield-halved text-xl"></i>
              </div>
              <h3 className="text-base font-bold text-white">Nutzungshinweis & Datenschutz (DSGVO)</h3>
            </div>
            
            <div className="text-slate-300 text-xs space-y-3 leading-relaxed">
              <p>
                Dieser Support-Assistent nutzt ein <strong>künstliches Intelligenzsystem (LLM)</strong>, um dir automatisiert bei IT-Problemen zu helfen.
              </p>
              <p className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-400">
                <strong className="text-slate-300 block mb-1">⚠️ Wichtiger Hinweis zur Datenverarbeitung:</strong>
                Die von dir eingegebenen Anfragen werden zur Beantwortung an KI-Modelle übertragen. Dabei können Daten an Server <strong>außerhalb der Europäischen Union (EU)</strong> gesendet werden. Die dortige Verarbeitung ist nicht durch europäische Stellen kontrollierbar.
              </p>
              <p className="text-red-400 font-bold bg-red-950/20 border border-red-500/20 p-2.5 rounded-xl">
                ⚠️ Bitte trage niemals Passwörter, Geburtsdaten oder andere sensible persönliche Daten in das Chatfenster ein!
              </p>
              <p>
                Die Nutzung des Chat-Assistenten ist freiwillig. Du kannst alternativ jederzeit den Chatbot über das Kontrollkästchen direkt am Nachrichtenfeld deaktivieren, um dein Anliegen ohne KI-Unterstützung an das Support-Team zu senden. Bitte beachte, dass sich die Bearbeitungszeit dadurch verlängern kann, da das Ticket in diesem Fall manuell geprüft werden muss.
              </p>
            </div>
            
            <div className="pt-2 border-t border-slate-800 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentCheckbox}
                  onChange={(e) => setConsentCheckbox(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900 mt-0.5"
                />
                <span className="text-xs font-semibold text-slate-300">
                  Ja, ich stimme zu.
                </span>
              </label>
              
              <button type="button" onClick={() => { setIsChatbotDisabled(true); setDirectTicketStep(2); setShowConsentModal(false); }} className="w-full rounded-xl border border-slate-500 p-3 text-sm">Direkt an die IT schreiben · ohne KI</button>
              <button
                type="button"
                disabled={!consentCheckbox}
                onClick={handleAcceptConsent}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                <i className="fa-solid fa-circle-check"></i>
                <span>Zustimmen und Fortfahren</span>
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marked } from 'marked';

const safeParseMarkdown = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return marked.parse(content);
  if (typeof content === 'object') {
    if (typeof content.report === 'string') return marked.parse(content.report);
    if (typeof content.text === 'string') return marked.parse(content.text);
    return marked.parse(JSON.stringify(content, null, 2));
  }
  return String(content);
};

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

const CATEGORY_COLORS = [
  { stroke: '#8b5cf6', badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20', text: 'text-violet-400' },
  { stroke: '#38bdf8', badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20', text: 'text-sky-400' },
  { stroke: '#34d399', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', text: 'text-emerald-400' },
  { stroke: '#fbbf24', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', text: 'text-amber-400' },
  { stroke: '#f43f5e', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', text: 'text-rose-400' },
  { stroke: '#e879f9', badge: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20', text: 'text-fuchsia-400' },
  { stroke: '#2dd4bf', badge: 'bg-teal-500/10 text-teal-300 border-teal-500/20', text: 'text-teal-300' },
  { stroke: '#94a3b8', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20', text: 'text-slate-400' }
];

function BotCategoryDonutChart({ breakdown = [], totalChats = 0 }) {
  const [activeCategory, setActiveCategory] = useState(null);

  if (!breakdown || breakdown.length === 0) return null;

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  const segments = breakdown.map((item, idx) => {
    const colorScheme = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
    const segmentLength = (item.percentage / 100) * circumference;
    const strokeDashoffset = -accumulatedOffset;
    accumulatedOffset += segmentLength;

    return {
      ...item,
      colorScheme,
      segmentLength,
      strokeDashoffset
    };
  });

  const activeItem = activeCategory ? segments.find(s => s.category === activeCategory) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center bg-slate-950/70 border border-slate-850 p-6 rounded-2xl">
      {/* Donut Graphic */}
      <div className="lg:col-span-5 flex flex-col items-center justify-center relative py-2">
        <div className="relative w-52 h-52 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 180 180">
            <circle
              cx="90"
              cy="90"
              r={radius}
              stroke="#1e293b"
              strokeWidth="18"
              fill="transparent"
            />
            {segments.map((seg) => (
              <circle
                key={seg.category}
                cx="90"
                cy="90"
                r={radius}
                stroke={seg.colorScheme.stroke}
                strokeWidth={activeCategory === seg.category ? "24" : "18"}
                strokeDasharray={`${seg.segmentLength} ${circumference}`}
                strokeDashoffset={seg.strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                onMouseEnter={() => setActiveCategory(seg.category)}
                onMouseLeave={() => setActiveCategory(null)}
                className="transition-all duration-300 cursor-pointer origin-center"
                style={{ opacity: activeCategory && activeCategory !== seg.category ? 0.35 : 1 }}
              />
            ))}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
            {activeItem ? (
              <>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[120px]">
                  {activeItem.category}
                </span>
                <span className={`text-2xl font-black ${activeItem.colorScheme.text} mt-0.5`}>
                  {activeItem.count}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 font-mono">
                  {activeItem.percentage}% aller Chats
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Analysiert
                </span>
                <span className="text-3xl font-black text-white mt-0.5">
                  {totalChats}
                </span>
                <span className="text-[10px] text-violet-400 font-semibold">
                  {segments.length} {segments.length === 1 ? 'Kategorie' : 'Kategorien'}
                </span>
              </>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-2 text-center">
          <i className="fa-solid fa-hand-pointer mr-1 text-slate-400"></i>
          Fahre mit der Maus über ein Segment für Details
        </p>
      </div>

      {/* Categories Legend Grid */}
      <div className="lg:col-span-7 space-y-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <i className="fa-solid fa-chart-pie text-violet-400"></i>
            <span>Verteilung nach Themen</span>
          </span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Anteil</span>
        </div>

        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
          {segments.map((seg) => {
            const isHovered = activeCategory === seg.category;
            return (
              <div
                key={seg.category}
                onMouseEnter={() => setActiveCategory(seg.category)}
                onMouseLeave={() => setActiveCategory(null)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isHovered 
                    ? 'bg-slate-900 border-violet-500/60 shadow-lg scale-[1.01]' 
                    : 'bg-slate-950/60 border-slate-850 hover:bg-slate-900/60 hover:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span 
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: seg.colorScheme.stroke }}
                    />
                    <span className="font-semibold text-slate-100 truncate">{seg.category}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-bold text-white">
                      {seg.count} <span className="text-[10px] text-slate-500 font-normal">Chats</span>
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${seg.colorScheme.badge}`}>
                      {seg.percentage}%
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.min(100, seg.percentage)}%`,
                      backgroundColor: seg.colorScheme.stroke
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge', 'private_knowledge', 'solutions', 'import', 'settings', 'users', 'statistics', 'flagged', 'abusive', 'update'
  const router = useRouter();

  // Solutions (Saved closed solutions) States
  const [solutions, setSolutions] = useState([]);
  const [solutionsLoading, setSolutionsLoading] = useState(false);
  const [solutionsSearch, setSolutionsSearch] = useState('');
  const [generatingContextId, setGeneratingContextId] = useState(null);

  // Statistics States
  const [statistics, setStatistics] = useState([]);
  const [botStatistics, setBotStatistics] = useState(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [categorizingBotChats, setCategorizingBotChats] = useState(false);
  const [categorizingResultMsg, setCategorizingResultMsg] = useState('');

  // Chats States
  const [chatsList, setChatsList] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsSearch, setChatsSearch] = useState('');
  const [selectedChatDetails, setSelectedChatDetails] = useState(null);
  const [selectedChatMessages, setSelectedChatMessages] = useState([]);
  const [selectedChatIdentityTrace, setSelectedChatIdentityTrace] = useState(null);
  const [chatDetailsLoading, setChatDetailsLoading] = useState(false);
  const [showMobileChatModal, setShowMobileChatModal] = useState(false);
  const [chatAnalysis, setChatAnalysis] = useState(null);
  const [isAnalyzingChat, setIsAnalyzingChat] = useState(false);
  const [qualityAnalysisModal, setQualityAnalysisModal] = useState(null); // { chatId, loading, report, suggestedKnowledge }

  // Knowledge States
  const [knowledge, setKnowledge] = useState([]);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [editingChunk, setEditingChunk] = useState(null); // Chunk being edited
  const [isCreatingChunk, setIsCreatingChunk] = useState(false);
  const [chunkTitle, setChunkTitle] = useState('');
  const [chunkFact, setChunkFact] = useState('');
  const [chunkDescription, setChunkDescription] = useState('');
  const [chunkCategory, setChunkCategory] = useState('');
  const [chunkIsPrivate, setChunkIsPrivate] = useState(false);
  const [chunkError, setChunkError] = useState('');
  const [isSavingChunk, setIsSavingChunk] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [adminSelectedCategory, setAdminSelectedCategory] = useState('Alle');
  const [adminSelectedPrivateCategory, setAdminSelectedPrivateCategory] = useState('Alle');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  // Users States
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  
  // Import States
  const [importUrl, setImportUrl] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [importChunksList, setImportChunksList] = useState([]);

  // Settings States
  const [smtpConfig, setSmtpConfig] = useState({ host: '', port: 1025, user: '', pass: '', secure: false, sender: '' });
  const [idpConfig, setIdpConfig] = useState({ jwtSecret: '', redirectUrl: '', logoutText: '', logoutRedirectUrl: '' });
  const [githubConfig, setGithubConfig] = useState({ repoUrl: '', branch: '' });
  const [geminiConfig, setGeminiConfig] = useState({ apiKey: '', chatModel: '', extractionModel: '' });
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [logoutLabel, setLogoutLabel] = useState('Abmelden');

  // Mobile Menu State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // SMTP Test States
  const [testRecipient, setTestRecipient] = useState('');
  const [testSmtpLoading, setTestSmtpLoading] = useState(false);
  const [testSmtpResult, setTestSmtpResult] = useState(null);

  // Flagged Messages States
  const [flaggedMessages, setFlaggedMessages] = useState([]);
  const [isFlaggedLoading, setIsFlaggedLoading] = useState(false);

  // Abusive Chats States
  const [abusiveChats, setAbusiveChats] = useState([]);
  const [isAbusiveLoading, setIsAbusiveLoading] = useState(false);

  // Update States
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateLogs, setUpdateLogs] = useState(null);
  const [showRestartOverlay, setShowRestartOverlay] = useState(false);

  useEffect(() => {
    // Session prüfen
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.user || data.user.role !== 'admin') {
          router.push('/login');
        } else {
          setUser(data.user);
          setTestRecipient(data.user.email || '');
          if (data.logoutText) {
            setLogoutLabel(data.logoutText);
          }
          loadAllData();
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'flagged') {
      loadFlaggedMessages();
    } else if (activeTab === 'abusive') {
      loadAbusiveChats();
    } else if (activeTab === 'solutions') {
      loadSolutions();
    } else if (activeTab === 'statistics') {
      loadStatistics();
    } else if (activeTab === 'chats') {
      loadChats();
    }
  }, [activeTab]);

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      } else {
        const data = await res.json();
        setUsersError(data.error || 'Fehler beim Laden der Benutzer.');
      }
    } catch (e) {
      setUsersError('Verbindungsfehler.');
    } finally {
      setUsersLoading(false);
    }
  };

  const loadFlaggedMessages = async () => {
    setIsFlaggedLoading(true);
    try {
      const res = await fetch('/api/admin/flagged');
      if (res.ok) {
        const data = await res.json();
        setFlaggedMessages(data.flaggedMessages || []);
      }
    } catch (e) {
      console.error('Fehler beim Laden geflaggter Nachrichten:', e);
    } finally {
      setIsFlaggedLoading(false);
    }
  };

  const handleResolveFlagged = async (messageId) => {
    try {
      const res = await fetch('/api/admin/flagged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, action: 'resolve' })
      });
      if (res.ok) {
        setFlaggedMessages(prev => prev.filter(m => m.id !== messageId));
      }
    } catch (e) {
      console.error('Fehler beim Freigeben der Nachricht:', e);
    }
  };

  const loadAbusiveChats = async () => {
    setIsAbusiveLoading(true);
    try {
      const res = await fetch('/api/admin/abusive');
      if (res.ok) {
        const data = await res.json();
        setAbusiveChats(data.abusiveChats || []);
      }
    } catch (e) {
      console.error('Fehler beim Laden missbräuchlicher Chats:', e);
    } finally {
      setIsAbusiveLoading(false);
    }
  };

  const loadSolutions = async () => {
    setSolutionsLoading(true);
    try {
      const res = await fetch('/api/admin/solutions');
      if (res.ok) {
        const data = await res.json();
        setSolutions(data.solutions || []);
      }
    } catch (e) {
      console.error('Fehler beim Laden der Lösungen:', e);
    } finally {
      setSolutionsLoading(false);
    }
  };

  const handleForgetSolution = async (ticketId) => {
    if (!confirm('Möchtest du diese gespeicherte Lösung wirklich aus der Wissensbasis löschen ("vergessen")?')) return;
    try {
      const res = await fetch('/api/admin/solutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, action: 'forget' })
      });
      if (res.ok) {
        setSolutions(prev => prev.filter(sol => sol.id !== ticketId));
      } else {
        alert('Fehler beim Vergessen der Lösung.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
    }
  };

  const handleGenerateSolutionContext = async (ticketId) => {
    setGeneratingContextId(ticketId);
    try {
      const res = await fetch('/api/admin/solutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, action: 'generate-context' })
      });
      if (res.ok) {
        const data = await res.json();
        setSolutions(prev => prev.map(sol => sol.id === ticketId ? { ...sol, solutionContext: data.solutionContext } : sol));
      } else {
        alert('Fehler beim Generieren der Zusammenfassung.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
    } finally {
      setGeneratingContextId(null);
    }
  };

  const loadStatistics = async () => {
    setStatisticsLoading(true);
    try {
      const res = await fetch('/api/admin/statistics');
      if (res.ok) {
        const data = await res.json();
        setStatistics(data.statistics || []);
        if (data.botStatistics) setBotStatistics(data.botStatistics);
      }
    } catch (e) {
      console.error('Fehler beim Laden der Statistik:', e);
    } finally {
      setStatisticsLoading(false);
    }
  };

  const handleCategorizeAllChats = async () => {
    setCategorizingBotChats(true);
    setCategorizingResultMsg('');
    try {
      const res = await fetch('/api/admin/chats/categorize', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const durationSec = (data.durationMs ? (data.durationMs / 1000).toFixed(1) : '1.2');
        setCategorizingResultMsg(`⚡ ${data.processedCount} Chat(s) in ${durationSec}s per Highspeed-Parallel-Batch einkategorisiert.`);
        loadStatistics();
        if (activeTab === 'chats') loadChats();
      } else {
        const data = await res.json();
        setCategorizingResultMsg(data.error || 'Fehler beim Kategorisieren.');
      }
    } catch (e) {
      setCategorizingResultMsg('Verbindungsfehler.');
    } finally {
      setCategorizingBotChats(false);
    }
  };

  const loadChats = async () => {
    setChatsLoading(true);
    try {
      const res = await fetch('/api/admin/chats');
      if (res.ok) {
        const data = await res.json();
        setChatsList(data.chats || []);
      }
    } catch (e) {
      console.error('Fehler beim Laden der Chats:', e);
    } finally {
      setChatsLoading(false);
    }
  };

  const loadChatDetails = async (chatId) => {
    setChatDetailsLoading(true);
    setShowMobileChatModal(true);
    setChatAnalysis(null);
    setSelectedChatIdentityTrace(null);
    try {
      const res = await fetch(`/api/admin/chats?chatId=${chatId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedChatDetails(data.chat);
        setSelectedChatMessages(data.messages || []);
        setSelectedChatIdentityTrace(data.identityTrace || null);
      }
    } catch (e) {
      console.error('Fehler beim Laden der Chat-Details:', e);
    } finally {
      setChatDetailsLoading(false);
    }
  };

  const handleToggleAbusiveChat = async (chatId, currentAbusiveState) => {
    try {
      const action = currentAbusiveState ? 'unflag_abusive' : 'flag_abusive';
      const res = await fetch('/api/admin/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, action })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedChatDetails(prev => prev ? { ...prev, isAbusive: data.isAbusive ? 1 : 0 } : null);
        if (data.identityTrace) {
          setSelectedChatIdentityTrace(data.identityTrace);
        } else if (!data.isAbusive) {
          setSelectedChatIdentityTrace(null);
        }
        setChatsList(prev => prev.map(c => c.id === chatId ? { ...c, isAbusive: data.isAbusive ? 1 : 0 } : c));
        if (typeof loadAbusiveChats === 'function') {
          loadAbusiveChats();
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Fehler beim Ändern des Missbrauchs-Status.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler beim Ändern des Missbrauchs-Status.');
    }
  };

  const [isConvertingTicket, setIsConvertingTicket] = useState(false);

  const handleConvertChatToTicket = async (chat) => {
    if (!chat) return;
    if (chat.ticketCreated === 1) {
      const linkedTicket = selectedChatIdentityTrace?.linkedTickets?.[0]?.id || tickets.find(t => t.chatId === chat.id)?.id;
      if (linkedTicket) {
        router.push(`/agent/tickets/${linkedTicket}`);
        return;
      }
    }

    if (!confirm(`Möchtest du aus dem Chat mit "${chat.userName || chat.userEmail || 'Gast'}" ein neues Support-Ticket erstellen?`)) {
      return;
    }

    setIsConvertingTicket(true);
    try {
      let ticketTitle = chat.category ? `Support-Anfrage: ${chat.category}` : 'Support-Anfrage aus Chat';
      if (selectedChatMessages && selectedChatMessages.length > 0) {
        const firstUserMsg = selectedChatMessages.find(m => m.sender === 'user')?.text;
        if (firstUserMsg) {
          ticketTitle = firstUserMsg.length > 60 ? `${firstUserMsg.substring(0, 57)}...` : firstUserMsg;
        }
      }

      const currentAgentId = user?.id || 'me';

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chat.id,
          email: chat.userEmail || 'gast@schule.de',
          name: chat.userName || 'Gast',
          title: ticketTitle,
          assignedAgentId: currentAgentId
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Ticket ${data.ticketId} wurde erfolgreich aus dem Chat erstellt und dir direkt zugewiesen!`);
        loadChats();
        setSelectedChatDetails(prev => prev ? { ...prev, ticketCreated: 1 } : null);
        router.push(`/agent/tickets/${data.ticketId}`);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Fehler beim Erstellen des Tickets.');
      }
    } catch (e) {
      console.error('Fehler bei Chat-in-Ticket Umwandlung:', e);
      alert('Verbindungsfehler beim Erstellen des Tickets.');
    } finally {
      setIsConvertingTicket(false);
    }
  };

  const handleAddSuggestedKnowledge = (suggestion) => {
    setChunkTitle(suggestion?.title || '');
    setChunkCategory(suggestion?.category || 'Sonstiges');
    setChunkDescription(suggestion?.description || '');
    setChunkFact(suggestion?.description || suggestion?.title || '');
    setChunkIsPrivate(true);
    setEditingChunk(null);
    setIsCreatingChunk(true);
    setActiveTab('private_knowledge');
    setQualityAnalysisModal(null);
    setChatAnalysis(null);
    setShowMobileChatModal(false);
    // Sanft nach oben scrollen zum Formular
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenChunkInEditorById = async (chunkId) => {
    if (!chunkId) return;
    const cleanId = String(chunkId).trim();

    // 1. In geladener Knowledge-Liste suchen
    let found = knowledge.find(k => String(k.id) === cleanId || String(k.id) === `chunk-${cleanId}` || cleanId.includes(String(k.id)));
    if (!found) {
      try {
        const res = await fetch(`/api/admin/knowledge/${encodeURIComponent(cleanId)}`);
        if (res.ok) {
          const data = await res.json();
          found = data.chunk;
        }
      } catch (e) {}
    }

    if (found) {
      const isPrivate = found.isPrivate || found.is_private === 1 || found.category === 'Intern';
      setActiveTab(isPrivate ? 'private_knowledge' : 'knowledge');
      setEditingChunk(found);
      setChunkTitle(found.title || '');
      setChunkFact(found.fact || found.description || '');
      setChunkDescription(found.description || found.fact || '');
      setChunkCategory(found.category || 'Sonstiges');
      setChunkIsPrivate(!!isPrivate);
      setIsCreatingChunk(false);
      setShowMobileChatModal(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Falls neu / nicht vorhanden: Neues Erstellformular öffnen
      setActiveTab('knowledge');
      setEditingChunk(null);
      setIsCreatingChunk(true);
      setChunkTitle(cleanId);
      setChunkFact('');
      setChunkDescription('');
      setChunkCategory('Sonstiges');
      setChunkIsPrivate(false);
      setShowMobileChatModal(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCreateChunkFromSuggestion = (suggestion) => {
    if (!suggestion) return;
    const isPrivate = suggestion.isPrivate || suggestion.category === 'Intern';
    setActiveTab(isPrivate ? 'private_knowledge' : 'knowledge');
    setEditingChunk(null);
    setIsCreatingChunk(true);
    setChunkTitle(suggestion.title || '');
    setChunkFact(suggestion.description || suggestion.fact || '');
    setChunkDescription(suggestion.description || suggestion.fact || '');
    setChunkCategory(suggestion.category || 'Sonstiges');
    setChunkIsPrivate(!!isPrivate);
    setShowMobileChatModal(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAnalyzeChat = async (chatId) => {
    setIsAnalyzingChat(true);
    setChatAnalysis(null);
    setQualityAnalysisModal({ chatId, loading: true, report: null, suggestedKnowledge: null });

    try {
      const res = await fetch('/api/admin/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, action: 'analyze' })
      });
      if (res.ok) {
        const data = await res.json();
        const reportText = typeof data.analysis === 'object' ? data.analysis.report : data.analysis;
        const suggested = typeof data.analysis === 'object' ? data.analysis.suggestedKnowledge : null;

        setQualityAnalysisModal({
          chatId,
          loading: false,
          report: reportText,
          suggestedKnowledge: suggested
        });
        setChatAnalysis(data.analysis);
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler bei der Analyse des Chats.');
        setQualityAnalysisModal(null);
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler bei der Chat-Analyse.');
      setQualityAnalysisModal(null);
    } finally {
      setIsAnalyzingChat(false);
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (!confirm('Diesen Chat und alle seine Nachrichten unwiderruflich löschen?')) return;
    try {
      const res = await fetch(`/api/admin/chats?chatId=${chatId}`, { method: 'DELETE' });
      if (res.ok) {
        setChatsList(prev => prev.filter(c => c.id !== chatId));
        if (selectedChatDetails?.id === chatId) {
          setSelectedChatDetails(null);
          setSelectedChatMessages([]);
          setShowMobileChatModal(false);
        }
      } else {
        alert('Löschen fehlgeschlagen.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
    }
  };

  const handleResolveAbusive = async (chatId) => {
    try {
      const res = await fetch('/api/admin/abusive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, action: 'resolve' })
      });
      if (res.ok) {
        setAbusiveChats(prev => prev.filter(c => c.id !== chatId));
      }
    } catch (e) {
      console.error('Fehler beim Freigeben des Chats:', e);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole })
      });
      if (res.ok) {
        loadUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Ändern der Rolle.');
      }
    } catch (e) {
      alert('Verbindungsfehler.');
    }
  };

  const handleUpdateResponsibilitiesState = (userId, value) => {
    setUsersList(prev => prev.map(u => u.id === userId ? { ...u, responsibilities: value } : u));
  };

  const handleSaveResponsibilities = async (userId, value) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, responsibilities: value })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Fehler beim Speichern der Zuständigkeiten.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler beim Speichern der Zuständigkeiten.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Diesen Benutzer wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/admin/users?userId=${userId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Löschen des Benutzers.');
      }
    } catch (e) {
      alert('Verbindungsfehler.');
    }
  };

  const handleGenerateDescription = async () => {
    if (!chunkTitle.trim() || !chunkFact.trim()) {
      alert('Bitte füllen Sie zuerst den Titel und den Fakt aus.');
      return;
    }
    setIsGeneratingDesc(true);
    try {
      const res = await fetch('/api/admin/knowledge/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: chunkTitle, fact: chunkFact })
      });
      if (res.ok) {
        const data = await res.json();
        setChunkDescription(data.description || '');
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Generieren der Beschreibung.');
      }
    } catch (e) {
      alert('Verbindungsfehler.');
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const loadAllData = async () => {
    try {
      const [knowledgeRes, settingsRes] = await Promise.all([
        fetch('/api/admin/knowledge'),
        fetch('/api/admin/settings')
      ]);

      if (knowledgeRes.ok) {
        const data = await knowledgeRes.json();
        setKnowledge(data.knowledge || []);
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const config = data.config || {};
        if (config.smtp_config) setSmtpConfig(config.smtp_config);
        if (config.idp_config) setIdpConfig(config.idp_config);
        if (config.github_config) setGithubConfig(config.github_config);
        if (config.gemini_config) setGeminiConfig(config.gemini_config);
      }
    } catch (err) {
      console.error('Fehler beim Laden der Admin-Daten:', err);
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

  // --- Knowledge CRUD ---
  const handleSaveChunk = async (e) => {
    e.preventDefault();
    if (isSavingChunk) return;
    setIsSavingChunk(true);
    setChunkError('');
    const url = editingChunk ? `/api/admin/knowledge/${editingChunk.id}` : '/api/admin/knowledge';
    const method = editingChunk ? 'PUT' : 'POST';
    const category = chunkIsPrivate ? 'Intern' : (chunkCategory || 'Sonstiges');

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: chunkTitle, description: chunkDescription, category, isPrivate: chunkIsPrivate })
      });

      const data = await res.json();
      
      if (res.ok) {
        setChunkTitle('');
        setChunkFact('');
        setChunkDescription('');
        setChunkCategory('');
        setChunkIsPrivate(false);
        setEditingChunk(null);
        setIsCreatingChunk(false);
        loadAllData();
      } else {
        setChunkError(data.message || data.error || 'Fehler beim Speichern.');
      }
    } catch (err) {
      setChunkError('Verbindungsfehler beim Speichern.');
    } finally {
      setIsSavingChunk(false);
    }
  };

  const handleDeleteChunk = async (id) => {
    if (!confirm('Diesen Wissenseintrag wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadAllData();
      }
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
    }
  };

  const handleUploadAttachment = async (e) => {
    const file = e.target.files[0];
    if (!file || !editingChunk) return;

    setAttachmentError('');
    setUploadingAttachment(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/admin/knowledge/${editingChunk.id}/attachments`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        const updatedAttachments = [...(editingChunk.attachments || []), data.attachment];
        const updatedEditingChunk = { ...editingChunk, attachments: updatedAttachments };
        setEditingChunk(updatedEditingChunk);
        setKnowledge(prev => prev.map(k => k.id === editingChunk.id ? updatedEditingChunk : k));
      } else {
        setAttachmentError(data.error || 'Fehler beim Hochladen.');
      }
    } catch (err) {
      setAttachmentError('Verbindungsfehler beim Hochladen.');
    } finally {
      setUploadingAttachment(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!confirm('Diesen Anhang wirklich löschen?') || !editingChunk) return;

    setAttachmentError('');
    try {
      const res = await fetch(`/api/admin/knowledge/${editingChunk.id}/attachments?attachmentId=${attachmentId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        const updatedAttachments = (editingChunk.attachments || []).filter(a => a.id !== attachmentId);
        const updatedEditingChunk = { ...editingChunk, attachments: updatedAttachments };
        setEditingChunk(updatedEditingChunk);
        setKnowledge(prev => prev.map(k => k.id === editingChunk.id ? updatedEditingChunk : k));
      } else {
        const data = await res.json();
        setAttachmentError(data.error || 'Fehler beim Löschen des Anhangs.');
      }
    } catch (err) {
      setAttachmentError('Verbindungsfehler beim Löschen.');
    }
  };

  // --- Knowledge Import ---
  const handleImportUrl = async (e) => {
    e.preventDefault();
    if (!importUrl.trim()) return;

    setImportLoading(true);
    setImportResult('');
    setImportChunksList([]);

    try {
      const res = await fetch('/api/admin/knowledge/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      });

      const data = await res.json();
      setImportLoading(false);
      
      if (res.ok) {
        setImportResult(data.message);
        setImportChunksList(data.chunks || []);
        setImportUrl('');
        loadAllData();
      } else {
        setImportResult(`Import-Fehler: ${data.error}`);
      }
    } catch (err) {
      setImportLoading(false);
      setImportResult('Verbindungsfehler beim Import.');
    }
  };

  const handleImportFile = async (e) => {
    e.preventDefault();
    if (!importFile) return;

    setImportLoading(true);
    setImportResult('');
    setImportChunksList([]);

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      const res = await fetch('/api/admin/knowledge/import', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      setImportLoading(false);
      
      if (res.ok) {
        setImportResult(data.message);
        setImportChunksList(data.chunks || []);
        setImportFile(null);
        loadAllData();
      } else {
        setImportResult(`Import-Fehler: ${data.error}`);
      }
    } catch (err) {
      setImportLoading(false);
      setImportResult('Verbindungsfehler beim Datei-Import.');
    }
  };

  // --- Settings ---
  const handleTestSmtp = async (e) => {
    e.preventDefault();
    if (!testRecipient) {
      alert('Bitte geben Sie eine Empfänger-E-Mail-Adresse ein.');
      return;
    }

    setTestSmtpLoading(true);
    setTestSmtpResult(null);

    try {
      const res = await fetch('/api/admin/settings/test-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: smtpConfig,
          recipientEmail: testRecipient
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTestSmtpResult(data);
      } else {
        const data = await res.json();
        setTestSmtpResult({ success: false, error: data.error || 'Fehler beim Senden der Testmail.' });
      }
    } catch (err) {
      setTestSmtpResult({ success: false, error: 'Verbindungsfehler beim API-Aufruf.' });
    } finally {
      setTestSmtpLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSuccess(false);
    setSettingsError('');

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp_config: smtpConfig,
          idp_config: idpConfig,
          github_config: githubConfig,
          gemini_config: geminiConfig
        })
      });

      if (res.ok) {
        setSettingsSuccess(true);
        loadAllData();
      } else {
        const data = await res.json();
        setSettingsError(data.error || 'Fehler beim Speichern.');
      }
    } catch (err) {
      setSettingsError('Verbindungsfehler.');
    }
  };

  // --- Git Update ---
  const handleGitUpdate = async () => {
    if (!confirm('Git-Update jetzt ausführen? Der Server wird neu gebaut und startet neu.')) return;
    
    setUpdateLoading(true);
    setUpdateLogs(null);

    try {
      const res = await fetch('/api/admin/update', { method: 'POST' });
      const data = await res.json();
      setUpdateLoading(false);

      if (res.ok) {
        setUpdateLogs(data.log);
        setShowRestartOverlay(true);
        // Nach 5 Sekunden Seite neu laden
        setTimeout(() => {
          window.location.reload();
        }, 6000);
      } else {
        setUpdateLogs({
          error: data.error || 'Fehler beim Update.',
          details: data.details || '',
          stdout: data.stdout || '',
          stderr: data.stderr || ''
        });
      }
    } catch (err) {
      setUpdateLoading(false);
      alert('Fehler beim Ausführen des Updates.');
    }
  };

  // Filtered knowledge chunks (public vs private)
  const publicKnowledge = knowledge.filter(k => !k.isPrivate);
  const privateKnowledge = knowledge.filter(k => !!k.isPrivate);

  const filteredKnowledge = publicKnowledge.filter(k => {
    const content = (k.description || k.fact || '').toLowerCase();
    const matchesSearch = k.title.toLowerCase().includes(knowledgeSearch.toLowerCase()) ||
      content.includes(knowledgeSearch.toLowerCase());
    const matchesCategory = adminSelectedCategory === 'Alle' || (k.category || 'Sonstiges') === adminSelectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredPrivateKnowledge = privateKnowledge.filter(k => {
    const content = (k.description || k.fact || '').toLowerCase();
    const matchesSearch = k.title.toLowerCase().includes(knowledgeSearch.toLowerCase()) ||
      content.includes(knowledgeSearch.toLowerCase());
    const matchesCategory = adminSelectedPrivateCategory === 'Alle' || (k.category || 'Sonstiges') === adminSelectedPrivateCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredUsersList = usersList.filter(u => {
    const matchesName = (u.name || '').toLowerCase().includes(userSearch.toLowerCase());
    const matchesEmail = (u.email || '').toLowerCase().includes(userSearch.toLowerCase());
    return matchesName || matchesEmail;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center flex-col gap-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Lade Admin-Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative">
      
      {/* Restart Overlay */}
      {showRestartOverlay && (
        <div className="fixed inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center gap-4 text-center p-6">
          <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          <h2 className="text-xl font-bold text-white">Server wird neu gestartet...</h2>
          <p className="text-xs text-slate-400 max-w-sm">
            Das Github-Update war erfolgreich. Das Next.js-Projekt wird im PM2 neu geladen. Die Seite aktualisiert sich in wenigen Sekunden automatisch.
          </p>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex justify-between items-center shrink-0 shadow-lg z-30 relative h-[72px]">
        <div className="flex items-center gap-3">
          <div className="bg-violet-600 text-white p-2 rounded-xl shadow-md flex items-center justify-center shrink-0">
            <i className="fa-solid fa-gears text-lg md:text-xl"></i>
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold text-white leading-tight">System-Administration</h1>
            <p className="text-[9px] md:text-[10px] text-violet-400 font-bold uppercase tracking-wider">Verwaltungs-Bereich</p>
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
              <i className="fa-solid fa-user-shield text-violet-400"></i>
            )}
            <span className="font-semibold">{user?.name || user?.email}</span>
          </Link>

          <Link
            href="/"
            className="bg-slate-850 hover:bg-slate-800 text-slate-350 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-comments text-sky-400"></i>
            <span>Zum Chat-Frontend</span>
          </Link>

          <Link 
            href="/agent"
            className="bg-slate-850 hover:bg-slate-800 text-slate-350 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-ticket text-violet-400"></i>
            <span>Agenten-Portal</span>
          </Link>

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
              className="flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl transition-all text-xs text-slate-350 font-semibold"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-5 h-5 rounded-full object-cover border border-violet-500/30" />
              ) : (
                <i className="fa-solid fa-user-shield text-violet-400"></i>
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

            <Link 
              href="/agent"
              onClick={() => setMobileMenuOpen(false)}
              className="bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-ticket text-violet-400"></i>
              <span>Agenten-Portal</span>
            </Link>

            <button 
              type="button"
              onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
              className="bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-400 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-right-from-bracket"></i>
              <span>{logoutLabel}</span>
            </button>

            {/* Mobile Admin Navigation Tabs */}
            <div className="border-t border-slate-800 pt-4 mt-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Navigation:</span>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => { setActiveTab('knowledge'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'knowledge' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-brain shrink-0 w-4"></i>
                  <span className="truncate">Öffentlich</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('private_knowledge'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'private_knowledge' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-user-lock shrink-0 w-4"></i>
                  <span className="truncate">Intern</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('solutions'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'solutions' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-circle-check shrink-0 w-4 text-emerald-400"></i>
                  <span className="truncate">Lösungen</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('import'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'import' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-cloud-arrow-up shrink-0 w-4"></i>
                  <span className="truncate">KI-Import</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('users'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'users' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-users shrink-0 w-4"></i>
                  <span className="truncate">Benutzer</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('statistics'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'statistics' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-chart-line shrink-0 w-4 text-sky-400"></i>
                  <span className="truncate">Statistik</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'settings' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-sliders shrink-0 w-4"></i>
                  <span className="truncate">Settings</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('chats'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'chats' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-comments shrink-0 w-4 text-sky-400"></i>
                  <span className="truncate">Chats</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('flagged'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'flagged' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-flag shrink-0 w-4"></i>
                  <span className="truncate">Geflaggt</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('abusive'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'abusive' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-solid fa-triangle-exclamation shrink-0 w-4"></i>
                  <span className="truncate">Missbrauch</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('update'); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-start ${activeTab === 'update' ? 'bg-violet-600 text-white' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                >
                  <i className="fa-brands fa-github shrink-0 w-4"></i>
                  <span className="truncate">Update</span>
                </button>
              </div>
            </div>

          </div>
        )}
      </header>

      {/* Tabs - Hidden on mobile, visible on desktop */}
      <div className="hidden md:flex bg-slate-900 border-b border-slate-800 px-6 overflow-x-auto gap-4 scrollbar-none shrink-0">
        
        {/* Hauptmenü: Wissen */}
        <div className="flex items-center gap-1 border-r border-slate-800/80 pr-4 my-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block pl-2 mr-2">Wissen:</span>
          <button 
            onClick={() => setActiveTab('knowledge')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'knowledge' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-solid fa-brain"></i>
            <span>Öffentlich</span>
          </button>
          <button 
            onClick={() => setActiveTab('private_knowledge')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'private_knowledge' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-solid fa-user-lock"></i>
            <span>Intern</span>
          </button>
          <button 
            onClick={() => setActiveTab('solutions')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'solutions' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
            title="Lösungen aus geschlossenen Tickets verwalten"
          >
            <i className="fa-solid fa-circle-check text-emerald-400"></i>
            <span>Lösungen</span>
          </button>
          <button 
            onClick={() => setActiveTab('import')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'import' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-solid fa-cloud-arrow-up"></i>
            <span>KI-Import</span>
          </button>
        </div>

        {/* Hauptmenü: Benutzer */}
        <div className="flex items-center gap-1 border-r border-slate-800/80 pr-4 my-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block pl-2 mr-2">Benutzer:</span>
          <button 
            onClick={() => setActiveTab('users')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'users' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-solid fa-users"></i>
            <span>Benutzerverwaltung</span>
          </button>
          <button 
            onClick={() => setActiveTab('statistics')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'statistics' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-solid fa-chart-line text-sky-400"></i>
            <span>Statistik</span>
          </button>
        </div>

        {/* System & Sonstiges */}
        <div className="flex items-center gap-1 my-2">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-solid fa-sliders"></i>
            <span>Einstellungen</span>
          </button>
          <button 
            onClick={() => setActiveTab('chats')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'chats' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
            title="Alle gespeicherten Chats durchsuchen und verwalten"
          >
            <i className="fa-solid fa-comments text-sky-400"></i>
            <span>Chats</span>
          </button>
          <button 
            onClick={() => setActiveTab('flagged')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'flagged' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-solid fa-flag"></i>
            <span>Geflaggte Antworten</span>
          </button>
          <button 
            onClick={() => setActiveTab('abusive')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'abusive' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>Missbrauchsmeldungen</span>
          </button>
          <button 
            onClick={() => setActiveTab('update')}
            className={`py-2 px-3.5 rounded-xl font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'update' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'}`}
          >
            <i className="fa-brands fa-github"></i>
            <span>System-Update</span>
          </button>
        </div>
      </div>

      {/* Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 overflow-y-auto">
        
        {/* Tab 1: Wissensdatenbank */}
        {activeTab === 'knowledge' && (
          <div className="space-y-6">
            {/* Search and Add panel */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50 p-4 border border-slate-800 rounded-2xl">
              <div className="flex-1 w-full sm:max-w-md relative">
                <i className="fa-solid fa-magnifying-glass text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs"></i>
                <input 
                  type="text" 
                  value={knowledgeSearch}
                  onChange={(e) => setKnowledgeSearch(e.target.value)}
                  placeholder="Öffentliches Wissen durchsuchen..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
              <button 
                onClick={() => {
                  setEditingChunk(null);
                  setChunkTitle('');
                  setChunkFact('');
                  setChunkDescription('');
                  setChunkCategory('');
                  setChunkIsPrivate(false);
                  setIsCreatingChunk(true);
                }}
                className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
              >
                <i className="fa-solid fa-plus"></i>
                <span>Wissen anlegen</span>
              </button>
            </div>

            {/* Category Tabs */}
            {publicKnowledge.length > 0 && (
              <div className="flex bg-slate-900/40 p-1.5 border border-slate-800/60 rounded-xl overflow-x-auto gap-2 text-[10px] font-bold scrollbar-none">
                {['Alle', ...new Set(publicKnowledge.map(k => k.category || 'Sonstiges'))].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setAdminSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-lg transition-all shrink-0 uppercase tracking-wider ${adminSelectedCategory === cat ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Modal/Form zum Anlegen/Editieren */}
            {(isCreatingChunk || editingChunk) && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 animate-fade-in space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-brain text-violet-500"></i>
                  <span>{editingChunk ? 'Wissenschunk bearbeiten' : 'Neuen Wissenschunk anlegen'}</span>
                </h3>
                
                {chunkError && (
                  <div className="bg-red-950/50 border border-red-500/50 text-red-200 text-xs p-3 rounded-lg flex items-center gap-2">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>{chunkError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveChunk} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">Titel / Problembeschreibung *</label>
                      <input 
                        type="text" 
                        value={chunkTitle}
                        onChange={(e) => setChunkTitle(e.target.value)}
                        placeholder="z.B. Drucker-Fehler Papierstau"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                        required
                      />
                    </div>
                    {!chunkIsPrivate && (
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Kategorie (z. B. WLAN, Hardware, Drucker, Software)</label>
                        <input 
                          type="text" 
                          value={chunkCategory}
                          onChange={(e) => setChunkCategory(e.target.value)}
                          placeholder="z.B. WLAN (Standard: Sonstiges)"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    )}
                    <div>
                      <label className="flex items-center gap-2.5 cursor-pointer py-1 select-none">
                        <input
                          type="checkbox"
                          checked={chunkIsPrivate}
                          onChange={(e) => {
                            const isPriv = e.target.checked;
                            setChunkIsPrivate(isPriv);
                            if (isPriv) setChunkCategory('Intern');
                          }}
                          className="w-4 h-4 rounded border-slate-850 bg-slate-950 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Internes Wissen (Privat)</span>
                          <span className="text-[10px] text-slate-500">Dieser Wissenseintrag wird in der öffentlichen Wissensdatenbank ausgeblendet, steht aber der KI für Chats zur Verfügung. (Kategorie: Intern)</span>
                        </div>
                      </label>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">Beschreibung & Anleitung * (Markdown möglich)</label>
                      <textarea 
                        value={chunkDescription}
                        onChange={(e) => setChunkDescription(e.target.value)}
                        placeholder="Schreibe hier die Lösung oder ausführliche Schritt-für-Schritt-Anleitung..."
                        rows="6"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                        required
                      />
                    </div>

                    {/* Dateianhänge-Verwaltung */}
                    <div className="border-t border-slate-850 pt-4 mt-2 space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] text-violet-400 font-bold uppercase tracking-wider block">Dateianhänge (PDF, DOCX, ZIP, Bilder - max. 5 MB)</label>
                        {editingChunk && (
                          <label className="bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-colors flex items-center gap-1">
                            <i className="fa-solid fa-paperclip text-violet-400"></i>
                            <span>{uploadingAttachment ? 'Lade hoch...' : 'Datei anhängen'}</span>
                            <input 
                              type="file" 
                              onChange={handleUploadAttachment} 
                              disabled={uploadingAttachment} 
                              className="hidden" 
                            />
                          </label>
                        )}
                      </div>

                      {attachmentError && (
                        <p className="text-[10px] text-red-400 font-semibold">{attachmentError}</p>
                      )}

                      {editingChunk ? (
                        editingChunk.attachments && editingChunk.attachments.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {editingChunk.attachments.map(att => (
                              <div key={att.id} className="flex justify-between items-center bg-slate-950/70 border border-slate-850 p-2.5 rounded-xl text-xs" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <i className="fa-solid fa-file text-slate-500 shrink-0"></i>
                                  <div className="flex flex-col min-w-0">
                                    <span className="truncate max-w-[150px] text-slate-250 font-medium">{att.filename}</span>
                                    <span className="text-[9px] text-slate-500">({(att.fileSize / 1024).toFixed(1)} KB)</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAttachment(att.id)}
                                  className="text-slate-500 hover:text-red-400 p-1.5 transition-colors"
                                  title="Anhang löschen"
                                >
                                  <i className="fa-solid fa-trash-can text-xs"></i>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-500 italic">Noch keine Dateianhänge hochgeladen.</p>
                        )
                      ) : (
                        <p className="text-[10px] text-slate-500 bg-slate-950/30 p-2 rounded-lg border border-dashed border-slate-850">
                          Dateianhänge können hochgeladen werden, sobald der Wissenschunk das erste Mal gespeichert wurde.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsCreatingChunk(false);
                        setEditingChunk(null);
                        setChunkTitle('');
                        setChunkFact('');
                        setChunkDescription('');
                        setChunkCategory('');
                        setChunkIsPrivate(false);
                        setChunkError('');
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2 rounded-xl transition-all"
                    >
                      Abbrechen
                    </button>
                    <button 
                      type="submit"
                      disabled={isSavingChunk}
                      className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {isSavingChunk ? (
                        <>
                          <i className="fa-solid fa-circle-notch animate-spin"></i>
                          <span>Speichert...</span>
                        </>
                      ) : (
                        <span>Speichern</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* List */}
            <div className="grid gap-4 md:grid-cols-2">
              {filteredKnowledge.map((k) => (
                <div 
                  key={k.id} 
                  onClick={() => {
                    setEditingChunk(k);
                    setChunkTitle(k.title);
                    setChunkFact(k.fact);
                    setChunkDescription(k.description || '');
                    setChunkCategory(k.category || '');
                    setChunkIsPrivate(!!k.isPrivate);
                    setIsCreatingChunk(false);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between group relative hover:border-violet-500/50 hover:bg-slate-850/30 transition-all cursor-pointer select-none animate-fade-in"
                >
                  {/* Actions */}
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChunk(k.id);
                      }}
                      className="text-slate-400 hover:text-red-500 transition-colors text-xs p-1"
                      title="Löschen"
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-violet-400 bg-violet-600/10 px-2 py-0.5 rounded-full uppercase">
                        {k.source === 'ticket' ? 'Aus Ticket' : k.source === 'url' ? 'Webseite' : k.source === 'file' ? 'Datei' : 'Manuell'}
                      </span>
                      <span className="text-[10px] font-bold text-sky-400 bg-sky-600/10 px-2 py-0.5 rounded-full uppercase">
                        {k.category || 'Sonstiges'}
                      </span>
                    </div>
                    
                    <h4 className="text-sm font-bold text-white">{k.title}</h4>
                    
                    <div className="space-y-1">
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Beschreibung / Lösung:</div>
                      <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800/40 leading-relaxed font-sans line-clamp-4 whitespace-pre-wrap">{k.description || k.fact}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* Tab 1b: Internes Wissen (Privat) */}
        {activeTab === 'private_knowledge' && (
          <div className="space-y-6">
            
            {/* Search and Add panel */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50 p-4 border border-slate-800 rounded-2xl">
              <div className="flex-1 w-full sm:max-w-md relative">
                <i className="fa-solid fa-magnifying-glass text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs"></i>
                <input 
                  type="text" 
                  value={knowledgeSearch}
                  onChange={(e) => setKnowledgeSearch(e.target.value)}
                  placeholder="Internes Wissen durchsuchen..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
              <button 
                onClick={() => {
                  setEditingChunk(null);
                  setChunkTitle('');
                  setChunkFact('');
                  setChunkDescription('');
                  setChunkCategory('');
                  setChunkIsPrivate(true);
                  setIsCreatingChunk(true);
                }}
                className="bg-violet-600 hover:bg-violet-750 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
              >
                <i className="fa-solid fa-plus"></i>
                <span>Internes Wissen anlegen</span>
              </button>
            </div>

            {/* Category Tabs */}
            {privateKnowledge.length > 0 && (
              <div className="flex bg-slate-900/40 p-1.5 border border-slate-800/60 rounded-xl overflow-x-auto gap-2 text-[10px] font-bold scrollbar-none">
                {['Alle', ...new Set(privateKnowledge.map(k => k.category || 'Sonstiges'))].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setAdminSelectedPrivateCategory(cat)}
                    className={`px-4 py-2 rounded-lg transition-all shrink-0 uppercase tracking-wider ${adminSelectedPrivateCategory === cat ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Modal/Form zum Anlegen/Editieren */}
            {(isCreatingChunk || editingChunk) && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 animate-fade-in space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-brain text-violet-500"></i>
                  <span>{editingChunk ? 'Internen Wissenschunk bearbeiten' : 'Neuen internen Wissenschunk anlegen'}</span>
                </h3>
                
                {chunkError && (
                  <div className="bg-red-950/50 border border-red-500/50 text-red-200 text-xs p-3 rounded-lg flex items-center gap-2">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>{chunkError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveChunk} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">Titel / Problembeschreibung *</label>
                      <input 
                        type="text" 
                        value={chunkTitle}
                        onChange={(e) => setChunkTitle(e.target.value)}
                        placeholder="z.B. Interner Beamer IP-Konflikt"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2.5 cursor-pointer py-1 select-none">
                        <input
                          type="checkbox"
                          checked={chunkIsPrivate}
                          onChange={(e) => {
                            setChunkIsPrivate(e.target.checked);
                            if (e.target.checked) setChunkCategory('Intern');
                          }}
                          className="w-4 h-4 rounded border-slate-855 bg-slate-955 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">Internes Wissen (Privat)</span>
                          <span className="text-[10px] text-slate-500">Dieser Wissenseintrag wird in der öffentlichen Wissensdatenbank ausgeblendet, steht aber der KI für Chats zur Verfügung. (Kategorie: Intern)</span>
                        </div>
                      </label>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">Beschreibung & Anleitung * (Markdown möglich)</label>
                      <textarea 
                        value={chunkDescription}
                        onChange={(e) => setChunkDescription(e.target.value)}
                        placeholder="Ausführliche interne Schritt-für-Schritt-Anleitung..."
                        rows="6"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                        required
                      />
                    </div>

                    {/* Dateianhänge-Verwaltung */}
                    <div className="border-t border-slate-850 pt-4 mt-2 space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] text-violet-400 font-bold uppercase tracking-wider block">Dateianhänge (PDF, DOCX, ZIP, Bilder - max. 5 MB)</label>
                        {editingChunk && (
                          <label className="bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-colors flex items-center gap-1">
                            <i className="fa-solid fa-paperclip text-violet-400"></i>
                            <span>{uploadingAttachment ? 'Lade hoch...' : 'Datei anhängen'}</span>
                            <input 
                              type="file" 
                              onChange={handleUploadAttachment} 
                              disabled={uploadingAttachment} 
                              className="hidden" 
                            />
                          </label>
                        )}
                      </div>

                      {attachmentError && (
                        <p className="text-[10px] text-red-400 font-semibold">{attachmentError}</p>
                      )}

                      {editingChunk ? (
                        editingChunk.attachments && editingChunk.attachments.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {editingChunk.attachments.map(att => (
                              <div key={att.id} className="flex justify-between items-center bg-slate-950/70 border border-slate-850 p-2.5 rounded-xl text-xs" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <i className="fa-solid fa-file text-slate-500 shrink-0"></i>
                                  <div className="flex flex-col min-w-0">
                                    <span className="truncate max-w-[150px] text-slate-250 font-medium">{att.filename}</span>
                                    <span className="text-[9px] text-slate-500">({(att.fileSize / 1024).toFixed(1)} KB)</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAttachment(att.id)}
                                  className="text-slate-500 hover:text-red-400 p-1.5 transition-colors"
                                  title="Anhang löschen"
                                >
                                  <i className="fa-solid fa-trash-can text-xs"></i>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-500 italic">Noch keine Dateianhänge hochgeladen.</p>
                        )
                      ) : (
                        <p className="text-[10px] text-slate-500 bg-slate-950/30 p-2 rounded-lg border border-dashed border-slate-850">
                          Dateianhänge können hochgeladen werden, sobald der Wissenschunk das erste Mal gespeichert wurde.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsCreatingChunk(false);
                        setEditingChunk(null);
                        setChunkTitle('');
                        setChunkFact('');
                        setChunkDescription('');
                        setChunkCategory('');
                        setChunkIsPrivate(false);
                        setChunkError('');
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2 rounded-xl transition-all"
                    >
                      Abbrechen
                    </button>
                    <button 
                      type="submit"
                      disabled={isSavingChunk}
                      className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {isSavingChunk ? (
                        <>
                          <i className="fa-solid fa-circle-notch animate-spin"></i>
                          <span>Speichert...</span>
                        </>
                      ) : (
                        <span>Speichern</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* List */}
            {filteredPrivateKnowledge.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                Keine internen Wissenschunks gefunden.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredPrivateKnowledge.map((k) => (
                  <div 
                    key={k.id} 
                    onClick={() => {
                      setEditingChunk(k);
                      setChunkTitle(k.title);
                      setChunkFact(k.fact);
                      setChunkDescription(k.description || '');
                      setChunkCategory(k.category || '');
                      setChunkIsPrivate(true);
                      setIsCreatingChunk(false);
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between group relative hover:border-violet-500/50 hover:bg-slate-850/30 transition-all cursor-pointer select-none animate-fade-in"
                  >
                    {/* Actions */}
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChunk(k.id);
                        }}
                        className="text-slate-400 hover:text-red-500 transition-colors text-xs p-1"
                        title="Löschen"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-violet-400 bg-violet-600/10 px-2 py-0.5 rounded-full uppercase">
                          {k.source === 'ticket' ? 'Aus Ticket' : k.source === 'url' ? 'Webseite' : k.source === 'file' ? 'Datei' : 'Manuell'}
                        </span>
                        <span className="text-[10px] font-bold text-sky-400 bg-sky-600/10 px-2 py-0.5 rounded-full uppercase">
                          {k.category || 'Sonstiges'}
                        </span>
                        <span className="text-[10px] font-bold text-red-400 bg-red-650/15 border border-red-500/20 px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                          <i className="fa-solid fa-user-lock text-[9px]"></i>
                          <span>Intern</span>
                        </span>
                      </div>
                      
                      <h4 className="text-sm font-bold text-white">{k.title}</h4>
                      
                      <div className="space-y-1">
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Beschreibung / Lösung:</div>
                        <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800/40 leading-relaxed font-sans line-clamp-4 whitespace-pre-wrap">{k.description || k.fact}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* Tab 2: KI-Import */}
        {activeTab === 'import' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            
            {/* Intro */}
            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl space-y-2">
              <h3 className="text-sm font-bold text-white">KI-gestützter Wissens-Import</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Gib der KI Dokumente oder Webseiten zur Analyse. Die KI extrahiert selbstständig Problem-Lösungs-Paare (Chunks) und trägt diese nach einer automatischen Duplikatsprüfung in die Wissensdatenbank ein.
              </p>
            </div>

            {/* Option A: URL Import */}
            <form onSubmit={handleImportUrl} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-2">
                <i className="fa-solid fa-link text-violet-500"></i>
                <span>Von Webseite importieren (URL)</span>
              </h4>
              
              <div className="flex gap-2">
                <input 
                  type="url" 
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://support.schule.de/faq/wlan-zugang"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                  required
                  disabled={importLoading}
                />
                <button 
                  type="submit"
                  disabled={importLoading || !importUrl.trim()}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
                >
                  {importLoading ? 'Analysiere...' : 'Analysieren'}
                </button>
              </div>
            </form>

            {/* Option B: Datei-Upload */}
            <form onSubmit={handleImportFile} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-2">
                <i className="fa-solid fa-file-invoice text-violet-500"></i>
                <span>Aus Datei importieren (Textdatei)</span>
              </h4>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <input 
                  type="file"
                  accept=".txt,.md"
                  onChange={(e) => setImportFile(e.target.files[0])}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 file:mr-4 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-violet-650 file:text-white hover:file:bg-violet-700"
                  required
                  disabled={importLoading}
                />
                <button 
                  type="submit"
                  disabled={importLoading || !importFile}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
                >
                  {importLoading ? 'Analysiere...' : 'Analysieren'}
                </button>
              </div>
            </form>

            {/* Import Result Feedback */}
            {importLoading && (
              <div className="bg-slate-900/50 p-8 border border-slate-800 rounded-2xl text-center space-y-3">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-slate-400">Das Modell (Gemini 2.5 Flash) analysiert die Daten und prüft die Datenbank auf Duplikate...</p>
              </div>
            )}

            {importResult && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 animate-fade-in">
                <h4 className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-info text-sky-400"></i>
                  <span>Import-Ergebnis</span>
                </h4>
                
                <p className="text-xs text-slate-300 font-medium bg-slate-950 p-3 rounded-lg border border-slate-850">{importResult}</p>

                {importChunksList.length > 0 && (
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase">Verarbeitete Chunks:</h5>
                    <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto pr-2">
                      {importChunksList.map((c, i) => (
                        <div key={i} className="py-2.5 flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[10px] font-bold text-white block">{c.title}</span>
                            <span className="text-[9px] text-slate-500 block truncate max-w-md mt-0.5">{c.fact}</span>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${c.isNew ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                            {c.isNew ? 'Neu' : 'Duplikat'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Tab 3: System-Einstellungen */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="space-y-6 max-w-3xl mx-auto">
            
            {settingsSuccess && (
              <div className="bg-emerald-950 border border-emerald-500 text-emerald-200 text-xs p-3 rounded-xl flex items-center gap-2">
                <i className="fa-solid fa-circle-check text-emerald-400"></i>
                <span>Einstellungen erfolgreich gespeichert!</span>
              </div>
            )}

            {settingsError && (
              <div className="bg-red-950 border border-red-500 text-red-200 text-xs p-3 rounded-xl flex items-center gap-2">
                <i className="fa-solid fa-circle-xmark text-red-400"></i>
                <span>{settingsError}</span>
              </div>
            )}

            {/* SMTP Config */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-envelope text-violet-500"></i>
                <span>E-Mail-Server (SMTP) Konfiguration</span>
              </h3>

              <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-3.5 space-y-2 text-xs text-sky-200">
                <p className="font-bold flex items-center gap-1.5"><i className="fa-solid fa-circle-info text-sky-400"></i> Wichtige Hinweise für Microsoft 365, Outlook.com & Gmail:</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px] leading-relaxed">
                  <li><strong>Port & Verbindung:</strong> Verwende in der Regel Port <strong className="text-white">587</strong> und lasse die Option <em>"Sichere Verbindung (SSL/TLS) nutzen"</em> <strong>deaktiviert</strong>. Die Mail-Bibliothek schützt die Verbindung stattdessen automatisch per <strong className="text-white">STARTTLS</strong>.</li>
                  <li><strong>Zwei-Faktor-Authentifizierung (2FA):</strong> Wenn für dein E-Mail-Konto 2FA aktiv ist, musst du zwingend ein eigenes <strong>App-Passwort</strong> in den Sicherheitseinstellungen deines Microsoft- oder Google-Kontos erstellen und dieses hier eintragen. Das normale Anmelde-Passwort wird vom Mailserver abgelehnt.</li>
                  <li><strong>SMTP-Auth aktivieren:</strong> Stelle bei Microsoft 365 sicher, dass die <em>"SMTP-Authentifizierung"</em> (SMTP AUTH) für das betreffende Postfach im Microsoft 365 Admin Center unter <em>Aktive Benutzer → [Dein Postfach] → E-Mail → E-Mail-Apps verwalten</em> explizit aktiviert ist.</li>
                </ul>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">SMTP-Host</label>
                  <input 
                    type="text" 
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Port</label>
                  <input 
                    type="number" 
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, port: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Benutzername</label>
                  <input 
                    type="text" 
                    value={smtpConfig.user}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Passwort</label>
                  <input 
                    type="password" 
                    value={smtpConfig.pass}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Absender-Adresse</label>
                  <input 
                    type="text" 
                    value={smtpConfig.sender}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, sender: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
              
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-450 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={smtpConfig.secure}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, secure: e.target.checked })}
                  className="rounded border-slate-800 text-violet-600 bg-transparent focus:ring-0 focus:ring-offset-0"
                />
                <span>Sichere Verbindung (SSL/TLS) nutzen</span>
              </label>

              <div className="border-t border-slate-800/80 pt-4 mt-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-350 flex items-center gap-2">
                  <i className="fa-solid fa-paper-plane text-violet-500"></i>
                  <span>Verbindung & E-Mail-Versand testen</span>
                </h4>
                
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-400 font-bold block mb-1">Empfänger-E-Mail für Testnachricht</label>
                    <input 
                      type="email" 
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      placeholder="z.B. admin@schule.de"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSmtp}
                    disabled={testSmtpLoading}
                    className="w-full sm:w-auto bg-slate-800 hover:bg-slate-750 text-slate-250 border border-slate-700/80 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {testSmtpLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                        <span>Testen...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-vial"></i>
                        <span>Verbindung testen</span>
                      </>
                    )}
                  </button>
                </div>

                {testSmtpResult && (
                  <div className="animate-fade-in">
                    {testSmtpResult.success ? (
                      <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
                        <div className="text-emerald-400 bg-emerald-500/10 p-1.5 rounded-lg shrink-0 mt-0.5"><i className="fa-solid fa-circle-check"></i></div>
                        <div>
                          <strong className="text-emerald-400 block mb-0.5">Erfolg!</strong>
                          <span>Die Verbindung zum SMTP-Server wurde erfolgreich hergestellt und die Test-E-Mail gesendet.</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-950/40 border border-red-500/30 text-red-200 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
                        <div className="text-red-400 bg-red-500/10 p-1.5 rounded-lg shrink-0 mt-0.5"><i className="fa-solid fa-triangle-exclamation"></i></div>
                        <div className="w-full overflow-hidden">
                          <strong className="text-red-400 block mb-0.5">Fehler beim Verbindungstest:</strong>
                          <pre className="mt-1 text-[10px] font-mono leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-900 overflow-x-auto whitespace-pre-wrap max-h-48">
                            {testSmtpResult.error}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Identity Provider Config */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-key text-violet-500"></i>
                <span>Identity Provider (IdP) & JWT</span>
              </h3>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">JWT Secret / Public Key (für Signaturprüfung)</label>
                  <input 
                    type="password" 
                    value={idpConfig.jwtSecret}
                    onChange={(e) => setIdpConfig({ ...idpConfig, jwtSecret: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">IdP Redirect Login URL</label>
                  <input 
                    type="url" 
                    value={idpConfig.redirectUrl}
                    onChange={(e) => setIdpConfig({ ...idpConfig, redirectUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Abmelden-Button Text (Alternativtext für SSO)</label>
                  <input 
                    type="text" 
                    value={idpConfig.logoutText || ''}
                    onChange={(e) => setIdpConfig({ ...idpConfig, logoutText: e.target.value })}
                    placeholder="z.B. Zurück zur MSO-Cloud"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">IdP Redirect Logout URL (nach Abmeldung)</label>
                  <input 
                    type="url" 
                    value={idpConfig.logoutRedirectUrl || ''}
                    onChange={(e) => setIdpConfig({ ...idpConfig, logoutRedirectUrl: e.target.value })}
                    placeholder="z.B. https://idp.schule.de/logout"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            </div>

            {/* Gemini Models Config */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-microchip text-violet-500"></i>
                <span>Google Gemini Konfiguration</span>
              </h3>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Google Gemini API Key</label>
                  <input 
                    type="password" 
                    value={geminiConfig.apiKey || ''}
                    onChange={(e) => setGeminiConfig({ ...geminiConfig, apiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1">Chat-Modell (z.B. gemini-3.5-flash)</label>
                    <input 
                      type="text" 
                      value={geminiConfig.chatModel || ''}
                      onChange={(e) => setGeminiConfig({ ...geminiConfig, chatModel: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1">Wissens-/Deduplizierungs-Modell (z.B. gemini-3.5-flash)</label>
                    <input 
                      type="text" 
                      value={geminiConfig.extractionModel || ''}
                      onChange={(e) => setGeminiConfig({ ...geminiConfig, extractionModel: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* GitHub Config */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <i className="fa-brands fa-github text-violet-500"></i>
                <span>GitHub Repository</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Repository URL</label>
                  <input 
                    type="url" 
                    value={githubConfig.repoUrl}
                    onChange={(e) => setGithubConfig({ ...githubConfig, repoUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Branch</label>
                  <input 
                    type="text" 
                    value={githubConfig.branch}
                    onChange={(e) => setGithubConfig({ ...githubConfig, branch: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit"
              className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs px-6 py-3 rounded-xl transition-all shadow-md float-right"
            >
              Einstellungen speichern
            </button>
          </form>
        )}

        {/* Tab 4: System-Update */}
        {activeTab === 'update' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <i className="fa-brands fa-github text-violet-500"></i>
                <span>Automatisches System-Update</span>
              </h3>
              
              <p className="text-xs text-slate-400 leading-relaxed">
                Klicke auf den Button unten, um den aktuellen Quellcode aus dem konfigurierten GitHub-Repository zu ziehen (<code>git pull</code>), eventuell geänderte Abhängigkeiten zu installieren (<code>npm install</code>), Next.js neu zu bauen (<code>npm run build</code>) und die App im PM2-Prozessmanager neu zu starten.
              </p>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-805 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500 font-bold">Repository:</span> <span className="font-mono">{githubConfig.repoUrl}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-bold">Branch:</span> <span className="font-mono">{githubConfig.branch}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-bold">Umgebung:</span> <span className="text-violet-400 font-bold uppercase tracking-wider">PM2 Linux (Production)</span></div>
              </div>

              <button 
                onClick={handleGitUpdate}
                disabled={updateLoading}
                className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {updateLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Installiere & Rebuilde...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-cloud-arrow-down"></i>
                    <span>Jetzt GitHub-Update ausführen</span>
                  </>
                )}
              </button>
            </div>

            {/* Output Logs */}
            {updateLogs && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 animate-fade-in">
                <h4 className="text-xs font-bold text-white uppercase tracking-wide">Update-Logs</h4>
                
                {updateLogs.error ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-400 font-bold">{updateLogs.error}</p>
                    <pre className="bg-slate-950 p-4 rounded-xl border border-red-950 text-[10px] text-red-300 overflow-x-auto whitespace-pre-wrap">
                      {updateLogs.details || updateLogs.stderr}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Git Pull Result:</span>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[9px] font-mono text-slate-350 overflow-x-auto whitespace-pre">
                        {updateLogs.git}
                      </pre>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">NPM Install Result:</span>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[9px] font-mono text-slate-350 overflow-x-auto whitespace-pre">
                        {updateLogs.npm}
                      </pre>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Next Build Result:</span>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[9px] font-mono text-slate-350 overflow-x-auto whitespace-pre">
                        {updateLogs.build}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Tab 1c: Gespeicherte Lösungen */}
        {activeTab === 'solutions' && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl flex justify-between items-center gap-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Gespeicherte Lösungen</h3>
                <p className="text-xs text-slate-400">Hier sind alle Problemlösungen aufgeführt, die beim Schließen von IT-Tickets erfasst wurden. Nutze die "Vergessen"-Schaltfläche, um Einträge aus der Datenbank zu entfernen.</p>
              </div>
            </div>

            {/* Suche für Lösungen */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50 p-4 border border-slate-800 rounded-2xl">
              <div className="flex-1 w-full sm:max-w-md relative">
                <i className="fa-solid fa-magnifying-glass text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs"></i>
                <input 
                  type="text" 
                  value={solutionsSearch}
                  onChange={(e) => setSolutionsSearch(e.target.value)}
                  placeholder="Lösungen durchsuchen (Betreff oder Text)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {solutionsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : solutions.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                Keine gespeicherten Ticket-Lösungen vorhanden.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {solutions
                  .filter(s => {
                    const term = solutionsSearch.toLowerCase();
                    return s.title.toLowerCase().includes(term) || s.solution.toLowerCase().includes(term) || s.id.toLowerCase().includes(term);
                  })
                  .map(sol => (
                    <div key={sol.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between group relative hover:border-violet-500/30 hover:bg-slate-850/10 transition-all select-none animate-fade-in">
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleForgetSolution(sol.id)}
                          className="bg-red-950/20 hover:bg-red-650 text-red-400 hover:text-white border border-red-500/20 font-bold text-[10px] px-2.5 py-1 rounded-xl transition-all"
                          title="Lösung vergessen (Löschen)"
                        >
                          <i className="fa-solid fa-eraser mr-1"></i>
                          <span>Vergessen</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-violet-400 bg-violet-600/10 px-2 py-0.5 rounded-full uppercase font-mono">
                            {sol.id}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            Geschlossen: {sol.updatedAt ? new Date(sol.updatedAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-white pr-16">{sol.title}</h4>

                        {sol.solutionContext ? (
                          <div className="space-y-1">
                            <div className="text-[9px] text-sky-400 font-bold uppercase tracking-wider">Problem-Kontext (KI-Zusammenfassung):</div>
                            <p className="text-xs text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800/40 leading-relaxed font-sans italic">
                              {sol.solutionContext}
                            </p>
                          </div>
                        ) : (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => handleGenerateSolutionContext(sol.id)}
                              disabled={generatingContextId === sol.id}
                              className="bg-sky-950/30 hover:bg-sky-900 border border-sky-500/20 text-sky-400 text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-40"
                            >
                              {generatingContextId === sol.id ? (
                                <>
                                  <i className="fa-solid fa-circle-notch animate-spin mr-1.5"></i>
                                  <span>Zusammenfassung wird erstellt...</span>
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i>
                                  <span>KI-Zusammenfassung generieren</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Erfasste Problemlösung:</div>
                          <p className="text-xs text-slate-350 bg-slate-950 p-3 rounded-xl border border-slate-800/40 leading-relaxed font-sans">{sol.solution}</p>
                        </div>
                        
                        <div className="text-[9px] text-slate-500">
                          Erstellt durch: <span className="font-mono text-slate-400">{sol.creatorEmail}</span>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* Tab 1c: Gespeicherte Lösungen */}
        {activeTab === 'solutions' && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl flex justify-between items-center gap-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Gespeicherte Lösungen</h3>
                <p className="text-xs text-slate-400">Hier sind alle Problemlösungen aufgeführt, die beim Schließen von IT-Tickets erfasst wurden. Nutze die "Vergessen"-Schaltfläche, um Einträge aus der Datenbank zu entfernen.</p>
              </div>
            </div>

            {/* Suche für Lösungen */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50 p-4 border border-slate-800 rounded-2xl">
              <div className="flex-1 w-full sm:max-w-md relative">
                <i className="fa-solid fa-magnifying-glass text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs"></i>
                <input 
                  type="text" 
                  value={solutionsSearch}
                  onChange={(e) => setSolutionsSearch(e.target.value)}
                  placeholder="Lösungen durchsuchen (Betreff oder Text)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {solutionsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : solutions.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                Keine gespeicherten Ticket-Lösungen vorhanden.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {solutions
                  .filter(s => {
                    const term = solutionsSearch.toLowerCase();
                    return s.title.toLowerCase().includes(term) || s.solution.toLowerCase().includes(term) || s.id.toLowerCase().includes(term);
                  })
                  .map(sol => (
                    <div key={sol.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between group relative hover:border-violet-500/30 hover:bg-slate-850/10 transition-all select-none animate-fade-in">
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleForgetSolution(sol.id)}
                          className="bg-red-950/20 hover:bg-red-650 text-red-400 hover:text-white border border-red-500/20 font-bold text-[10px] px-2.5 py-1 rounded-xl transition-all"
                          title="Lösung vergessen (Löschen)"
                        >
                          <i className="fa-solid fa-eraser mr-1"></i>
                          <span>Vergessen</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-violet-400 bg-violet-600/10 px-2 py-0.5 rounded-full uppercase font-mono">
                            {sol.id}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            Geschlossen: {sol.updatedAt ? new Date(sol.updatedAt).toLocaleDateString('de-DE') : 'Unbekannt'}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-white pr-16">{sol.title}</h4>

                        {sol.solutionContext ? (
                          <div className="space-y-1">
                            <div className="text-[9px] text-sky-400 font-bold uppercase tracking-wider">Problem-Kontext (KI-Zusammenfassung):</div>
                            <p className="text-xs text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800/40 leading-relaxed font-sans italic">
                              {sol.solutionContext}
                            </p>
                          </div>
                        ) : (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => handleGenerateSolutionContext(sol.id)}
                              disabled={generatingContextId === sol.id}
                              className="bg-sky-950/30 hover:bg-sky-900 border border-sky-500/20 text-sky-400 text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-40"
                            >
                              {generatingContextId === sol.id ? (
                                <>
                                  <i className="fa-solid fa-circle-notch animate-spin mr-1.5"></i>
                                  <span>Zusammenfassung wird erstellt...</span>
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i>
                                  <span>KI-Zusammenfassung generieren</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Erfasste Problemlösung:</div>
                          <p className="text-xs text-slate-350 bg-slate-950 p-3 rounded-xl border border-slate-800/40 leading-relaxed font-sans">{sol.solution}</p>
                        </div>
                        
                        <div className="text-[9px] text-slate-500">
                          Erstellt durch: <span className="font-mono text-slate-400">{sol.creatorEmail}</span>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* Tab 1d: Alle gespeicherten Chats */}
        {activeTab === 'chats' && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl">
              <h3 className="text-sm font-bold text-white mb-1">Zwischengespeicherte Chats durchsuchen</h3>
              <p className="text-xs text-slate-400">Hier können alle Chat-Sitzungen (inklusive Gästen, die kein Ticket erstellt haben) gesucht, eingesehen und bereinigt werden.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* Chat-Liste */}
              <div className="lg:col-span-2 space-y-4">
                <div className="relative">
                  <i className="fa-solid fa-magnifying-glass text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs"></i>
                  <input 
                    type="text" 
                    value={chatsSearch}
                    onChange={(e) => setChatsSearch(e.target.value)}
                    placeholder="Ersteller, IP, Session-ID suchen..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                  />
                </div>

                {chatsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-3 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : chatsList.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-xs">
                    Keine Chats in der Datenbank.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {chatsList
                      .filter(c => {
                        const term = chatsSearch.toLowerCase();
                        return (c.id || '').toLowerCase().includes(term) ||
                               (c.userEmail || '').toLowerCase().includes(term) ||
                               (c.userName || '').toLowerCase().includes(term) ||
                               (c.userIp || '').toLowerCase().includes(term) ||
                               (c.userSessionId || '').toLowerCase().includes(term);
                      })
                      .map(c => (
                        <div 
                          key={c.id} 
                          onClick={() => loadChatDetails(c.id)}
                          className={`p-3.5 border rounded-xl text-left cursor-pointer transition-all select-none flex flex-col gap-2 ${selectedChatDetails?.id === c.id ? 'bg-violet-650/10 border-violet-500 shadow-md' : 'bg-slate-900 border-slate-800/80 hover:border-slate-700'}`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-mono font-bold text-violet-400 bg-violet-600/10 px-2 py-0.5 rounded">
                              {c.id}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">
                              {new Date(c.createdAt).toLocaleDateString('de-DE')}
                            </span>
                          </div>
                          
                          <div className="text-xs">
                            <strong className="text-slate-200 block truncate">{c.userName || c.userEmail || 'Gast'}</strong>
                            {c.userEmail && <span className="text-[10px] text-slate-500 font-mono block truncate">{c.userEmail}</span>}
                          </div>

                          <div className="flex flex-wrap gap-1.5 items-center mt-1">
                            {c.ticketCreated === 1 && (
                              <span className="text-[8px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                Ticket erstellt
                              </span>
                            )}
                            {c.category && (
                              <span className="text-[8px] font-bold uppercase tracking-wider bg-violet-500/10 text-violet-300 border border-violet-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <i className="fa-solid fa-tag text-[7px]"></i>
                                {c.category}
                              </span>
                            )}
                            {c.isAbusive === 1 && (
                              <span className="text-[8px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">
                                Missbrauch
                              </span>
                            )}
                            {c.userIp && (
                              <span className="text-[8px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded">
                                IP: {c.userIp}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>

              {/* Chat-Details Inspektor (Desktop: In-place, Mobile: Versteckt) */}
              <div className="hidden lg:flex lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-5 min-h-[500px] flex-col justify-between">
                {chatDetailsLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : selectedChatDetails ? (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Verschmolzener Kopfinformations- & Identitätsspur-Block */}
                      <div className={`p-4 rounded-2xl border transition-all mb-4 space-y-3.5 ${
                        selectedChatDetails.isAbusive === 1
                          ? 'bg-red-950/25 border-red-500/40 shadow-lg shadow-red-950/20'
                          : 'bg-slate-950/80 border-slate-800 shadow-md'
                      }`}>
                        {/* Oberste Zeile: Meta-Tags & Nebeneinander aufgereihte Kompakt-Buttons */}
                        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800/80 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-violet-400 font-mono bg-violet-600/10 border border-violet-500/20 px-2.5 py-1 rounded-lg shadow-sm">
                              ID: {selectedChatDetails.id}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              Erstellt am: {parseUtcDate(selectedChatDetails.createdAt).toLocaleString('de-DE')} Uhr
                            </span>
                            {selectedChatIdentityTrace?.confidenceScore && (
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                selectedChatDetails.isAbusive === 1
                                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                  : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                              }`}>
                                Treffer: {selectedChatIdentityTrace.confidenceScore.toUpperCase()}
                              </span>
                            )}
                            {selectedChatDetails.isAbusive === 1 && (
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded flex items-center gap-1">
                                <i className="fa-solid fa-user-secret"></i>
                                <span>Missbrauch</span>
                              </span>
                            )}
                          </div>

                          {/* Funktions-Buttons sauber aufgereiht mit Hover-Tooltips */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* In Ticket umwandeln / Ticket öffnen */}
                            <button 
                              type="button"
                              onClick={() => handleConvertChatToTicket(selectedChatDetails)}
                              disabled={isConvertingTicket}
                              className={`font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 border shadow-sm ${
                                selectedChatDetails.ticketCreated === 1
                                  ? 'bg-violet-950/60 text-violet-300 border-violet-500/40 hover:bg-violet-600 hover:text-white'
                                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600 hover:text-white'
                              }`}
                              title={selectedChatDetails.ticketCreated === 1 ? "Zugehöriges Support-Ticket im Ticketportal öffnen" : "Diesen Chat in ein neues Support-Ticket umwandeln"}
                            >
                              <i className={`fa-solid ${selectedChatDetails.ticketCreated === 1 ? 'fa-ticket text-violet-400' : 'fa-plus-circle text-emerald-400'}`}></i>
                              <span>{selectedChatDetails.ticketCreated === 1 ? 'Ticket öffnen' : 'In Ticket umwandeln'}</span>
                            </button>

                            {/* KI-Analyse */}
                            <button 
                              type="button"
                              onClick={() => handleAnalyzeChat(selectedChatDetails.id)}
                              disabled={isAnalyzingChat}
                              className="p-2 rounded-xl bg-sky-950/50 hover:bg-sky-600 border border-sky-500/30 text-sky-400 hover:text-white transition-all shadow-sm flex items-center justify-center shrink-0 disabled:opacity-40"
                              title="KI-Qualitätsanalyse & Wissensnutzung analysieren"
                            >
                              <i className={`fa-solid ${isAnalyzingChat ? 'fa-circle-notch animate-spin' : 'fa-wand-magic-sparkles'} text-sm`}></i>
                            </button>

                            {/* Missbrauch markieren / aufheben */}
                            <button 
                              type="button"
                              onClick={() => handleToggleAbusiveChat(selectedChatDetails.id, selectedChatDetails.isAbusive === 1)}
                              className={`p-2 rounded-xl transition-all flex items-center justify-center shrink-0 border shadow-sm ${
                                selectedChatDetails.isAbusive === 1 
                                  ? 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-slate-800' 
                                  : 'bg-red-950/40 text-red-400 border-red-500/30 hover:bg-red-650 hover:text-white'
                              }`}
                              title={selectedChatDetails.isAbusive === 1 ? 'Missbrauch-Markierung aufheben' : 'Als missbräuchlich markieren'}
                            >
                              <i className={`fa-solid ${selectedChatDetails.isAbusive === 1 ? 'fa-shield-halved text-red-400' : 'fa-triangle-exclamation'} text-sm`}></i>
                            </button>

                            {/* Löschen */}
                            <button 
                              type="button"
                              onClick={() => handleDeleteChat(selectedChatDetails.id)}
                              className="p-2 rounded-xl bg-red-950/30 hover:bg-red-650 border border-red-500/20 text-red-400 hover:text-white transition-all shadow-sm flex items-center justify-center shrink-0"
                              title="Diesen Chatverlauf dauerhaft löschen"
                            >
                              <i className="fa-solid fa-trash-can text-sm"></i>
                            </button>
                          </div>
                        </div>

                        {/* Mittlere Zeile: Benutzerdaten & Identitätsspur */}
                        <div className="space-y-2.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                              <i className="fa-solid fa-user text-violet-400 text-xs"></i>
                              <span>{selectedChatDetails.userName || 'Gast'}</span>
                              {selectedChatDetails.userEmail && (
                                <span className="text-xs text-slate-350 font-mono font-medium">({selectedChatDetails.userEmail})</span>
                              )}
                            </h4>

                            {selectedChatIdentityTrace?.summary && (
                              <span className="text-[11px] text-slate-300 font-medium bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg">
                                <i className="fa-solid fa-network-wired text-sky-400 mr-1.5 text-[10px]"></i>
                                {selectedChatIdentityTrace.summary}
                              </span>
                            )}
                          </div>

                          {/* Verknüpfte Benutzerkonten / E-Mails */}
                          {selectedChatIdentityTrace?.linkedIdentities && selectedChatIdentityTrace.linkedIdentities.length > 0 && (
                            <div className="pt-1 space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Verknüpfte Benutzerkonten:</span>
                              <div className="flex flex-wrap gap-2">
                                {selectedChatIdentityTrace.linkedIdentities.map((identity, idx) => (
                                  <div key={idx} className="bg-slate-900/90 border border-slate-750 px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-2 shadow-sm">
                                    <i className="fa-solid fa-user-check text-emerald-400 text-[10px]"></i>
                                    <strong className="text-white font-semibold">{identity.name}</strong>
                                    <span className="text-slate-400 font-mono text-[10px]">({identity.email})</span>
                                    <span className="text-[9px] bg-violet-900/40 text-violet-300 px-1.5 py-0.5 rounded font-mono">
                                      {identity.role}
                                    </span>
                                    <div className="flex gap-1">
                                      {identity.matchSources?.map((source, sIdx) => (
                                        <span key={sIdx} className="text-[8px] bg-slate-950 border border-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-mono">
                                          {source}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Verknüpfte Tickets */}
                          {selectedChatIdentityTrace?.linkedTickets && selectedChatIdentityTrace.linkedTickets.length > 0 && (
                            <div className="pt-1 flex flex-wrap items-center gap-2 text-[10px]">
                              <span className="text-slate-400 font-bold uppercase tracking-wider">Verknüpfte Support-Tickets:</span>
                              {selectedChatIdentityTrace.linkedTickets.map((ticket) => (
                                <Link
                                  key={ticket.id}
                                  href={`/agent/tickets/${ticket.id}`}
                                  className="bg-slate-900 hover:bg-slate-800 border border-slate-750 text-violet-300 hover:text-white px-2.5 py-1 rounded-lg font-mono flex items-center gap-1.5 transition-all shadow-sm"
                                >
                                  <i className="fa-solid fa-ticket text-violet-400 text-[9px]"></i>
                                  <span>#{ticket.id}: {ticket.title}</span>
                                </Link>
                              ))}
                            </div>
                          )}

                          {/* IP & Session ID */}
                          <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 font-mono">
                            {selectedChatDetails.userIp && (
                              <div>IP-Adresse: <strong className="text-white">{selectedChatDetails.userIp}</strong></div>
                            )}
                            {selectedChatDetails.userSessionId && (
                              <div>Browser Session-ID: <strong className="text-white">{selectedChatDetails.userSessionId}</strong></div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Analyse-Ergebnis (falls vorhanden) */}
                      {chatAnalysis && (
                        <div className="mb-5 p-4 bg-sky-950/20 border border-sky-500/30 rounded-xl text-xs text-slate-200 space-y-2 animate-fade-in">
                          <div className="flex justify-between items-center border-b border-sky-500/20 pb-2">
                            <span className="font-bold text-sky-400 flex items-center gap-1.5">
                              <i className="fa-solid fa-wand-magic-sparkles"></i>
                              <span>KI-Chat-Qualitätsanalyse:</span>
                            </span>
                            <button 
                              onClick={() => setChatAnalysis(null)} 
                              className="text-slate-400 hover:text-white text-xs"
                            >
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          </div>
                          <div 
                            className="markdown-content text-xs text-slate-300 leading-relaxed max-h-64 overflow-y-auto pr-1"
                            dangerouslySetInnerHTML={{ __html: safeParseMarkdown(chatAnalysis) }}
                          />
                        </div>
                      )}

                      {/* Verlauf */}
                      <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 border-l border-slate-800 pl-4 py-1">
                        {selectedChatMessages.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">Keine Nachrichten in diesem Chat vorhanden.</p>
                        ) : (
                          selectedChatMessages.map(msg => {
                            const isUser = msg.sender === 'user';
                            return (
                              <div key={msg.id} className="space-y-1">
                                <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
                                  <span className={isUser ? 'text-sky-400' : 'text-violet-400'}>
                                    {isUser ? (selectedChatDetails.userName || 'Benutzer') : 'IT-Support-Bot'}
                                  </span>
                                  <span className="text-slate-600 font-normal">
                                    {parseUtcDate(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                                  </span>
                                  {msg.baseKnowledge && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1 w-full">
                                      <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                        <i className="fa-solid fa-brain text-violet-400"></i>
                                        <span>Herangezogene Wissens-Chunks:</span>
                                      </span>
                                      {msg.baseKnowledge.split(',').map((chunkId, cIdx) => {
                                        const cleanId = chunkId.trim();
                                        if (!cleanId) return null;
                                        const found = knowledge.find(k => String(k.id) === cleanId || String(k.id) === `chunk-${cleanId}`);
                                        return (
                                          <button
                                            key={cIdx}
                                            type="button"
                                            onClick={() => handleOpenChunkInEditorById(cleanId)}
                                            className="bg-violet-950/60 hover:bg-violet-600 border border-violet-500/40 hover:border-violet-400 text-violet-300 hover:text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                                            title="Klicken, um diesen Wissenschunk in der Wissensdatenbank zu bearbeiten"
                                          >
                                            <i className="fa-solid fa-arrow-up-right-from-square text-[8px]"></i>
                                            <span>{found ? found.title : cleanId}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                
                                {msg.imageUrl && (
                                  <div className="max-w-[200px] mb-1">
                                    <img 
                                      src={getCleanImageUrl(msg.imageUrl)} 
                                      alt="Anhang" 
                                      onClick={() => window.open(getCleanImageUrl(msg.imageUrl), '_blank')}
                                      className="rounded-xl border border-slate-800 max-h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                                    />
                                  </div>
                                )}

                                <p className="text-xs text-slate-300 bg-slate-950/40 p-2 rounded-xl border border-slate-850/30 whitespace-pre-wrap leading-relaxed">
                                  {msg.text}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-20 text-slate-500">
                    <i className="fa-solid fa-comments text-4xl text-slate-700 mb-3"></i>
                    <p className="text-xs">Wähle links einen Chat aus der Liste aus, um den Verlauf einzusehen.</p>
                  </div>
                )}
              </div>

            </div>

            {/* Mobile Modal Inspector (Nur auf kleinen Bildschirmen < lg) */}
            {showMobileChatModal && (
              <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-center animate-fade-in">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg h-full max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex flex-col shadow-2xl overflow-hidden relative">
                  
                  {/* Modal Header */}
                  <div className="flex justify-between items-start p-4 border-b border-slate-800 bg-slate-950/40">
                    <div>
                      {selectedChatDetails ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-violet-400 font-mono bg-violet-600/10 px-2 py-0.5 rounded">
                              ID: {selectedChatDetails.id}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <i className="fa-solid fa-user text-slate-500 text-xs"></i>
                            <span>{selectedChatDetails.userName || 'Gast'}</span>
                          </h4>
                          {selectedChatDetails.userEmail && <span className="text-[11px] text-slate-400 font-mono block">{selectedChatDetails.userEmail}</span>}
                        </>
                      ) : (
                        <h4 className="text-sm font-bold text-white">Chat-Details</h4>
                      )}
                    </div>

                    <button 
                      onClick={() => setShowMobileChatModal(false)}
                      className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700 transition-colors"
                      title="Schließen"
                    >
                      <i className="fa-solid fa-xmark text-base"></i>
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-4 overflow-y-auto flex-1 space-y-4">
                    {chatDetailsLoading ? (
                      <div className="flex justify-center items-center py-12">
                        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : selectedChatDetails ? (
                      <div className="space-y-4">
                        {/* Verschmolzener Kopfinformations- & Identitätsspur-Block für Mobile */}
                        <div className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                          selectedChatDetails.isAbusive === 1
                            ? 'bg-red-950/25 border-red-500/40'
                            : 'bg-slate-950/80 border-slate-800'
                        }`}>
                          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800 pb-2">
                            <span className="text-[10px] font-bold text-violet-400 font-mono bg-violet-600/10 px-2 py-0.5 rounded">
                              ID: {selectedChatDetails.id}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {parseUtcDate(selectedChatDetails.createdAt).toLocaleString('de-DE')} Uhr
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <i className="fa-solid fa-user text-slate-400 text-xs"></i>
                              <span>{selectedChatDetails.userName || 'Gast'}</span>
                              {selectedChatDetails.userEmail && <span className="text-[10px] text-slate-400 font-mono">({selectedChatDetails.userEmail})</span>}
                            </div>
                            {selectedChatIdentityTrace?.summary && (
                              <p className="text-[10px] text-slate-300 bg-slate-900 border border-slate-800 p-2 rounded-lg leading-relaxed">
                                <i className="fa-solid fa-network-wired text-sky-400 mr-1 text-[9px]"></i>
                                {selectedChatIdentityTrace.summary}
                              </p>
                            )}
                          </div>

                          {/* IP & Session Info */}
                          <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-800 text-[10px] text-slate-400 font-mono">
                            {selectedChatDetails.userIp && <div>IP: <strong className="text-white">{selectedChatDetails.userIp}</strong></div>}
                            {selectedChatDetails.userSessionId && <div>Session: <strong className="text-white">{selectedChatDetails.userSessionId}</strong></div>}
                          </div>
                        </div>

                        {/* Analyse-Ergebnis (falls vorhanden) */}
                        {chatAnalysis && (
                          <div className="p-3.5 bg-sky-950/20 border border-sky-500/30 rounded-xl text-xs text-slate-200 space-y-2 animate-fade-in">
                            <div className="flex justify-between items-center border-b border-sky-500/20 pb-1.5">
                              <span className="font-bold text-sky-400 flex items-center gap-1.5">
                                <i className="fa-solid fa-wand-magic-sparkles"></i>
                                <span>Analyse-Bericht:</span>
                              </span>
                              <button onClick={() => setChatAnalysis(null)} className="text-slate-400 hover:text-white text-xs">
                                <i className="fa-solid fa-xmark"></i>
                              </button>
                            </div>
                            <div 
                              className="markdown-content text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto pr-1"
                              dangerouslySetInnerHTML={{ __html: safeParseMarkdown(chatAnalysis) }}
                            />
                          </div>
                        )}

                        {/* Verlauf */}
                        <div className="space-y-3 border-l border-slate-800 pl-3 py-1">
                          {selectedChatMessages.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">Keine Nachrichten vorhanden.</p>
                          ) : (
                            selectedChatMessages.map(msg => {
                              const isUser = msg.sender === 'user';
                              return (
                                <div key={msg.id} className="space-y-1">
                                  <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
                                    <span className={isUser ? 'text-sky-400' : 'text-violet-400'}>
                                      {isUser ? (selectedChatDetails.userName || 'Benutzer') : 'IT-Support-Bot'}
                                    </span>
                                    <span className="text-slate-600 font-normal">
                                      {parseUtcDate(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                                    </span>
                                    {msg.baseKnowledge && (
                                       <div className="flex flex-wrap items-center gap-1.5 mt-1 w-full">
                                         <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                           <i className="fa-solid fa-brain text-violet-400"></i>
                                           <span>Herangezogene Wissens-Chunks:</span>
                                         </span>
                                         {msg.baseKnowledge.split(',').map((chunkId, cIdx) => {
                                           const cleanId = chunkId.trim();
                                           if (!cleanId) return null;
                                           const found = knowledge.find(k => String(k.id) === cleanId || String(k.id) === `chunk-${cleanId}`);
                                           return (
                                             <button
                                               key={cIdx}
                                               type="button"
                                               onClick={() => handleOpenChunkInEditorById(cleanId)}
                                               className="bg-violet-950/60 hover:bg-violet-600 border border-violet-500/40 hover:border-violet-400 text-violet-300 hover:text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                                               title="Klicken, um diesen Wissenschunk in der Wissensdatenbank zu bearbeiten"
                                             >
                                               <i className="fa-solid fa-arrow-up-right-from-square text-[8px]"></i>
                                               <span>{found ? found.title : cleanId}</span>
                                             </button>
                                           );
                                         })}
                                       </div>
                                     )}
                                  </div>
                                  
                                  {msg.imageUrl && (
                                    <div className="max-w-[200px] mb-1">
                                      <img 
                                        src={getCleanImageUrl(msg.imageUrl)} 
                                        alt="Anhang" 
                                        onClick={() => window.open(getCleanImageUrl(msg.imageUrl), '_blank')}
                                        className="rounded-xl border border-slate-800 max-h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                                      />
                                    </div>
                                  )}

                                  <p className="text-xs text-slate-300 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/30 whitespace-pre-wrap leading-relaxed">
                                    {msg.text}
                                  </p>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Modal Footer (Aufreihen ohne redundanten Schließen-Button) */}
                  {selectedChatDetails && (
                    <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                      <div className="flex items-center gap-2 w-full">
                        {/* Ticket erstellen / öffnen mit Text */}
                        <button 
                          type="button"
                          onClick={() => {
                            setShowMobileChatModal(false);
                            handleConvertChatToTicket(selectedChatDetails);
                          }}
                          disabled={isConvertingTicket}
                          className={`font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 border shadow-sm flex-1 justify-center ${
                            selectedChatDetails.ticketCreated === 1
                              ? 'bg-violet-950/60 text-violet-300 border-violet-500/40'
                              : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          }`}
                          title={selectedChatDetails.ticketCreated === 1 ? "Support-Ticket öffnen" : "In Ticket umwandeln"}
                        >
                          <i className={`fa-solid ${selectedChatDetails.ticketCreated === 1 ? 'fa-ticket text-violet-400' : 'fa-plus-circle text-emerald-400'}`}></i>
                          <span>{selectedChatDetails.ticketCreated === 1 ? 'Ticket öffnen' : 'Ticket erstellen'}</span>
                        </button>

                        {/* Analysieren mit Text */}
                        <button 
                          type="button"
                          onClick={() => handleAnalyzeChat(selectedChatDetails.id)}
                          disabled={isAnalyzingChat}
                          className="bg-sky-950/50 hover:bg-sky-900 border border-sky-500/30 text-sky-400 hover:text-white font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-40"
                          title="KI-Qualitätsanalyse durchführen"
                        >
                          {isAnalyzingChat ? (
                            <i className="fa-solid fa-circle-notch animate-spin"></i>
                          ) : (
                            <i className="fa-solid fa-wand-magic-sparkles"></i>
                          )}
                          <span>Analysieren</span>
                        </button>

                        {/* Missbrauch markieren (nur Symbol) */}
                        <button 
                          type="button"
                          onClick={() => handleToggleAbusiveChat(selectedChatDetails.id, selectedChatDetails.isAbusive === 1)}
                          className={`font-bold text-xs p-2.5 rounded-xl transition-all flex items-center justify-center shrink-0 border ${
                            selectedChatDetails.isAbusive === 1 
                              ? 'bg-red-500/20 text-red-300 border-red-500/40' 
                              : 'bg-red-950/40 text-red-400 border-red-500/30'
                          }`}
                          title={selectedChatDetails.isAbusive === 1 ? 'Missbrauch-Markierung aufheben' : 'Als missbräuchlich markieren'}
                        >
                          <i className={`fa-solid ${selectedChatDetails.isAbusive === 1 ? 'fa-shield-halved text-red-400' : 'fa-triangle-exclamation'} text-sm`}></i>
                        </button>

                        {/* Löschen (nur Symbol) */}
                        <button 
                          type="button"
                          onClick={() => handleDeleteChat(selectedChatDetails.id)}
                          className="bg-red-950/30 hover:bg-red-650 text-red-400 hover:text-white border border-red-500/20 font-bold text-xs p-2.5 rounded-xl transition-all flex items-center justify-center shrink-0"
                          title="Chat löschen"
                        >
                          <i className="fa-solid fa-trash-can text-sm"></i>
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Benutzerverwaltung */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl">
              <h3 className="text-sm font-bold text-white mb-1">System-Benutzerverwaltung</h3>
              <p className="text-xs text-slate-400">Verwalte die Rollen und Berechtigungen aller im System registrierten Benutzer.</p>
            </div>

            {usersError && (
              <div className="bg-red-950/50 border border-red-500/50 text-red-200 text-xs p-3 rounded-xl flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>{usersError}</span>
              </div>
            )}

            {/* Search Input for Users */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50 p-4 border border-slate-800 rounded-2xl">
              <div className="flex-1 w-full sm:max-w-md relative">
                <i className="fa-solid fa-magnifying-glass text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs"></i>
                <input 
                  type="text" 
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Benutzer nach Name oder E-Mail suchen..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {usersLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredUsersList.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                Keine passenden Benutzer gefunden.
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg border-slate-800/60">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950/50 text-slate-400 text-xs font-bold uppercase border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">E-Mail</th>
                        <th className="px-6 py-4">Rolle</th>
                        <th className="px-6 py-4">Zuständigkeiten (Prosa)</th>
                        <th className="px-6 py-4">Registriert</th>
                        <th className="px-6 py-4 text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredUsersList.map((usr) => (
                        <tr key={usr.id} className="hover:bg-slate-850/40 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {usr.avatarUrl ? (
                                <img src={usr.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover border border-slate-850" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-slate-850 flex items-center justify-center border border-slate-800 text-[10px] text-slate-400">
                                  <i className="fa-solid fa-user"></i>
                                </div>
                              )}
                              <span className="font-bold text-white text-xs">{usr.name || 'Nicht eingerichtet'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-mono">{usr.email}</td>
                          <td className="px-6 py-4">
                            <select
                               value={usr.role}
                               onChange={(e) => handleUpdateRole(usr.id, e.target.value)}
                               disabled={usr.id === user.id}
                               className="bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-violet-500 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <option value="customer">Kunde (Customer)</option>
                              <option value="agent">Support-Agent (Agent)</option>
                              <option value="admin">System-Administrator (Admin)</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 min-w-[220px]">
                            {usr.role !== 'customer' ? (
                              <textarea
                                value={usr.responsibilities || ''}
                                onChange={(e) => handleUpdateResponsibilitiesState(usr.id, e.target.value)}
                                onBlur={() => handleSaveResponsibilities(usr.id, usr.responsibilities)}
                                placeholder="z. B. Beamer, Netzwerk, Moodle..."
                                rows="2"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 placeholder-slate-650 resize-y"
                              />
                            ) : (
                              <span className="text-slate-600 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            {new Date(usr.createdAt).toLocaleDateString('de-DE')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteUser(usr.id)}
                              disabled={usr.id === user.id}
                              className="bg-red-950/20 hover:bg-red-650 text-red-400 hover:text-white border border-red-500/20 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Löschen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 5b: Statistiken */}
        {activeTab === 'statistics' && (
          <div className="space-y-6">
            {/* Bot-Konversationen & Themen-Kategorien Statistik */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <i className="fa-solid fa-robot text-violet-400"></i>
                    <span>Bot-Konversationen & Themen-Kategorien</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Automatische KI-Kategorisierung aller Support-Chats (läuft im Hintergrund zusätzlich alle 5 Minuten als Cronjob).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCategorizeAllChats}
                  disabled={categorizingBotChats || !botStatistics || botStatistics.uncategorizedCount === 0}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  {categorizingBotChats ? (
                    <>
                      <i className="fa-solid fa-circle-notch animate-spin"></i>
                      <span>Kategorisiere Chats...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-wand-magic-sparkles"></i>
                      <span>Alle bisherigen Chats jetzt einkategorisieren</span>
                    </>
                  )}
                </button>
              </div>

              {categorizingBotChats && (
                <div className="bg-slate-950 border border-violet-500/40 p-4 rounded-xl space-y-3 animate-fade-in">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-violet-400 flex items-center gap-2">
                      <i className="fa-solid fa-bolt text-amber-400 animate-bounce"></i>
                      <span>Highspeed-Parallel-Kategorisierung läuft...</span>
                    </span>
                    <span className="text-slate-400 font-mono text-[10px]">30 Chats / KI-Prompt (Parallel-Batches)</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-850">
                    <div className="bg-gradient-to-r from-violet-600 via-sky-500 to-emerald-400 h-2.5 rounded-full animate-pulse w-full"></div>
                  </div>
                </div>
              )}

              {categorizingResultMsg && !categorizingBotChats && (
                <div className="bg-violet-950/40 border border-violet-500/30 text-violet-200 text-xs p-3.5 rounded-xl flex items-center gap-2 animate-fade-in font-medium">
                  <i className="fa-solid fa-circle-check text-violet-400"></i>
                  <span>{categorizingResultMsg}</span>
                </div>
              )}

              {botStatistics ? (
                <div className="space-y-6">
                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex items-center gap-3">
                      <div className="p-3 bg-violet-600/10 text-violet-400 border border-violet-500/20 rounded-xl text-lg">
                        <i className="fa-solid fa-comments"></i>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Gesamt Bot-Chats</div>
                        <div className="text-xl font-bold text-white mt-0.5">{botStatistics.totalChats}</div>
                      </div>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex items-center gap-3">
                      <div className="p-3 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-lg">
                        <i className="fa-solid fa-tags"></i>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Kategorisiert</div>
                        <div className="text-xl font-bold text-emerald-400 mt-0.5">
                          {botStatistics.categorizedCount} <span className="text-xs text-slate-500 font-normal">({botStatistics.totalChats > 0 ? ((botStatistics.categorizedCount / botStatistics.totalChats) * 100).toFixed(0) : 0}%)</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex items-center gap-3">
                      <div className="p-3 bg-amber-600/10 text-amber-400 border border-amber-500/20 rounded-xl text-lg">
                        <i className="fa-solid fa-clock"></i>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Unkategorisiert</div>
                        <div className="text-xl font-bold text-amber-400 mt-0.5">{botStatistics.uncategorizedCount}</div>
                      </div>
                    </div>
                  </div>

                  {/* Interaktives Donut-Diagramm & Legend-Cards */}
                  <div>
                    {botStatistics.categoryBreakdown && botStatistics.categoryBreakdown.length > 0 ? (
                      <BotCategoryDonutChart 
                        breakdown={botStatistics.categoryBreakdown} 
                        totalChats={botStatistics.totalChats} 
                      />
                    ) : (
                      <p className="text-xs text-slate-500 italic bg-slate-950/30 p-4 rounded-xl border border-slate-850">
                        Noch keine kategorisierten Chats vorhanden. Klicke oben auf "Alle bisherigen Chats jetzt einkategorisieren".
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl">
              <h3 className="text-sm font-bold text-white mb-1">Mitarbeiter-Statistiken (Tickets pro Agent / Admin)</h3>
              <p className="text-xs text-slate-400">Übersicht der Ticketbearbeitungen. Die Durchschnittswerte basieren auf den erledigten Support-Anfragen der jeweiligen Zeiträume.</p>
            </div>

            {statisticsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : statistics.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                Keine Statistiken verfügbar.
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                        <th className="px-6 py-4">Mitarbeiter</th>
                        <th className="px-6 py-4">Rolle</th>
                        <th className="px-6 py-4 text-center">Aktive Tickets</th>
                        <th className="px-6 py-4 text-center">Ø pro Tag</th>
                        <th className="px-6 py-4 text-center">Ø pro Woche</th>
                        <th className="px-6 py-4 text-center">Ø pro Monat</th>
                        <th className="px-6 py-4 text-center">Gesamt (Jahr)</th>
                        <th className="px-6 py-4 text-center">Gesamt (All-Time)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {statistics.map(stat => (
                        <tr key={stat.agentId} className="hover:bg-slate-850/20 transition-colors text-xs text-slate-200">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-white">{stat.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5">{stat.email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${stat.role === 'admin' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'}`}>
                              {stat.role === 'admin' ? 'Admin' : 'Agent'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-amber-400">
                            {stat.openCount}
                          </td>
                          <td className="px-6 py-4 text-center font-mono">
                            {stat.ticketsDayAvg}
                          </td>
                          <td className="px-6 py-4 text-center font-mono">
                            {stat.ticketsWeekAvg}
                          </td>
                          <td className="px-6 py-4 text-center font-mono">
                            {stat.ticketsMonthAvg}
                          </td>
                          <td className="px-6 py-4 text-center font-semibold text-sky-400">
                            {stat.ticketsYearTotal}
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-white">
                            {stat.totalClosed}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 6: Geflaggte Antworten */}
        {activeTab === 'flagged' && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl">
              <h3 className="text-sm font-bold text-white mb-1">Geflaggte Bot-Antworten</h3>
              <p className="text-xs text-slate-400">Hier werden fehlerhafte oder verdächtige Bot-Antworten gesammelt, die Kunden im Chat als "komisch" oder "falsch" gemeldet haben.</p>
            </div>

            {isFlaggedLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : flaggedMessages.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                Keine geflaggten Antworten zur Prüfung vorhanden.
              </div>
            ) : (
              <div className="space-y-4">
                {flaggedMessages.map((msg) => (
                  <div key={msg.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col">
                    {/* Header */}
                    <div className="bg-slate-950/60 px-5 py-3 border-b border-slate-850 flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-mono bg-violet-500/10 border border-violet-500/20 text-violet-400 font-bold px-2 py-0.5 rounded">
                          {msg.chatId}
                        </span>
                        <span className="text-slate-400">
                          Gemeldet: <strong className="text-slate-200">{parseUtcDate(msg.flaggedAt).toLocaleString('de-DE')} Uhr</strong>
                        </span>
                        {msg.userEmail && (
                          <span className="text-slate-400">
                            Benutzer: <strong className="text-slate-200">{msg.userEmail}</strong>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAnalyzeChat(msg.chatId)}
                          disabled={isAnalyzingChat}
                          className="bg-sky-950/40 hover:bg-sky-900 border border-sky-500/30 text-sky-400 hover:text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-40"
                        >
                          <i className="fa-solid fa-wand-magic-sparkles text-sky-400"></i>
                          <span>Qualitätsanalyse per KI</span>
                        </button>
                        <button
                          onClick={() => handleResolveFlagged(msg.id)}
                          className="bg-violet-950/20 hover:bg-violet-800 text-violet-400 hover:text-white border border-violet-500/20 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all"
                        >
                          <i className="fa-solid fa-circle-check mr-1.5"></i>
                          Freigeben (Meldung löschen)
                        </button>
                      </div>
                    </div>

                    {msg.flaggedReason && (
                      <div className="mx-5 mt-4 p-3.5 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-200 shadow-inner flex items-start gap-2.5">
                        <div className="text-red-500 bg-red-500/10 p-1.5 rounded-lg shrink-0 mt-0.5"><i className="fa-solid fa-triangle-exclamation"></i></div>
                        <div>
                          <strong className="text-red-400 block mb-0.5">Nutzer-Begründung:</strong>
                          <span className="leading-relaxed">{msg.flaggedReason}</span>
                        </div>
                      </div>
                    )}

                    {msg.resolvedKnowledge && msg.resolvedKnowledge.length > 0 && (
                      <div className="mx-5 mt-4 p-3.5 bg-violet-950/20 border border-violet-500/20 rounded-xl text-xs text-violet-200 shadow-inner flex items-start gap-2.5">
                        <div className="text-violet-400 bg-violet-500/10 p-1.5 rounded-lg shrink-0 mt-0.5"><i className="fa-solid fa-brain"></i></div>
                        <div>
                          <strong className="text-violet-400 block mb-1">Verwendete Wissensbasis für diese Antwort:</strong>
                          <div className="space-y-2">
                            {msg.resolvedKnowledge.map(k => (
                              <div key={k.id} className="border-l-2 border-violet-500/40 pl-2">
                                <span className="font-bold text-white block">{k.title}</span>
                                <span className="text-[10px] text-slate-400 font-mono">({k.id}) — {k.fact}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Chatverlauf Context */}
                    <div className="p-5 space-y-4 bg-slate-900/25">
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Chat-Kontext (die letzten 5 Nachrichten):</p>
                      <div className="space-y-3 max-w-3xl border-l-2 border-slate-800 pl-4 py-1">
                        {msg.context.map((ctxMsg, ctxIdx) => {
                          const isUser = ctxMsg.sender === 'user';
                          const isTarget = ctxIdx === msg.context.length - 1; // Die gemeldete Nachricht ist immer die letzte im Kontext
                          
                          return (
                            <div key={ctxIdx} className={`space-y-1 ${isTarget ? 'bg-red-500/5 border border-red-500/25 p-3 rounded-xl' : ''}`}>
                              <div className="flex items-center gap-2 text-[10px] font-bold">
                                <span className={isUser ? 'text-sky-400' : 'text-violet-400'}>
                                  {isUser ? 'Benutzer' : 'IT-Helpdesk-Bot'}
                                </span>
                                <span className="text-slate-600 font-normal">
                                  {parseUtcDate(ctxMsg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                                </span>
                                {isTarget && (
                                  <span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded font-mono font-bold tracking-wider uppercase scale-90">
                                    Gemeldete Antwort
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-350 whitespace-pre-wrap leading-relaxed">
                                {ctxMsg.text}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 7: Missbrauchsmeldungen */}
        {activeTab === 'abusive' && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl">
              <h3 className="text-sm font-bold text-white mb-1">Missbrauchsmeldungen (Chat-Sperren / Beleidigungen)</h3>
              <p className="text-xs text-slate-400">Hier werden Konversationen gelistet, bei denen der KI-Bot beleidigendes, unangemessenes oder schikanöses Verhalten des Nutzers erkannt hat.</p>
            </div>

            {isAbusiveLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : abusiveChats.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                Keine Missbrauchsmeldungen vorhanden.
              </div>
            ) : (
              <div className="space-y-4">
                {abusiveChats.map((chat) => (
                  <div key={chat.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col">
                    {/* Header */}
                    <div className="bg-slate-950/60 px-5 py-3 border-b border-slate-850 flex flex-col gap-2">
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <span className="font-mono bg-red-500/10 border border-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded">
                            {chat.id}
                          </span>
                          <span className="text-slate-400">
                            Erkannt: <strong className="text-slate-200">{parseUtcDate(chat.flaggedAt).toLocaleString('de-DE')} Uhr</strong>
                          </span>
                          <span className="text-slate-400">
                            Nutzer-Name: <strong className="text-white">{chat.userName || 'Gast'}</strong>
                          </span>
                          <span className="text-slate-400">
                            Nutzer-E-Mail: <strong className="text-white">{chat.userEmail || 'Keine (nicht angemeldet)'}</strong>
                          </span>
                          {chat.userIp && (
                            <span className="text-slate-400">
                              IP: <strong className="text-slate-200 font-mono">{chat.userIp}</strong>
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleResolveAbusive(chat.id)}
                          className="bg-slate-950/20 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800/80 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all"
                        >
                          <i className="fa-solid fa-circle-check mr-1.5 text-emerald-500"></i>
                          Als gelöst markieren (Meldung löschen)
                        </button>
                      </div>

                      {/* IP und Session-ID Infos + rekonstruierte Anmeldungen */}
                      <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-850/60 text-[10px] text-slate-500">
                        {chat.userSessionId && (
                          <div>
                            Sitzungs-ID: <span className="font-mono text-slate-400">{chat.userSessionId}</span>
                          </div>
                        )}
                        {chat.identityTrace ? (
                          <div className="bg-red-950/45 border border-red-900/40 text-red-200 p-3 rounded-xl flex flex-col gap-2 animate-fade-in mt-1">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <i className="fa-solid fa-mask text-[14px] text-red-400"></i>
                                <strong className="text-red-400 font-bold text-xs">Identitäts-Spur rekonstruiert:</strong>
                              </div>
                              {chat.identityTrace.confidenceScore && (
                                <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                  chat.identityTrace.confidenceScore === 'high' ? 'bg-red-500/20 text-red-300 border-red-500/40' :
                                  chat.identityTrace.confidenceScore === 'medium' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                                  'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                  Treffer: {chat.identityTrace.confidenceScore.toUpperCase()}
                                </span>
                              )}
                            </div>
                            
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              {chat.identityTrace.summary}
                            </p>

                            {chat.identityTrace.linkedIdentities && chat.identityTrace.linkedIdentities.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-0.5">
                                {chat.identityTrace.linkedIdentities.map((identity, idIdx) => (
                                  <span key={idIdx} className="bg-red-900/40 border border-red-500/30 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white flex items-center gap-1.5">
                                    <i className="fa-solid fa-user text-[9px] text-red-300"></i>
                                    <span>{identity.name} ({identity.email})</span>
                                    <span className="text-[8px] bg-red-950/60 px-1 py-0.2 rounded font-mono text-red-200">{identity.role}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            {chat.identityTrace.linkedTickets && chat.identityTrace.linkedTickets.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1 pt-1 border-t border-red-900/30">
                                <span className="text-[9px] text-slate-400 font-bold">Tickets:</span>
                                {chat.identityTrace.linkedTickets.map((t) => (
                                  <span key={t.id} className="text-[9px] text-slate-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded">
                                    #{t.id}: {t.title}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : chat.linkedIdentities && chat.linkedIdentities.length > 0 ? (
                          <div className="bg-red-950/45 border border-red-900/40 text-red-200 p-2.5 rounded-xl flex items-start gap-2 animate-fade-in mt-1">
                            <i className="fa-solid fa-mask text-[12px] text-red-400 mt-0.5"></i>
                            <div>
                              <strong className="text-red-400 block font-bold">Identitäts-Spur rekonstruiert:</strong>
                              <span className="leading-relaxed">
                                Über dieselbe Browser-Sitzung wurden früher folgende Anmeldungen vorgenommen:
                              </span>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {chat.linkedIdentities.map((identity, idIdx) => (
                                  <span key={idIdx} className="bg-red-900/40 border border-red-500/20 px-2 py-0.5 rounded text-[9px] font-semibold text-white">
                                    {identity.name ? `${identity.name} (${identity.email})` : identity.email}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Chatverlauf Context */}
                    <div className="p-5 space-y-4 bg-slate-900/25">
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Vollständiger Chatverlauf:</p>
                      <div className="space-y-3 max-w-3xl border-l-2 border-red-500/20 pl-4 py-1">
                        {chat.messages.map((ctxMsg, ctxIdx) => {
                          const isUser = ctxMsg.sender === 'user';
                          
                          return (
                            <div key={ctxIdx} className="space-y-1">
                              <div className="flex items-center gap-2 text-[10px] font-bold">
                                <span className={isUser ? 'text-sky-400' : 'text-violet-400'}>
                                  {isUser ? (chat.userName || 'Benutzer') : 'IT-Helpdesk-Bot'}
                                </span>
                                <span className="text-slate-600 font-normal">
                                  {parseUtcDate(ctxMsg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                                </span>
                              </div>
                              <p className="text-xs text-slate-350 whitespace-pre-wrap leading-relaxed">
                                {ctxMsg.text}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* KI-Qualitätsanalyse Modal Overlay */}
      {qualityAnalysisModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-center animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl h-full max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-wand-magic-sparkles text-sky-400 text-base"></i>
                <h4 className="text-sm font-bold text-white">KI-Qualitätsanalyse ({qualityAnalysisModal.chatId})</h4>
              </div>
              <button 
                onClick={() => setQualityAnalysisModal(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700 transition-colors"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {qualityAnalysisModal.loading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-sky-300 font-medium">Analysiere Chatverlauf & Wissensnutzung mit Gemini KI...</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div 
                    className="markdown-content text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-850"
                    dangerouslySetInnerHTML={{ __html: safeParseMarkdown(qualityAnalysisModal?.report || 'Keine Ergebnisse.') }}
                  />

                  {/* Vorgeschlagenes Wissen / Nachtragen Button */}
                  <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h5 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <i className="fa-solid fa-lightbulb"></i>
                          <span>Fehlendes Wissen als internes Wissen nachtragen</span>
                        </h5>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {qualityAnalysisModal.suggestedKnowledge 
                            ? `KI-Vorschlag: "${qualityAnalysisModal.suggestedKnowledge.title}" (${qualityAnalysisModal.suggestedKnowledge.category})`
                            : "Trage neues oder fehlendes Wissen direkt als internes Wissen in die Wissensdatenbank nach."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddSuggestedKnowledge(qualityAnalysisModal.suggestedKnowledge)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shrink-0"
                      >
                        <i className="fa-solid fa-plus"></i>
                        <span>Als internes Wissen nachtragen</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setQualityAnalysisModal(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-5 py-2 rounded-xl transition-all"
              >
                Schließen
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

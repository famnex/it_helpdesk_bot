'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marked } from 'marked';
import { renderMarkdownWithLinks, getDateDividerLabel, isDifferentDay, parseUtcDate } from '@/lib/formatting';
import UserNavMenu from '@/components/UserNavMenu';

const safeParseMarkdown = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return renderMarkdownWithLinks(content);
  if (typeof content === 'object') {
    if (typeof content.report === 'string') return renderMarkdownWithLinks(content.report);
    if (typeof content.text === 'string') return renderMarkdownWithLinks(content.text);
    return renderMarkdownWithLinks(JSON.stringify(content, null, 2));
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
  const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge', 'private_knowledge', 'solutions', 'import', 'settings', 'users', 'statistics', 'flagged', 'abusive', 'proxycheck', 'update', 'export'
  const router = useRouter();

  // Export States
  const [exportPreset, setExportPreset] = useState('30d');
  const [exportSinceDate, setExportSinceDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [exportUntilDate, setExportUntilDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [exportIncludeTickets, setExportIncludeTickets] = useState(true);
  const [exportIncludeChats, setExportIncludeChats] = useState(true);
  const [exportIncludeKnowledge, setExportIncludeKnowledge] = useState(true);
  const [exportIncludeUsers, setExportIncludeUsers] = useState(false);
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState(null);
  const [exportCopySuccess, setExportCopySuccess] = useState(false);

  // Solutions (Saved closed solutions) States
  const [solutions, setSolutions] = useState([]);
  const [solutionsLoading, setSolutionsLoading] = useState(false);
  const [solutionsSearch, setSolutionsSearch] = useState('');
  const [generatingContextId, setGeneratingContextId] = useState(null);

  // Statistics States
  const [statistics, setStatistics] = useState([]);
  const [botStatistics, setBotStatistics] = useState(null);
  const [ratingStatistics, setRatingStatistics] = useState(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [categorizingBotChats, setCategorizingBotChats] = useState(false);
  const [categorizeMode, setCategorizeMode] = useState('uncategorized'); // 'uncategorized' or 'all'
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
  const [smtpConfig, setSmtpConfig] = useState({ host: '', port: 1025, user: '', pass: '', secure: false, sender: '', sender_name: '' });
  const [idpConfig, setIdpConfig] = useState({ jwtSecret: '', redirectUrl: '', logoutText: '', logoutRedirectUrl: '' });
  const [githubConfig, setGithubConfig] = useState({ repoUrl: '', branch: '' });
  const [geminiConfig, setGeminiConfig] = useState({ apiKey: '', chatModel: '', extractionModel: '' });
  const [proxycheckConfig, setProxycheckConfig] = useState({
    enabled: false,
    apiKey: '',
    blockVpn: true,
    blockTor: true,
    blockProxy: true,
    blockCompromised: true,
    minRiskScore: 67,
    whitelistedIps: '',
    whitelistedAsns: ''
  });
  const [testProxycheckLoading, setTestProxycheckLoading] = useState(false);
  const [testProxycheckResult, setTestProxycheckResult] = useState(null);
  const [showProxycheckKey, setShowProxycheckKey] = useState(false);
  const [proxycheckCache, setProxycheckCache] = useState([]);
  const [proxycheckCacheStats, setProxycheckCacheStats] = useState({ total: 0, proxies: 0, clean: 0, highRisk: 0 });
  const [isProxycheckCacheLoading, setIsProxycheckCacheLoading] = useState(false);
  const [proxycheckCacheSearch, setProxycheckCacheSearch] = useState('');
  const [proxycheckCacheFilter, setProxycheckCacheFilter] = useState('all'); // 'all' | 'proxies' | 'clean' | 'high_risk'
  const [selectedRawResponse, setSelectedRawResponse] = useState(null);
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

  // IP-Sperren & Verwarnungen States
  const [ipBans, setIpBans] = useState([]);
  const [ipBansStats, setIpBansStats] = useState({ total: 0, activeBans: 0, warnings: 0 });
  const [isBansLoading, setIsBansLoading] = useState(false);
  const [newBanIp, setNewBanIp] = useState('');
  const [newBanHours, setNewBanHours] = useState('24');
  const [newBanReason, setNewBanReason] = useState('');
  const [isCreatingBan, setIsCreatingBan] = useState(false);

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

  // Multi-Toast Stack Notification State für Admins
  const [adminTicketsRef, setAdminTicketsRef] = useState([]);
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

  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    const pingHeartbeat = () => {
      fetch(`/api/live/sync?roomType=dashboard&roomId=global&myRole=admin&myEmail=${encodeURIComponent(user.email || '')}`)
        .catch(() => {});
    };

    pingHeartbeat();

    const interval = setInterval(() => {
      // 1. Live-Heartbeat pingen, damit Admin als online geführt wird
      pingHeartbeat();

      // 2. Falls der Admin gerade ein Chat-Detail im Inspektor geöffnet hat, dieses stumm aktualisieren
      if (selectedChatDetails && selectedChatDetails.id) {
        fetch(`/api/admin/chats?chatId=${selectedChatDetails.id}`)
          .then(r => r.json())
          .then(data => {
            if (data.messages && data.messages.length > selectedChatMessages.length) {
              setSelectedChatMessages(data.messages);
            }
          })
          .catch(() => {});
      }

      // 3. Im Hintergrund NUR aktive offene Tickets prüfen & Toast auslösen
      fetch('/api/tickets?status=active')
        .then(r => r.json())
        .then(data => {
          if (data.tickets) {
            setAdminTicketsRef(prev => {
              if (prev.length > 0) {
                const prevIds = new Set(prev.map(t => t.id));
                const brandNewTickets = data.tickets.filter(t => !prevIds.has(t.id));
                if (brandNewTickets.length > 0) {
                  for (const newest of brandNewTickets) {
                    addToastNotification({
                      type: 'new_ticket',
                      title: `Neues Support-Ticket: ${newest.title}`,
                      text: `Erstellt von ${newest.creatorName || newest.creatorEmail}`,
                      ticketId: newest.id
                    });
                  }
                } else {
                  const newlyUnreadTickets = data.tickets.filter(nt => {
                    const ot = prev.find(p => p.id === nt.id);
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
              return data.tickets;
            });
          }
        })
        .catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [user, selectedChatDetails, selectedChatMessages]);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'flagged') {
      loadFlaggedMessages();
    } else if (activeTab === 'abusive') {
      loadAbusiveChats();
    } else if (activeTab === 'bans') {
      loadIpBans();
    } else if (activeTab === 'solutions') {
      loadSolutions();
    } else if (activeTab === 'statistics') {
      loadStatistics();
    } else if (activeTab === 'chats') {
      loadChats();
    } else if (activeTab === 'proxycheck') {
      loadProxycheckCache();
    } else if (activeTab === 'export') {
      if (!exportPreview) {
        handleLoadExportPreview();
      }
    }
  }, [activeTab]);

  const filteredProxycheckCache = useMemo(() => {
    return proxycheckCache.filter(item => {
      if (proxycheckCacheFilter === 'proxies' && item.isProxy !== 1) return false;
      if (proxycheckCacheFilter === 'clean' && (item.isProxy === 1 || item.riskScore >= 50)) return false;
      if (proxycheckCacheFilter === 'high_risk' && item.riskScore < 67) return false;
      if (proxycheckCacheFilter === 'asn_whitelisted' && !item.isAsnWhitelisted) return false;

      if (proxycheckCacheSearch) {
        const query = proxycheckCacheSearch.toLowerCase().trim();
        const ipMatch = (item.ip || '').toLowerCase().includes(query);
        const providerMatch = (item.provider || '').toLowerCase().includes(query);
        const countryMatch = (item.country || '').toLowerCase().includes(query);
        const typeMatch = (item.proxyType || '').toLowerCase().includes(query);
        const asnMatch = (item.asn || '').toLowerCase().includes(query);
        if (!ipMatch && !providerMatch && !countryMatch && !typeMatch && !asnMatch) return false;
      }

      return true;
    });
  }, [proxycheckCache, proxycheckCacheFilter, proxycheckCacheSearch]);

  const setExportDatePreset = (preset) => {
    setExportPreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setExportUntilDate(todayStr);

    if (preset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setExportSinceDate(d.toISOString().split('T')[0]);
    } else if (preset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setExportSinceDate(d.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      setExportSinceDate(d.toISOString().split('T')[0]);
    } else if (preset === 'year') {
      const d = new Date(today.getFullYear(), 0, 1);
      setExportSinceDate(d.toISOString().split('T')[0]);
    } else if (preset === 'all') {
      setExportSinceDate('');
      setExportUntilDate('');
    }
  };

  const handleLoadExportPreview = async (overrideSince = null, overrideUntil = null) => {
    setIsExportLoading(true);
    try {
      const s = overrideSince !== null ? overrideSince : exportSinceDate;
      const u = overrideUntil !== null ? overrideUntil : exportUntilDate;
      const params = new URLSearchParams({
        since: s,
        until: u,
        includeTickets: exportIncludeTickets.toString(),
        includeChats: exportIncludeChats.toString(),
        includeKnowledge: exportIncludeKnowledge.toString(),
        includeUsers: exportIncludeUsers.toString()
      });

      const res = await fetch(`/api/admin/export?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setExportPreview(data);
      } else {
        const data = await res.json();
        console.error('Fehler bei Export-Vorschau:', data.error);
      }
    } catch (err) {
      console.error('Fehler bei Export-Vorschau:', err);
    } finally {
      setIsExportLoading(false);
    }
  };

  const handleDownloadExportJson = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        since: exportSinceDate,
        until: exportUntilDate,
        includeTickets: exportIncludeTickets.toString(),
        includeChats: exportIncludeChats.toString(),
        includeKnowledge: exportIncludeKnowledge.toString(),
        includeUsers: exportIncludeUsers.toString(),
        format: 'download'
      });

      const url = `/api/admin/export?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Fehler beim Herunterladen des Exports');
      }

      const blob = await res.blob();
      const filename = `helpdesk_export_${exportSinceDate || 'all'}_bis_${exportUntilDate || new Date().toISOString().split('T')[0]}.json`;

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Fehler beim Download:', err);
      alert('Fehler beim Herunterladen der Export-Datei: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

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

  const loadIpBans = async () => {
    setIsBansLoading(true);
    try {
      const res = await fetch('/api/admin/bans');
      if (res.ok) {
        const data = await res.json();
        setIpBans(data.bans || []);
        if (data.stats) setIpBansStats(data.stats);
      }
    } catch (e) {
      console.error('Fehler beim Laden der IP-Sperren:', e);
    } finally {
      setIsBansLoading(false);
    }
  };

  const handleCreateBan = async (e) => {
    e.preventDefault();
    if (!newBanIp.trim()) return;
    setIsCreatingBan(true);
    try {
      const res = await fetch('/api/admin/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: newBanIp.trim(),
          hours: newBanHours,
          reason: newBanReason.trim() || 'Manuelle Sperre durch Administrator'
        })
      });
      if (res.ok) {
        setNewBanIp('');
        setNewBanReason('');
        loadIpBans();
        loadAbusiveChats();
      } else {
        const err = await res.json();
        alert(err.error || 'Fehler beim Erstellen der IP-Sperre.');
      }
    } catch (e) {
      console.error('Fehler beim Erstellen der IP-Sperre:', e);
    } finally {
      setIsCreatingBan(false);
    }
  };

  const handleLiftBan = async (ip) => {
    if (!ip) return;
    try {
      const res = await fetch('/api/admin/bans', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      if (res.ok) {
        loadIpBans();
        loadAbusiveChats();
      }
    } catch (e) {
      console.error('Fehler beim Aufheben der Sperre:', e);
    }
  };

  const handleQuickBan = async (ip, hours = 24) => {
    if (!ip) return;
    try {
      const res = await fetch('/api/admin/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip,
          hours,
          reason: `24h-Sperre wegen Missbrauchsmeldung`
        })
      });
      if (res.ok) {
        loadIpBans();
        loadAbusiveChats();
      }
    } catch (e) {
      console.error('Fehler beim Setzen der Schnellsperre:', e);
    }
  };

  const handleLiftFingerprintBan = async (fingerprint) => {
    if (!fingerprint) return;
    try {
      const res = await fetch('/api/admin/bans', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint })
      });
      if (res.ok) {
        loadIpBans();
        loadAbusiveChats();
      }
    } catch (e) {
      console.error('Fehler beim Aufheben der Fingerprint-Sperre:', e);
    }
  };

  const handleQuickBanFingerprint = async (fingerprint, hours = 24) => {
    if (!fingerprint) return;
    try {
      const res = await fetch('/api/admin/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ban_fingerprint',
          fingerprint,
          hours,
          reason: `24h-Geräte-Sperre wegen Missbrauchsmeldung`
        })
      });
      if (res.ok) {
        loadIpBans();
        loadAbusiveChats();
      }
    } catch (e) {
      console.error('Fehler beim Setzen der Geräte-Sperre:', e);
    }
  };

  const loadProxycheckCache = async () => {
    setIsProxycheckCacheLoading(true);
    try {
      const res = await fetch('/api/admin/proxycheck/cache');
      if (res.ok) {
        const data = await res.json();
        setProxycheckCache(data.rows || []);
        if (data.stats) setProxycheckCacheStats(data.stats);
      }
    } catch (e) {
      console.error('Fehler beim Laden des ProxyCheck-Caches:', e);
    } finally {
      setIsProxycheckCacheLoading(false);
    }
  };

  const handleDeleteCacheIp = async (ip) => {
    if (!confirm(`Möchtest du den Cache-Eintrag für IP ${ip} wirklich löschen? Bei der nächsten Anfrage wird die IP erneut frisch bewertet.`)) return;
    try {
      const res = await fetch('/api/admin/proxycheck/cache', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      if (res.ok) {
        loadProxycheckCache();
      } else {
        alert('Fehler beim Löschen des Cache-Eintrags.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
    }
  };

  const handleClearCache = async (mode = 'expired') => {
    const text = mode === 'all' 
      ? 'Möchtest du wirklich den GESAMTEN ProxyCheck-Cache leeren? Alle bisher geprüften IPs werden dann bei künftigen Anfragen neu bewertet.' 
      : 'Möchtest du alle abgelaufenen Cache-Einträge bereinigen?';
    if (!confirm(text)) return;
    try {
      const res = await fetch('/api/admin/proxycheck/cache', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`${data.count || 0} Cache-Einträge wurden gelöscht.`);
        loadProxycheckCache();
      } else {
        alert('Fehler beim Bereinigen des Caches.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
    }
  };

  const handleTransferToWhitelist = async (ip) => {
    if (!confirm(`Möchtest du die IP ${ip} dauerhaft auf die Whitelist übertragen? Anfragen von dieser IP werden dann niemals mehr blockiert.`)) return;
    try {
      const res = await fetch('/api/admin/proxycheck/cache/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      if (res.ok) {
        const data = await res.json();
        setProxycheckConfig(prev => ({
          ...prev,
          whitelistedIps: data.whitelistedIps || (prev.whitelistedIps ? `${prev.whitelistedIps}\n${ip}` : ip)
        }));
        loadProxycheckCache();
        alert(`IP ${ip} wurde erfolgreich zur Whitelist hinzugefügt!`);
      } else {
        alert('Fehler beim Hinzufügen zur Whitelist.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
    }
  };

  const handleTransferToWhitelistAsn = async (asn) => {
    if (!asn) return;
    let cleanAsn = asn.trim().toUpperCase();
    if (!cleanAsn.startsWith('AS') && /^\d+$/.test(cleanAsn)) cleanAsn = `AS${cleanAsn}`;
    if (!confirm(`Möchtest du die AS-Nummer ${cleanAsn} auf die Whitelist setzen? Alle IPs dieses Autonomen Systems (z. B. Apple Private Relay) werden dann durchgelassen.`)) return;
    try {
      const res = await fetch('/api/admin/proxycheck/cache/whitelist-asn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asn: cleanAsn })
      });
      if (res.ok) {
        const data = await res.json();
        setProxycheckConfig(prev => ({
          ...prev,
          whitelistedAsns: data.whitelistedAsns || (prev.whitelistedAsns ? `${prev.whitelistedAsns}, ${cleanAsn}` : cleanAsn)
        }));
        loadProxycheckCache();
        alert(`AS-Nummer ${cleanAsn} wurde erfolgreich zur Whitelist hinzugefügt!`);
      } else {
        alert('Fehler beim Hinzufügen der AS-Nummer zur Whitelist.');
      }
    } catch (e) {
      console.error(e);
      alert('Verbindungsfehler.');
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
        if (data.ratingStatistics) setRatingStatistics(data.ratingStatistics);
      }
    } catch (e) {
      console.error('Fehler beim Laden der Statistik:', e);
    } finally {
      setStatisticsLoading(false);
    }
  };

  const handleCategorizeAllChats = async (modeOverride) => {
    const selectedMode = modeOverride || categorizeMode;
    setCategorizingBotChats(true);
    setCategorizingResultMsg('');
    try {
      const res = await fetch('/api/admin/chats/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode })
      });
      if (res.ok) {
        const data = await res.json();
        const durationSec = (data.durationMs ? (data.durationMs / 1000).toFixed(1) : '1.2');
        const modeLabel = data.mode === 'all' ? 'alle Chats' : 'unkategorisierte Chats';
        setCategorizingResultMsg(`⚡ ${data.processedCount} Chat(s) (${modeLabel}) in ${durationSec}s per Highspeed-Parallel-Batch einkategorisiert.`);
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

  const getKnownChatEmail = (chat, identityTrace) => {
    if (chat?.userEmail && chat.userEmail.trim()) return chat.userEmail.trim();
    if (identityTrace?.linkedIdentities && identityTrace.linkedIdentities.length > 0) {
      const found = identityTrace.linkedIdentities.find(i => i.email && i.email.trim());
      if (found) return found.email.trim();
    }
    return null;
  };

  const formatCustomerPresenceText = (lastActiveAt) => {
    if (!lastActiveAt) return 'Kunde offline';
    const diffMs = Date.now() - parseUtcDate(lastActiveAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 2) return 'Kunde ist online';
    if (diffMins < 60) return `Kunde vor ${diffMins} Min. online`;
    if (diffHours < 24) return `Kunde vor ${diffHours} Std. online`;
    if (diffDays === 1) return 'Kunde vor 1 Tag online';
    return `Kunde vor ${diffDays} Tagen online`;
  };

  const isCustomerOnline = (lastActiveAt) => {
    if (!lastActiveAt) return false;
    const diffMs = Date.now() - parseUtcDate(lastActiveAt).getTime();
    return Math.floor(diffMs / 60000) < 2;
  };

  const [isConvertingTicket, setIsConvertingTicket] = useState(false);

  const handleConvertChatToTicket = async (chat) => {
    if (!chat) return;

    // 1. Wenn dieses Chat bereits ein exaktes Ticket besitzt -> direkt dorthin navigieren!
    const exactTicketId = chat.exactTicketId || selectedChatIdentityTrace?.directTicket?.id;
    if (exactTicketId) {
      router.push(`/agent/tickets/${exactTicketId}`);
      return;
    }

    // 1. Ersteller ermitteln (E-Mail der Person, die den Chat geführt hat)
    const creatorEmail = getKnownChatEmail(chat, selectedChatIdentityTrace);
    if (!creatorEmail) {
      alert('Eine Umwandlung in ein Support-Ticket ist nur möglich, wenn mindestens eine E-Mail-Adresse bekannt ist.');
      return;
    }

    let creatorName = chat.userName || 'Gast';
    if (selectedChatIdentityTrace?.linkedIdentities?.length > 0) {
      const primaryIdentity = selectedChatIdentityTrace.linkedIdentities.find(i => i.email === creatorEmail);
      if (primaryIdentity?.name) creatorName = primaryIdentity.name;
    }

    // Vorgeschlagenen Titel ableiten
    let suggestedTitle = chat.category ? `Support-Anfrage: ${chat.category}` : '';
    if (!suggestedTitle && selectedChatMessages && selectedChatMessages.length > 0) {
      const firstUserMsg = selectedChatMessages.find(m => m.sender === 'user')?.text;
      if (firstUserMsg) {
        suggestedTitle = firstUserMsg.length > 60 ? `${firstUserMsg.substring(0, 57)}...` : firstUserMsg;
      }
    }

    // 4. Titel per Popup durch Admin festlegen
    const promptInput = prompt(
      `Support-Ticket aus Chat (${creatorName} <${creatorEmail}>) erstellen.\n\nBitte gib den Titel für das Ticket ein:`,
      suggestedTitle
    );

    // Abbrechen geklickt
    if (promptInput === null) {
      return;
    }

    // Keine Eingabe / Nur Leerzeichen = "Unbekannter Titel"
    const finalTitle = promptInput.trim() === '' ? 'Unbekannter Titel' : promptInput.trim();

    setIsConvertingTicket(true);
    try {
      const currentAgentId = user?.id || 'me';

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat.id,
          chatId: chat.id,
          creator_email: creatorEmail,
          email: creatorEmail,
          creator_name: creatorName,
          name: creatorName,
          title: finalTitle,
          assignedAgentId: currentAgentId
        })
      });

      if (res.ok) {
        const data = await res.json();
        loadChats();
        setSelectedChatDetails(prev => prev ? { ...prev, ticketCreated: 1 } : null);
        // 3. Nach Klick direkt zum Ticket leiten (/agent/tickets/TK-XXXX)
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
        if (config.proxycheck_config) setProxycheckConfig(config.proxycheck_config);
      }

      // Moderations- und Sperren-Zähler für Sidebar-Badges im Hintergrund laden
      loadFlaggedMessages().catch(() => {});
      loadAbusiveChats().catch(() => {});
      loadIpBans().catch(() => {});
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

  const handleTestProxycheck = async () => {
    setTestProxycheckLoading(true);
    setTestProxycheckResult(null);

    try {
      const res = await fetch('/api/admin/settings/test-proxycheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: proxycheckConfig.apiKey
        })
      });

      const data = await res.json();
      setTestProxycheckResult(data);
    } catch (err) {
      setTestProxycheckResult({ success: false, error: 'Verbindungsfehler beim Testen von ProxyCheck.io' });
    } finally {
      setTestProxycheckLoading(false);
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
          gemini_config: geminiConfig,
          proxycheck_config: proxycheckConfig
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
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      
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
      <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex justify-between items-center shrink-0 shadow-lg z-30 relative h-[64px]">
        <div className="flex items-center gap-3">
          {/* Hamburger-Button für mobile Navigation */}
          <button 
            type="button" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-slate-400 hover:text-white p-2 rounded-xl border border-slate-800 bg-slate-950/60 focus:outline-none transition-colors"
            title="Admin-Menü öffnen"
          >
            <i className={`fa-solid ${mobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-base`}></i>
          </button>

          <div className="bg-violet-600 text-white p-2 rounded-xl shadow-md flex items-center justify-center shrink-0">
            <i className="fa-solid fa-gears text-base sm:text-lg"></i>
          </div>
          <div>
            <h1 className="text-xs sm:text-sm md:text-base font-bold text-white leading-tight">System-Administration</h1>
            <p className="text-[9px] md:text-[10px] text-violet-400 font-bold uppercase tracking-wider">Admin Control Center</p>
          </div>
        </div>

        {/* User Navigation Menu */}
        <div className="flex items-center gap-3">
          <UserNavMenu user={user} currentView="admin" onLogout={handleLogout} />
        </div>
      </header>

      {/* Main Layout Wrapper: Left Sidebar + Content */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative w-full">
        
        {/* Left Sidebar Menu */}
        <aside className={`
          w-64 lg:w-72 shrink-0 bg-slate-900/95 border-r border-slate-800/80 flex flex-col justify-between overflow-y-auto z-40 transition-all duration-300
          ${mobileMenuOpen ? 'fixed inset-y-[64px] left-0 shadow-2xl bg-slate-900' : 'hidden md:flex'}
        `}>
          <div className="p-3.5 space-y-5">
            
            {/* Kategorie 1: WISSENSMANAGEMENT */}
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-3 mb-1.5 block">
                Wissensmanagement
              </span>
              
              <button
                onClick={() => { setActiveTab('knowledge'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'knowledge' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-brain text-sm w-4 shrink-0 ${activeTab === 'knowledge' ? 'text-white' : 'text-violet-400 group-hover:text-violet-300'}`}></i>
                  <span className="truncate">Öffentliches Wissen</span>
                </div>
                {knowledge.filter(k => !k.isPrivate).length > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    activeTab === 'knowledge' ? 'bg-white/20 text-white' : 'bg-slate-950 text-slate-400'
                  }`}>
                    {knowledge.filter(k => !k.isPrivate).length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('private_knowledge'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'private_knowledge' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-user-lock text-sm w-4 shrink-0 ${activeTab === 'private_knowledge' ? 'text-white' : 'text-amber-400 group-hover:text-amber-300'}`}></i>
                  <span className="truncate">Internes Wissen</span>
                </div>
                {knowledge.filter(k => k.isPrivate).length > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    activeTab === 'private_knowledge' ? 'bg-white/20 text-white' : 'bg-slate-950 text-slate-400'
                  }`}>
                    {knowledge.filter(k => k.isPrivate).length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('solutions'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'solutions' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-circle-check text-sm w-4 shrink-0 ${activeTab === 'solutions' ? 'text-white' : 'text-emerald-400 group-hover:text-emerald-300'}`}></i>
                  <span className="truncate">Gelöste Lösungen</span>
                </div>
                {solutions.length > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    activeTab === 'solutions' ? 'bg-white/20 text-white' : 'bg-slate-950 text-slate-400'
                  }`}>
                    {solutions.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('import'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'import' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-cloud-arrow-up text-sm w-4 shrink-0 ${activeTab === 'import' ? 'text-white' : 'text-sky-400 group-hover:text-sky-300'}`}></i>
                  <span className="truncate">KI-Import (Dateien/Web)</span>
                </div>
              </button>
            </div>

            {/* Kategorie 2: BENUTZER & ANALYSE */}
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-3 mb-1.5 block">
                Benutzer & Analyse
              </span>

              <button
                onClick={() => { setActiveTab('users'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'users' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-users text-sm w-4 shrink-0 ${activeTab === 'users' ? 'text-white' : 'text-indigo-400 group-hover:text-indigo-300'}`}></i>
                  <span className="truncate">Benutzerverwaltung</span>
                </div>
                {usersList.length > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    activeTab === 'users' ? 'bg-white/20 text-white' : 'bg-slate-950 text-slate-400'
                  }`}>
                    {usersList.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('statistics'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'statistics' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-chart-line text-sm w-4 shrink-0 ${activeTab === 'statistics' ? 'text-white' : 'text-sky-400 group-hover:text-sky-300'}`}></i>
                  <span className="truncate">Statistiken & Insights</span>
                </div>
              </button>

              <button
                onClick={() => { setActiveTab('chats'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'chats' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-comments text-sm w-4 shrink-0 ${activeTab === 'chats' ? 'text-white' : 'text-cyan-400 group-hover:text-cyan-300'}`}></i>
                  <span className="truncate">Chat-Protokolle</span>
                </div>
                {chatsList.length > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    activeTab === 'chats' ? 'bg-white/20 text-white' : 'bg-slate-950 text-slate-400'
                  }`}>
                    {chatsList.length}
                  </span>
                )}
              </button>
            </div>

            {/* Kategorie 3: MODERATION & SICHERHEIT */}
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-3 mb-1.5 block">
                Moderation & Sicherheit
              </span>

              <button
                onClick={() => { setActiveTab('flagged'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'flagged' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-flag text-sm w-4 shrink-0 ${activeTab === 'flagged' ? 'text-white' : 'text-amber-400 group-hover:text-amber-300'}`}></i>
                  <span className="truncate">Geflaggte Antworten</span>
                </div>
                {flaggedMessages.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {flaggedMessages.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('abusive'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'abusive' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-triangle-exclamation text-sm w-4 shrink-0 ${activeTab === 'abusive' ? 'text-white' : 'text-rose-400 group-hover:text-rose-300'}`}></i>
                  <span className="truncate">Missbrauchserkennung</span>
                </div>
                {abusiveChats.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {abusiveChats.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('bans'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'bans' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-ban text-sm w-4 shrink-0 ${activeTab === 'bans' ? 'text-white' : 'text-red-400 group-hover:text-red-300'}`}></i>
                  <span className="truncate">IP-Sperren</span>
                </div>
                {ipBansStats.activeBans > 0 ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                    {ipBansStats.activeBans}
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-slate-950 text-slate-500 border border-slate-800">
                    {ipBans.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('proxycheck'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'proxycheck' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-shield-halved text-sm w-4 shrink-0 ${activeTab === 'proxycheck' ? 'text-white' : 'text-emerald-400 group-hover:text-emerald-300'}`}></i>
                  <span className="truncate">ProxyCheck.io</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                  proxycheckConfig.enabled 
                    ? (activeTab === 'proxycheck' ? 'bg-white/20 text-white border-white/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30')
                    : (activeTab === 'proxycheck' ? 'bg-white/10 text-white/70 border-white/20' : 'bg-slate-950 text-slate-500 border-slate-800')
                }`}>
                  {proxycheckConfig.enabled ? 'Aktiv' : 'Aus'}
                </span>
              </button>
            </div>

            {/* Kategorie 4: SYSTEM & DATEN */}
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-3 mb-1.5 block">
                System & Daten
              </span>

              <button
                onClick={() => { setActiveTab('export'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'export' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-file-export text-sm w-4 shrink-0 ${activeTab === 'export' ? 'text-white' : 'text-emerald-400 group-hover:text-emerald-300'}`}></i>
                  <span className="truncate">Daten-Export (JSON)</span>
                </div>
              </button>

              <button
                onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'settings' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-solid fa-sliders text-sm w-4 shrink-0 ${activeTab === 'settings' ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}></i>
                  <span className="truncate">System-Einstellungen</span>
                </div>
              </button>

              <button
                onClick={() => { setActiveTab('update'); setMobileMenuOpen(false); }}
                className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-between group cursor-pointer ${
                  activeTab === 'update' 
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-950/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <i className={`fa-brands fa-github text-sm w-4 shrink-0 ${activeTab === 'update' ? 'text-white' : 'text-violet-400 group-hover:text-violet-300'}`}></i>
                  <span className="truncate">GitHub-Update</span>
                </div>
              </button>
            </div>

            {/* Mobile-only Navigation Links */}
            <div className="md:hidden border-t border-slate-800 pt-3 space-y-1">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2 px-3 rounded-xl font-semibold text-xs text-slate-300 hover:text-white bg-slate-950/60 border border-slate-800 flex items-center gap-2"
              >
                <i className="fa-solid fa-comments text-sky-400"></i>
                <span>Zum Chat-Frontend</span>
              </Link>
              <Link
                href="/agent"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2 px-3 rounded-xl font-semibold text-xs text-slate-300 hover:text-white bg-slate-950/60 border border-slate-800 flex items-center gap-2"
              >
                <i className="fa-solid fa-ticket text-violet-400"></i>
                <span>Zum Agenten-Portal</span>
              </Link>
            </div>

          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-[10px] text-slate-500 text-center font-medium">
            Schul-Support KI • v1.0
          </div>
        </aside>

        {/* Backdrop for Mobile Drawer */}
        {mobileMenuOpen && (
          <div 
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-30"
          />
        )}

        {/* Content Container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 min-w-0 bg-slate-950/30">
        
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
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="sm:col-span-2 md:col-span-2">
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">SMTP-Host</label>
                  <input 
                    type="text" 
                    placeholder="z.B. smtp.office365.com oder mail.schule.de"
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Port</label>
                  <input 
                    type="number" 
                    placeholder="587 oder 465"
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, port: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Benutzername</label>
                  <input 
                    type="text" 
                    placeholder="z.B. support@schule.de"
                    value={smtpConfig.user}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Passwort / App-Passwort</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={smtpConfig.pass}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Absender Anzeigename</label>
                  <input 
                    type="text" 
                    placeholder="z.B. IT-Helpdesk oder Schul-Support"
                    value={smtpConfig.sender_name || ''}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, sender_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div className="sm:col-span-2 md:col-span-3">
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Absender E-Mail-Adresse</label>
                  <input 
                    type="text" 
                    placeholder="z.B. support@schule.de"
                    value={smtpConfig.sender}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, sender: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    E-Mails werden versendet als: <span className="font-mono text-slate-400">{smtpConfig.sender_name ? `"${smtpConfig.sender_name}" <${smtpConfig.sender || 'support@schule.de'}>` : (smtpConfig.sender || 'support@schule.de')}</span>
                  </p>
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

        {/* Tab 5: Daten-Export (JSON) */}
        {activeTab === 'export' && (
          <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
            {/* Header Info Box */}
            <div className="bg-slate-900/50 p-5 border border-slate-800 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <i className="fa-solid fa-file-export text-sm"></i>
                  </div>
                  <h3 className="text-base font-bold text-white">Helpdesk Daten-Export (JSON)</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Exportiere alle Support-Tickets, Chat-Verläufe, Benutzer- und Agenten-Nachrichten, Bewertungen und Wissenseinträge seit einem frei wählbaren Datum als strukturierte JSON-Datei.
                </p>
              </div>
            </div>

            {/* Filter & Datums-Einstellungen */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6 shadow-lg">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
                <i className="fa-solid fa-calendar-days text-violet-400"></i>
                <span>1. Zeitraum festlegen</span>
              </h4>

              {/* Zeitraum Schnell-Filter */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 block">Schnellauswahl:</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExportDatePreset('7d');
                      const d = new Date();
                      d.setDate(d.getDate() - 7);
                      handleLoadExportPreview(d.toISOString().split('T')[0], new Date().toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                      exportPreset === '7d' 
                        ? 'bg-violet-600 border-violet-500 text-white shadow-sm' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    Letzte 7 Tage
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportDatePreset('30d');
                      const d = new Date();
                      d.setDate(d.getDate() - 30);
                      handleLoadExportPreview(d.toISOString().split('T')[0], new Date().toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                      exportPreset === '30d' 
                        ? 'bg-violet-600 border-violet-500 text-white shadow-sm' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    Letzte 30 Tage
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportDatePreset('month');
                      const today = new Date();
                      const d = new Date(today.getFullYear(), today.getMonth(), 1);
                      handleLoadExportPreview(d.toISOString().split('T')[0], today.toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                      exportPreset === 'month' 
                        ? 'bg-violet-600 border-violet-500 text-white shadow-sm' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    Dieser Monat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportDatePreset('year');
                      const today = new Date();
                      const d = new Date(today.getFullYear(), 0, 1);
                      handleLoadExportPreview(d.toISOString().split('T')[0], today.toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                      exportPreset === 'year' 
                        ? 'bg-violet-600 border-violet-500 text-white shadow-sm' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    Dieses Jahr
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportDatePreset('all');
                      handleLoadExportPreview('', '');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                      exportPreset === 'all' 
                        ? 'bg-violet-600 border-violet-500 text-white shadow-sm' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    Gesamter Verlauf (Alles)
                  </button>
                </div>
              </div>

              {/* Datums-Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1.5 flex items-center justify-between">
                    <span>Exportieren ab Datum (Seit wann?):</span>
                    <span className="text-[10px] text-slate-500 font-normal">Beginn (00:00 Uhr)</span>
                  </label>
                  <input
                    type="date"
                    value={exportSinceDate}
                    onChange={(e) => {
                      setExportSinceDate(e.target.value);
                      setExportPreset('custom');
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1.5 flex items-center justify-between">
                    <span>Bis Datum (Optional):</span>
                    <span className="text-[10px] text-slate-500 font-normal">Ende (23:59 Uhr)</span>
                  </label>
                  <input
                    type="date"
                    value={exportUntilDate}
                    onChange={(e) => {
                      setExportUntilDate(e.target.value);
                      setExportPreset('custom');
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              {/* 2. Inhalte auswählen */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <i className="fa-solid fa-list-check text-sky-400"></i>
                  <span>2. Zu exportierende Inhalte wählen</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                  <label className="flex items-center gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-slate-700 cursor-pointer transition-all select-none">
                    <input
                      type="checkbox"
                      checked={exportIncludeTickets}
                      onChange={(e) => setExportIncludeTickets(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-violet-600 focus:ring-violet-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-white block">Tickets & Nachrichten</span>
                      <span className="text-[10px] text-slate-500">Status, Lösungen, Bewertungen</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-slate-700 cursor-pointer transition-all select-none">
                    <input
                      type="checkbox"
                      checked={exportIncludeChats}
                      onChange={(e) => setExportIncludeChats(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-violet-600 focus:ring-violet-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-white block">Live-Chats & Bot</span>
                      <span className="text-[10px] text-slate-500">Gesamter Chat-Verlauf</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-slate-700 cursor-pointer transition-all select-none">
                    <input
                      type="checkbox"
                      checked={exportIncludeKnowledge}
                      onChange={(e) => setExportIncludeKnowledge(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-violet-600 focus:ring-violet-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-white block">Wissensdatenbank</span>
                      <span className="text-[10px] text-slate-500">Artikel & Kategorien</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-slate-700 cursor-pointer transition-all select-none">
                    <input
                      type="checkbox"
                      checked={exportIncludeUsers}
                      onChange={(e) => setExportIncludeUsers(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-violet-600 focus:ring-violet-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-white block">Benutzer-Liste</span>
                      <span className="text-[10px] text-slate-500">Admins, Agenten, Rollen</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* 3. Export & Download Actions */}
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => handleLoadExportPreview()}
                  disabled={isExportLoading}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-50 cursor-pointer"
                >
                  {isExportLoading ? (
                    <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                  ) : (
                    <i className="fa-solid fa-magnifying-glass text-xs text-sky-400"></i>
                  )}
                  <span>Daten-Vorschau analysieren</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadExportJson}
                  disabled={isExporting}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-sm"></i>
                      <span>JSON-Export wird erstellt...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-file-arrow-down text-sm"></i>
                      <span>JSON-Datei jetzt herunterladen</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Live Preview Box */}
            {exportPreview && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-chart-pie text-emerald-400"></i>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Gefundene Datensätze im gewählten Zeitraum</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {exportPreview.exportMetadata?.filter?.since || 'alle'} bis {exportPreview.exportMetadata?.filter?.until || 'heute'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <span className="text-lg font-bold text-violet-400 block font-mono">{exportPreview.exportMetadata?.statistics?.totalTickets || 0}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Tickets</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <span className="text-lg font-bold text-violet-300 block font-mono">{exportPreview.exportMetadata?.statistics?.totalTicketMessages || 0}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Ticket-Nachrichten</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <span className="text-lg font-bold text-sky-400 block font-mono">{exportPreview.exportMetadata?.statistics?.totalChats || 0}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Live-Chats</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <span className="text-lg font-bold text-sky-300 block font-mono">{exportPreview.exportMetadata?.statistics?.totalChatMessages || 0}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Chat-Nachrichten</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <span className="text-lg font-bold text-amber-400 block font-mono">
                      {exportPreview.exportMetadata?.statistics?.averageRating ? `${exportPreview.exportMetadata.statistics.averageRating} ★` : '-'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Ø Bewertung ({exportPreview.exportMetadata?.statistics?.ratedTicketsCount || 0})</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <span className="text-lg font-bold text-emerald-400 block font-mono">{exportPreview.exportMetadata?.statistics?.totalKnowledgeEntries || 0}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Wissenseinträge</span>
                  </div>
                </div>

                {/* JSON Preview Schnipsel */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">JSON-Struktur Vorschau:</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(exportPreview, null, 2));
                        setExportCopySuccess(true);
                        setTimeout(() => setExportCopySuccess(false), 2000);
                      }}
                      className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {exportCopySuccess ? (
                        <>
                          <i className="fa-solid fa-check text-emerald-400"></i>
                          <span className="text-emerald-400">Kopiert!</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-copy"></i>
                          <span>JSON kopieren</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-300 max-h-60 overflow-y-auto overflow-x-auto whitespace-pre no-scrollbar">
                    {JSON.stringify(exportPreview, null, 2)}
                  </pre>
                </div>
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
                            {/* Online-Status Badge des Kunden */}
                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-medium shadow-sm">
                              <span className={`w-2 h-2 rounded-full ${
                                isCustomerOnline(selectedChatDetails.customerLastActiveAt || selectedChatDetails.lastActiveAt) 
                                  ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' 
                                  : 'bg-slate-500'
                              }`}></span>
                              <span className={isCustomerOnline(selectedChatDetails.customerLastActiveAt || selectedChatDetails.lastActiveAt) ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                                {formatCustomerPresenceText(selectedChatDetails.customerLastActiveAt || selectedChatDetails.lastActiveAt)}
                              </span>
                            </div>
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
                            {/* In Ticket umwandeln (nur wenn E-Mail bekannt ist) / Ticket öffnen */}
                            {((selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id) || Boolean(getKnownChatEmail(selectedChatDetails, selectedChatIdentityTrace))) && (
                              <button 
                                type="button"
                                onClick={() => handleConvertChatToTicket(selectedChatDetails)}
                                disabled={isConvertingTicket}
                                className={`font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 border shadow-sm ${
                                  (selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id)
                                    ? 'bg-violet-950/60 text-violet-300 border-violet-500/40 hover:bg-violet-600 hover:text-white'
                                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600 hover:text-white'
                                }`}
                                title={(selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id) ? "Zugehöriges Support-Ticket im Ticketportal öffnen" : "Diesen Chat in ein neues Support-Ticket umwandeln"}
                              >
                                <i className={`fa-solid ${(selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id) ? 'fa-ticket text-violet-400' : 'fa-plus-circle text-emerald-400'}`}></i>
                                <span>{(selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id) ? `Ticket #${selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id} öffnen` : 'In Ticket umwandeln'}</span>
                              </button>
                            )}

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

                                <div 
                                  className="markdown-content text-xs text-slate-300 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/30 leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: safeParseMarkdown(msg.text || '') }}
                                />
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
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                              <i className="fa-solid fa-comments text-violet-400"></i>
                              <span>{selectedChatDetails.userName || 'Gast'}</span>
                            </h4>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[9px] font-medium shadow-sm">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                isCustomerOnline(selectedChatDetails.lastActiveAt) 
                                  ? 'bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]' 
                                  : 'bg-slate-500'
                              }`}></span>
                              <span className={isCustomerOnline(selectedChatDetails.lastActiveAt) ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                                {formatCustomerPresenceText(selectedChatDetails.lastActiveAt)}
                              </span>
                            </div>
                          </div>
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

                                  <div 
                                    className="markdown-content text-xs text-slate-300 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/30 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: safeParseMarkdown(msg.text || '') }}
                                  />
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
                        {/* Ticket erstellen (nur wenn E-Mail bekannt ist) / öffnen mit Text */}
                        {((selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id) || Boolean(getKnownChatEmail(selectedChatDetails, selectedChatIdentityTrace))) && (
                          <button 
                            type="button"
                            onClick={() => {
                              setShowMobileChatModal(false);
                              handleConvertChatToTicket(selectedChatDetails);
                            }}
                            disabled={isConvertingTicket}
                            className={`font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 border shadow-sm flex-1 justify-center ${
                              (selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id)
                                ? 'bg-violet-950/60 text-violet-300 border-violet-500/40'
                                : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            }`}
                            title={(selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id) ? "Support-Ticket öffnen" : "In Ticket umwandeln"}
                          >
                            <i className={`fa-solid ${(selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id) ? 'fa-ticket text-violet-400' : 'fa-plus-circle text-emerald-400'}`}></i>
                            <span>{(selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id) ? `Ticket #${selectedChatDetails.exactTicketId || selectedChatIdentityTrace?.directTicket?.id} öffnen` : 'Ticket erstellen'}</span>
                          </button>
                        )}

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
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                  {/* Modus-Auswahl: Unkategorisiert vs. Alle */}
                  <div className="bg-slate-950 p-1 border border-slate-800 rounded-xl flex items-center text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setCategorizeMode('uncategorized')}
                      className={`px-3 py-1.5 rounded-lg transition-all text-[11px] ${categorizeMode === 'uncategorized' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                      title="Nur Chats ohne Kategorie einkategorisieren"
                    >
                      Nur unkategorisierte ({botStatistics?.uncategorizedCount || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategorizeMode('all')}
                      className={`px-3 py-1.5 rounded-lg transition-all text-[11px] ${categorizeMode === 'all' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                      title="Alle Chats komplett mit den neuen Schul-Kategorien neu analysieren"
                    >
                      Alle Chats ({botStatistics?.totalChats || 0})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCategorizeAllChats(categorizeMode)}
                    disabled={categorizingBotChats || !botStatistics || (categorizeMode === 'uncategorized' && botStatistics.uncategorizedCount === 0)}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                  >
                    {categorizingBotChats ? (
                      <>
                        <i className="fa-solid fa-circle-notch animate-spin"></i>
                        <span>Kategorisiere Chats...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-wand-magic-sparkles"></i>
                        <span>{categorizeMode === 'all' ? 'Jetzt alle neu kategorisieren' : 'Jetzt einkategorisieren'}</span>
                      </>
                    )}
                  </button>
                </div>
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

            {/* Kundenzufriedenheit & Bewertungs-Statistik */}
            {ratingStatistics && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <i className="fa-solid fa-star text-amber-400"></i>
                      <span>Kundenzufriedenheit & Ticket-Bewertungen</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Auswertung der 1-5 Sterne Bewertungen und Kundenfeedbacks zu gelösten Tickets.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-950/80 border border-amber-500/30 px-4 py-2 rounded-xl flex items-center gap-2.5">
                      <div className="text-2xl font-extrabold text-amber-400">
                        {ratingStatistics.averageRating ? `${ratingStatistics.averageRating}` : '—'}
                      </div>
                      <div className="text-left">
                        <div className="flex gap-0.5 text-amber-400 text-xs">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <i 
                              key={star} 
                              className={`fa-star ${star <= Math.round(ratingStatistics.averageRating || 0) ? 'fa-solid' : 'fa-regular opacity-30'}`}
                            ></i>
                          ))}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                          {ratingStatistics.totalRatings} Bewertung{ratingStatistics.totalRatings === 1 ? '' : 'en'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rating Distribution Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Star Breakdown Bars */}
                  <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Sterne-Verteilung</h4>
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const count = ratingStatistics.breakdown[`stars${stars}`] || 0;
                      const percent = ratingStatistics.totalRatings > 0 ? Math.round((count / ratingStatistics.totalRatings) * 100) : 0;
                      return (
                        <div key={stars} className="flex items-center gap-3 text-xs">
                          <span className="w-14 font-bold text-slate-300 flex items-center gap-1">
                            <span>{stars}</span>
                            <i className="fa-solid fa-star text-amber-400 text-[10px]"></i>
                          </span>
                          <div className="flex-1 bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                            <div 
                              className="bg-amber-400 h-full rounded-full transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                          <span className="w-12 text-right font-mono text-slate-400 text-[11px]">
                            {count} <span className="text-[10px] text-slate-500">({percent}%)</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: Recent Feedbacks */}
                  <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Neueste Kunden-Feedbacks</h4>
                    {ratingStatistics.recentFeedbacks.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4 text-center">Noch keine Kundenfeedbacks eingegangen.</p>
                    ) : (
                      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                        {ratingStatistics.recentFeedbacks.map((fb) => (
                          <div key={fb.id} className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-200 truncate">{fb.title}</span>
                              <div className="flex gap-0.5 text-amber-400 text-[10px] shrink-0">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <i key={s} className={`fa-star ${s <= fb.rating ? 'fa-solid' : 'fa-regular opacity-30'}`}></i>
                                ))}
                              </div>
                            </div>
                            {fb.ratingFeedback && (
                              <p className="text-xs text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-850/80 italic">
                                "{fb.ratingFeedback}"
                              </p>
                            )}
                            <div className="text-[10px] text-slate-500 flex justify-between items-center">
                              <span>{fb.creatorEmail}</span>
                              <span>{parseUtcDate(fb.ratedAt).toLocaleDateString('de-DE')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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

        {/* Tab 7: Missbrauchsmeldungen (Gemeldete Chatverläufe) */}
        {activeTab === 'abusive' && (
          <div className="space-y-6">
            {/* Header & KPI Summary */}
            <div className="bg-slate-900/60 p-5 border border-slate-800 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-lg">
              <div>
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <span className="text-rose-400">🚨</span> Missbrauchserkennung & gemeldete Chats
                </h3>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  Hier finden Sie alle abgebrochenen Gespräche, erkannte Beleidigungen/Trolling und automatisch rekonstruierte digitale Identitätsspuren.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-center shadow-inner">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Gesperrte Chats</span>
                  <span className="text-sm font-bold text-white">{abusiveChats.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('bans')}
                  className="bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 px-3.5 py-2 rounded-xl text-center shadow-inner transition-colors cursor-pointer"
                  title="Zur IP-Sperren-Verwaltung wechseln"
                >
                  <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider block flex items-center gap-1 justify-center">
                    <span>IP-Sperren</span>
                    <i className="fa-solid fa-arrow-right text-[9px]"></i>
                  </span>
                  <span className="text-sm font-bold text-red-300">{ipBansStats.activeBans} aktiv</span>
                </button>
              </div>
            </div>

            {/* Missbrauchsmeldungen Liste */}
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-comments text-violet-400 text-xs"></i>
                  <span>Gemeldete Chatverläufe ({abusiveChats.length})</span>
                </h4>
              </div>

              {isAbusiveLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : abusiveChats.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                  Keine gemeldeten Missbrauchsfälle vorhanden.
                </div>
              ) : (
                abusiveChats.map((chat) => {
                  const isIpCurrentlyBanned = chat.ipBanInfo?.isBanned;

                  return (
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
                              <span className="text-slate-400 flex items-center gap-1.5">
                                IP: <strong className="text-slate-200 font-mono">{chat.userIp}</strong>
                                {isIpCurrentlyBanned ? (
                                  <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-[9px] px-1.5 py-0.2 rounded font-semibold">
                                    🚫 Gesperrt
                                  </span>
                                ) : null}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            {chat.userFingerprint && (
                              isIpCurrentlyBanned && chat.ipBanInfo?.bannedTarget === 'fingerprint' ? (
                                <button
                                  type="button"
                                  onClick={() => handleLiftFingerprintBan(chat.userFingerprint)}
                                  className="bg-emerald-950/50 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 font-bold text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                                  title="Geräte-Sperre für dieses Fingerprint aufheben"
                                >
                                  <i className="fa-solid fa-mobile-screen"></i>
                                  <span>Gerät entsperren</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleQuickBanFingerprint(chat.userFingerprint, 24)}
                                  className="bg-violet-950/60 hover:bg-violet-900/80 text-violet-300 border border-violet-500/30 font-bold text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                                  title="Nutzer-Gerät per Device Fingerprint für 24h sperren (schützt Private Relay IPs)"
                                >
                                  <i className="fa-solid fa-mobile-screen-button"></i>
                                  <span>Gerät (24h) sperren</span>
                                </button>
                              )
                            )}
                            {chat.userIp && (
                              isIpCurrentlyBanned && chat.ipBanInfo?.bannedTarget === 'ip' ? (
                                <button
                                  type="button"
                                  onClick={() => handleLiftBan(chat.userIp)}
                                  className="bg-emerald-950/50 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 font-bold text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                  <i className="fa-solid fa-unlock"></i>
                                  <span>IP entsperren</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleQuickBan(chat.userIp, 24)}
                                  className="bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/30 font-bold text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                                  title="Ganze IP-Adresse sperren"
                                >
                                  <i className="fa-solid fa-ban"></i>
                                  <span>IP (24h) sperren</span>
                                </button>
                              )
                            )}
                            <button
                              onClick={() => handleResolveAbusive(chat.id)}
                              className="bg-slate-950/20 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800/80 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all"
                            >
                              <i className="fa-solid fa-circle-check mr-1.5 text-emerald-500"></i>
                              Als gelöst markieren (Meldung löschen)
                            </button>
                          </div>
                        </div>

                        {/* IP, Fingerprint und Session-ID Infos + rekonstruierte Anmeldungen */}
                        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-850/60 text-[10px] text-slate-500">
                          {chat.userFingerprint && (
                            <div>
                              Device Fingerprint: <span className="font-mono text-violet-300 font-semibold">{chat.userFingerprint}</span>
                            </div>
                          )}
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
                          ) : null}
                        </div>
                      </div>

                      {/* Chatverlauf Context */}
                      <div className="p-5 space-y-4 bg-slate-900/25">
                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Vollständiger Chatverlauf:</p>
                        <div className="space-y-3 max-w-3xl border-l-2 border-red-500/20 pl-4 py-1">
                          {chat.messages.map((ctxMsg, ctxIdx) => {
                            const isUser = ctxMsg.sender === 'user';
                            const prevCtxMsg = ctxIdx > 0 ? chat.messages[ctxIdx - 1] : null;
                            const showDateDivider = !prevCtxMsg || isDifferentDay(ctxMsg.createdAt, prevCtxMsg?.createdAt);
                            
                            return (
                              <div key={ctxIdx} className="space-y-1">
                                {showDateDivider && (
                                  <div className="flex items-center gap-3 py-1.5 justify-center my-1">
                                    <div className="h-px bg-slate-800 flex-1"></div>
                                    <span className="text-[9px] bg-slate-950 border border-slate-800 text-slate-400 font-semibold px-2.5 py-0.5 rounded-full shadow-sm tracking-wide">
                                      {getDateDividerLabel(ctxMsg.createdAt)}
                                    </span>
                                    <div className="h-px bg-slate-800 flex-1"></div>
                                  </div>
                                )}
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
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 8: IP-Sperren & Verwarnungen */}
        {activeTab === 'bans' && (
          <div className="space-y-6">
            {/* Header & KPI Summary */}
            <div className="bg-slate-900/60 p-5 border border-slate-800 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-lg">
              <div>
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <i className="fa-solid fa-ban text-red-400"></i>
                  <span>IP-Sperren & Verwarnungen verwalten</span>
                </h3>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  2-Stufen-Schutz für den Chat: Bei einem 1. Missbrauchs-Verstoß wird das Gespräch beendet und eine formelle Verwarnung registriert. Bei einem 2. Verstoß innerhalb von 24h wird die IP-Adresse automatisch für 24 Stunden für Chateingaben gesperrt (Agenten- und Adminzugang bleiben immer unberührt).
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                <div className="bg-red-950/40 border border-red-500/30 px-3.5 py-2 rounded-xl text-center shadow-inner">
                  <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider block">Aktive IP-Sperren</span>
                  <span className="text-sm font-bold text-red-300">{ipBansStats.activeBans}</span>
                </div>
                <div className="bg-amber-950/40 border border-amber-500/30 px-3.5 py-2 rounded-xl text-center shadow-inner">
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Verwarnungen</span>
                  <span className="text-sm font-bold text-amber-300">{ipBansStats.warnings}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-center shadow-inner">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Gesamt Einträge</span>
                  <span className="text-sm font-bold text-white">{ipBans.length}</span>
                </div>
              </div>
            </div>

            {/* Manuelle IP-Sperre verhängen */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <i className="fa-solid fa-lock text-red-400 text-xs"></i>
                    <span>Manuelle IP-Sperre verhängen</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">Hier können Sie eine beliebige IP-Adresse sofort und gezielt für einen definierten Zeitraum für den Chat sperren.</p>
                </div>
                <button
                  type="button"
                  onClick={loadIpBans}
                  disabled={isBansLoading}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <i className={`fa-solid fa-rotate-right text-[11px] ${isBansLoading ? 'animate-spin' : ''}`}></i>
                  <span>Aktualisieren</span>
                </button>
              </div>

              {/* Formular für manuelle Sperre */}
              <form onSubmit={handleCreateBan} className="bg-slate-950/60 p-4 border border-slate-800/80 rounded-xl flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">IP-Adresse</label>
                  <input
                    type="text"
                    value={newBanIp}
                    onChange={(e) => setNewBanIp(e.target.value)}
                    placeholder="z. B. 10.37.74.212 oder 104.28.225.121"
                    className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs font-mono focus:border-red-500 focus:outline-none"
                    required
                  />
                </div>
                <div className="w-[140px]">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dauer</label>
                  <select
                    value={newBanHours}
                    onChange={(e) => setNewBanHours(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs focus:border-red-500 focus:outline-none"
                  >
                    <option value="24">24 Stunden</option>
                    <option value="48">48 Stunden</option>
                    <option value="168">7 Tage</option>
                    <option value="720">30 Tage</option>
                    <option value="8760">1 Jahr</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Begründung (optional)</label>
                  <input
                    type="text"
                    value={newBanReason}
                    onChange={(e) => setNewBanReason(e.target.value)}
                    placeholder="z. B. Wiederholtes Trolling / Beleidigung"
                    className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs focus:border-red-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCreatingBan || !newBanIp.trim()}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <i className="fa-solid fa-lock text-[11px]"></i>
                  <span>{isCreatingBan ? 'Sperre...' : 'IP jetzt sperren'}</span>
                </button>
              </form>

              {/* Tabelle / Liste der aktiven IP-Sperren & Verwarnungen */}
              {isBansLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : ipBans.length === 0 ? (
                <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-8 text-center text-slate-500 text-xs">
                  Aktuell sind keine IP-Sperren oder Verwarnungen registriert.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                        <th className="py-2.5 px-3">IP / Device Fingerprint</th>
                        <th className="py-2.5 px-3">Status / Typ</th>
                        <th className="py-2.5 px-3">Gesperrt bis</th>
                        <th className="py-2.5 px-3">Letzter Verstoß</th>
                        <th className="py-2.5 px-3">Grund / Details</th>
                        <th className="py-2.5 px-3 text-right">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {ipBans.map((ban) => {
                        const isBanActive = ban.isActiveBan === 1;
                        const isWarningOnly = !isBanActive && ban.warningCount > 0;
                        const isFingerprintBan = !!ban.fingerprint;
                        
                        return (
                          <tr key={ban.id} className="hover:bg-slate-850/40 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-white">
                              <div>{ban.ip && ban.ip !== '0.0.0.0' ? ban.ip : 'Geräte-Sperre'}</div>
                              {ban.fingerprint && (
                                <div className="text-[10px] text-violet-300 font-normal">
                                  <span>📱 {ban.fingerprint}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {isBanActive ? (
                                <span className={`border px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1 ${
                                  isFingerprintBan ? 'bg-violet-500/20 text-violet-300 border-violet-500/40' : 'bg-red-500/20 text-red-300 border-red-500/40'
                                }`}>
                                  <span>{isFingerprintBan ? '📱' : '🚫'}</span> {isFingerprintBan ? 'Geräte-Sperre aktiv' : '24h-IP-Sperre aktiv'}
                                </span>
                              ) : isWarningOnly ? (
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                  <span>⚠️</span> 1. Verwarnung
                                </span>
                              ) : (
                                <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px]">
                                  Abgelaufen
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              {ban.bannedUntil ? (
                                <span className="text-red-300 font-mono text-[11px]">
                                  {parseUtcDate(ban.bannedUntil).toLocaleString('de-DE')} Uhr
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                              {parseUtcDate(ban.lastViolationAt).toLocaleString('de-DE')} Uhr
                            </td>
                            <td className="py-2.5 px-3 text-slate-350 max-w-xs truncate text-[11px]" title={ban.reason || ''}>
                              {ban.reason || 'Keine Angabe'}
                              {ban.userEmail && <span className="text-slate-500 block text-[10px]">E-Mail: {ban.userEmail}</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                              {!isBanActive && (
                                ban.fingerprint ? (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickBanFingerprint(ban.fingerprint, 24)}
                                    className="bg-violet-950/60 hover:bg-violet-900/80 text-violet-300 border border-violet-500/30 font-semibold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                                    title="Gerät jetzt für 24h sperren"
                                  >
                                    + 24h Gerät
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickBan(ban.ip, 24)}
                                    className="bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/30 font-semibold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                                    title="IP jetzt für 24h sperren"
                                  >
                                    + 24h IP
                                  </button>
                                )
                              )}
                              <button
                                type="button"
                                onClick={() => ban.fingerprint ? handleLiftFingerprintBan(ban.fingerprint) : handleLiftBan(ban.ip)}
                                className="bg-slate-800 hover:bg-emerald-900/60 text-slate-300 hover:text-emerald-200 border border-slate-700 hover:border-emerald-500/40 font-semibold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                                title="Sperre / Verwarnung aufheben"
                              >
                                <i className="fa-solid fa-unlock mr-1 text-[9px]"></i>
                                Aufheben
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 9: ProxyCheck.io IP-Sicherheit */}
        {activeTab === 'proxycheck' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <form onSubmit={handleSaveSettings} className="space-y-6">
            {settingsSuccess && (
              <div className="bg-emerald-950 border border-emerald-500 text-emerald-200 text-xs p-3 rounded-xl flex items-center gap-2 shadow-lg animate-fade-in">
                <i className="fa-solid fa-circle-check text-emerald-400 text-base"></i>
                <span>ProxyCheck.io Einstellungen erfolgreich gespeichert!</span>
              </div>
            )}

            {settingsError && (
              <div className="bg-red-950 border border-red-500 text-red-200 text-xs p-3 rounded-xl flex items-center gap-2 shadow-lg animate-fade-in">
                <i className="fa-solid fa-circle-xmark text-red-400 text-base"></i>
                <span>{settingsError}</span>
              </div>
            )}

            {/* ProxyCheck.io IP-Sicherheitskonfiguration */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <i className="fa-solid fa-shield-halved text-emerald-400 text-lg"></i>
                    <span>ProxyCheck.io IP-Sicherheit & Anonymisierungs-Schutz</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Schützt den Schul-Chat vor unerwünschten Zugriffen über VPNs, TOR-Netzwerke, Proxies und auffällige IP-Adressen.
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1 rounded-full border shrink-0 ${proxycheckConfig.enabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                  {proxycheckConfig.enabled ? '● Schutz aktiv' : '○ Deaktiviert'}
                </span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-2.5 text-xs text-slate-300">
                <p className="font-semibold text-white flex items-center gap-2">
                  <i className="fa-solid fa-circle-info text-sky-400"></i>
                  <span>Funktionsweise & Intelligentes Kontingent-Management:</span>
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-400 text-xs leading-relaxed">
                  <li><strong>30-Tage-Cache:</strong> Jede geprüfte IP-Adresse wird für 30 Tage in der lokalen Datenbank (<code>proxycheck_cache</code>) gespeichert. Dadurch verbraucht jeder Nutzer maximal 1 einzige API-Abfrage pro Monat.</li>
                  <li><strong>Staff-Bypass:</strong> Support-Agenten und Administratoren sind automatisch vom Filter ausgenommen (kein Aussperren bei VPN-Nutzung von zu Hause).</li>
                  <li><strong>Schulnetz-Bypass:</strong> Lokale und private IP-Adressen (z. B. <code>10.x.x.x</code>, <code>192.168.x.x</code>, <code>172.16-31.x.x</code>) werden ohne externen API-Call sofort durchgelassen.</li>
                </ul>
              </div>

              {/* Master Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div>
                  <strong className="text-xs sm:text-sm text-white block">ProxyCheck.io Sicherheitsprüfung aktivieren</strong>
                  <span className="text-xs text-slate-400">Blockiert Chatzugriffe von anonymisierenden Diensten basierend auf den gewählten Filterregeln.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={proxycheckConfig.enabled || false}
                    onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* API Key & Test Button */}
              <div className="space-y-3">
                <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider">ProxyCheck.io API Key</label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <input 
                      type={showProxycheckKey ? 'text' : 'password'}
                      value={proxycheckConfig.apiKey || ''}
                      onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, apiKey: e.target.value })}
                      placeholder="z. B. 123456-abcdef-789012-ghijkl"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono pr-9 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowProxycheckKey(!showProxycheckKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                      title={showProxycheckKey ? 'Verbergen' : 'Anzeigen'}
                    >
                      <i className={`fa-solid ${showProxycheckKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestProxycheck}
                    disabled={testProxycheckLoading}
                    className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-40 cursor-pointer"
                  >
                    {testProxycheckLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                        <span>Prüfe...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-vial-circle-check text-xs"></i>
                        <span>Verbindung & Kontingent testen</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Test Result Feedback */}
                {testProxycheckResult && (
                  <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 animate-fade-in ${testProxycheckResult.success ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' : 'bg-red-950/40 border-red-500/30 text-red-200'}`}>
                    <i className={`fa-solid text-base mt-0.5 shrink-0 ${testProxycheckResult.success ? 'fa-circle-check text-emerald-400' : 'fa-circle-xmark text-red-400'}`}></i>
                    <div className="space-y-1.5 text-left w-full">
                      {testProxycheckResult.success ? (
                        <>
                          <strong className="block text-emerald-300 font-bold text-xs">Verbindung zu ProxyCheck.io erfolgreich!</strong>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs text-slate-300">
                            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                              <strong className="text-emerald-400 text-xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                <span>Aktiv ({testProxycheckResult.status?.toUpperCase()})</span>
                              </strong>
                            </div>
                            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Tarif</span>
                              <strong className="text-white text-xs truncate block" title={testProxycheckResult.plan}>{testProxycheckResult.plan}</strong>
                            </div>
                            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Tageslimit</span>
                              <strong className="text-white text-xs">{testProxycheckResult.dailyLimit} Abfragen</strong>
                            </div>
                            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Antwortzeit</span>
                              <strong className="text-sky-300 text-xs font-mono">{testProxycheckResult.queryTime}</strong>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <strong className="block text-red-300 font-bold text-xs">Verbindungsprüfung fehlgeschlagen</strong>
                          <span className="text-xs text-slate-300">{testProxycheckResult.error}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Blocking Rules Toggles */}
              <div className="space-y-3.5 border-t border-slate-800/80 pt-4">
                <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider">Gesperrte Kategorien & Filterregeln</label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-950 transition-colors">
                    <input 
                      type="checkbox"
                      checked={proxycheckConfig.blockVpn !== false}
                      onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, blockVpn: e.target.checked })}
                      className="rounded border-slate-800 text-emerald-600 bg-transparent focus:ring-0 focus:ring-offset-0"
                    />
                    <div className="text-left">
                      <span className="text-xs font-semibold text-slate-200 block">VPN-Dienste blockieren</span>
                      <span className="text-[11px] text-slate-500 block">z. B. NordVPN, Mullvad, ProtonVPN, Cloudflare WARP</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-950 transition-colors">
                    <input 
                      type="checkbox"
                      checked={proxycheckConfig.blockTor !== false}
                      onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, blockTor: e.target.checked })}
                      className="rounded border-slate-800 text-emerald-600 bg-transparent focus:ring-0 focus:ring-offset-0"
                    />
                    <div className="text-left">
                      <span className="text-xs font-semibold text-slate-200 block">TOR-Netzwerk blockieren</span>
                      <span className="text-[11px] text-slate-500 block">Anonyme TOR Exit-Nodes und Onion-Router</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-950 transition-colors">
                    <input 
                      type="checkbox"
                      checked={proxycheckConfig.blockProxy !== false}
                      onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, blockProxy: e.target.checked })}
                      className="rounded border-slate-800 text-emerald-600 bg-transparent focus:ring-0 focus:ring-offset-0"
                    />
                    <div className="text-left">
                      <span className="text-xs font-semibold text-slate-200 block">Public / SOCKS / HTTP Proxies</span>
                      <span className="text-[11px] text-slate-500 block">Öffentliche Web-Proxies & SOCKS4/5 Server</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-950 transition-colors">
                    <input 
                      type="checkbox"
                      checked={proxycheckConfig.blockCompromised !== false}
                      onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, blockCompromised: e.target.checked })}
                      className="rounded border-slate-800 text-emerald-600 bg-transparent focus:ring-0 focus:ring-offset-0"
                    />
                    <div className="text-left">
                      <span className="text-xs font-semibold text-slate-200 block">Kompromittierte IPs blockieren</span>
                      <span className="text-[11px] text-slate-500 block">Bekannte Botnets, Malware-Hosts & auffällige Server (oft auch geteilte VPN-IPs)</span>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                  <div>
                    <label className="text-[11px] text-slate-400 font-bold block mb-1">Mindest-Risikobewertung (Risk Score 0–100)</label>
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      value={proxycheckConfig.minRiskScore ?? 67}
                      onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, minRiskScore: parseInt(e.target.value, 10) || 67 })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1">Standard: 67 (ab 67 gelten IPs als stark verdächtig)</span>
                  </div>

                  <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-[11px] text-slate-400 font-bold block mb-1">IP-Whitelist (Ausnahmen)</label>
                      <input 
                        type="text"
                        value={proxycheckConfig.whitelistedIps || ''}
                        onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, whitelistedIps: e.target.value })}
                        placeholder="z. B. 192.168.1.50, 10.20.30.40 (kommagetrennt)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">Diese IP-Adressen werden immer ohne ProxyCheck-Abfrage durchgelassen.</span>
                    </div>

                    <div className="bg-sky-950/20 border border-sky-500/20 rounded-xl p-3.5 space-y-2">
                      <div className="flex flex-wrap justify-between items-center gap-1.5">
                        <label className="text-[11px] text-sky-400 font-bold block flex items-center gap-1.5">
                          <i className="fa-solid fa-shield-halved text-xs"></i>
                          <span>AS-Nummern Whitelist (Apple Private Relay / Provider)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const defaultAsns = 'AS13335, AS54113, AS20940, AS396982, AS714, AS13414, AS36040';
                            setProxycheckConfig(prev => {
                              const current = (prev.whitelistedAsns || '').trim();
                              if (!current) return { ...prev, whitelistedAsns: defaultAsns };
                              const tokens = current.split(/[\n,;\s]+/).map(t => t.trim()).filter(Boolean);
                              const defaults = defaultAsns.split(', ');
                              defaults.forEach(d => { if (!tokens.includes(d)) tokens.push(d); });
                              return { ...prev, whitelistedAsns: tokens.join(', ') };
                            });
                          }}
                          className="text-[10px] text-sky-300 hover:text-white bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 px-2 py-0.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <i className="fa-solid fa-wand-magic-sparkles text-[9px]"></i>
                          <span>+ Apple Private Relay Standard-ASNs</span>
                        </button>
                      </div>
                      <textarea 
                        rows={2}
                        value={proxycheckConfig.whitelistedAsns || ''}
                        onChange={(e) => setProxycheckConfig({ ...proxycheckConfig, whitelistedAsns: e.target.value })}
                        placeholder="z. B. AS13335, AS54113, AS20940, AS396982 (kommagetrennt oder pro Zeile)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 block">
                        Erlaubt Zugriffe von diesen Autonomen Systemen (AS), selbst bei hohem Risk Score oder aktivem VPN. Perfekt für Apple Private Relay (Cloudflare AS13335, Fastly AS54113, Akamai AS20940).
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-4 flex justify-end">
                <button 
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <i className="fa-solid fa-floppy-disk text-xs"></i>
                  <span>ProxyCheck-Einstellungen speichern</span>
                </button>
              </div>
            </div>
          </form>

          {/* Gecachte IP-Adressen (30-Tage Cache) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-database text-violet-400 text-lg"></i>
                  <span>Gecachte IP-Adressen (30-Tage Cache)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Übersicht aller analysierten Client-IPs. Nach 30 Tagen verfällt ein Eintrag automatisch und wird bei erneuter Chateingabe frisch validiert.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={loadProxycheckCache}
                  disabled={isProxycheckCacheLoading}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <i className={`fa-solid fa-rotate-right text-[11px] ${isProxycheckCacheLoading ? 'animate-spin' : ''}`}></i>
                  <span>Aktualisieren</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleClearCache('expired')}
                  disabled={isProxycheckCacheLoading}
                  className="bg-slate-800 hover:bg-slate-750 text-amber-300 hover:text-amber-200 border border-amber-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Löscht alle Einträge, deren 30-Tage-Ablaufdatum überschritten ist"
                >
                  <i className="fa-solid fa-broom text-[11px]"></i>
                  <span>Abgelaufene löschen</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleClearCache('all')}
                  disabled={isProxycheckCacheLoading}
                  className="bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Leert den gesamten Cache"
                >
                  <i className="fa-solid fa-trash-can text-[11px]"></i>
                  <span>Cache leeren</span>
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl text-center">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Gecachte IPs</span>
                <span className="text-sm sm:text-base font-bold text-white">{proxycheckCacheStats.total}</span>
              </div>
              <div className="bg-red-950/30 border border-red-500/20 p-3 rounded-xl text-center">
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider block">VPN & Proxies</span>
                <span className="text-sm sm:text-base font-bold text-red-300">{proxycheckCacheStats.proxies}</span>
              </div>
              <div className="bg-emerald-950/30 border border-emerald-500/20 p-3 rounded-xl text-center">
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">Regulär / Sauber</span>
                <span className="text-sm sm:text-base font-bold text-emerald-300">{proxycheckCacheStats.clean}</span>
              </div>
              <div className="bg-amber-950/30 border border-amber-500/20 p-3 rounded-xl text-center">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Hohes Risiko (≥67)</span>
                <span className="text-sm sm:text-base font-bold text-amber-300">{proxycheckCacheStats.highRisk}</span>
              </div>
              <div className="bg-sky-950/30 border border-sky-500/20 p-3 rounded-xl text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider block">AS Whitelisted</span>
                <span className="text-sm sm:text-base font-bold text-sky-300">{proxycheckCacheStats.asnWhitelisted || 0}</span>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                <input
                  type="text"
                  value={proxycheckCacheSearch}
                  onChange={(e) => setProxycheckCacheSearch(e.target.value)}
                  placeholder="Suche nach IP, ASN (z. B. AS13335), Provider, Land..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                />
                {proxycheckCacheSearch && (
                  <button
                    type="button"
                    onClick={() => setProxycheckCacheSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setProxycheckCacheFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    proxycheckCacheFilter === 'all' ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Alle ({proxycheckCache.length})
                </button>
                <button
                  type="button"
                  onClick={() => setProxycheckCacheFilter('proxies')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    proxycheckCacheFilter === 'proxies' ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  VPN & Proxies ({proxycheckCacheStats.proxies})
                </button>
                <button
                  type="button"
                  onClick={() => setProxycheckCacheFilter('clean')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    proxycheckCacheFilter === 'clean' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sauber ({proxycheckCacheStats.clean})
                </button>
                <button
                  type="button"
                  onClick={() => setProxycheckCacheFilter('high_risk')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    proxycheckCacheFilter === 'high_risk' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Risiko ≥ 67 ({proxycheckCacheStats.highRisk})
                </button>
                <button
                  type="button"
                  onClick={() => setProxycheckCacheFilter('asn_whitelisted')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    proxycheckCacheFilter === 'asn_whitelisted' ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  AS Whitelisted ({proxycheckCacheStats.asnWhitelisted || 0})
                </button>
              </div>
            </div>

            {/* Cache Table */}
            {isProxycheckCacheLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredProxycheckCache.length === 0 ? (
              <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-8 text-center text-slate-500 text-xs">
                {proxycheckCache.length === 0 
                  ? 'Der ProxyCheck-Cache ist noch leer. Sobald Nutzer den Chat besuchen, werden deren IP-Bewertungen hier gespeichert.'
                  : 'Keine Cache-Einträge gefunden, die den gewählten Filterkriterien entsprechen.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2.5 px-3">IP-Adresse</th>
                      <th className="py-2.5 px-3">Erkannter Typ / Status</th>
                      <th className="py-2.5 px-3">Risk Score</th>
                      <th className="py-2.5 px-3">Land / Provider / AS</th>
                      <th className="py-2.5 px-3">Geprüft am</th>
                      <th className="py-2.5 px-3">Gültig bis</th>
                      <th className="py-2.5 px-3 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredProxycheckCache.map((item) => {
                      const isHighRisk = item.riskScore >= 67;
                      const isMediumRisk = item.riskScore >= 34 && item.riskScore < 67;
                      const isVpn = item.proxyType && item.proxyType.toLowerCase().includes('vpn');
                      const isTor = item.proxyType && item.proxyType.toLowerCase().includes('tor');
                      const isProxy = item.isProxy === 1;
                      const isAsnAllowed = item.isAsnWhitelisted;

                      return (
                        <tr key={item.ip} className="hover:bg-slate-850/40 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${isAsnAllowed ? 'bg-sky-400' : isProxy || isHighRisk ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
                              <span className="font-mono font-bold text-white">{item.ip}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isAsnAllowed ? (
                                <span className="bg-sky-500/20 text-sky-300 border border-sky-500/40 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                  <span>🍎</span> AS Whitelisted
                                </span>
                              ) : isTor ? (
                                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                  <span>🧅</span> TOR Node
                                </span>
                              ) : isVpn ? (
                                <span className="bg-red-500/20 text-red-300 border border-red-500/40 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                  <span>🔒</span> VPN
                                </span>
                              ) : isProxy ? (
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                  <span>🌐</span> {item.proxyType || 'Proxy'}
                                </span>
                              ) : (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                  <span>🛡️</span> {item.proxyType || 'Regulär'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold font-mono text-[11px] ${
                                isAsnAllowed ? 'text-sky-300' : isHighRisk ? 'text-red-400' : isMediumRisk ? 'text-amber-400' : 'text-emerald-400'
                              }`}>
                                {item.riskScore}
                              </span>
                              <span className="text-[10px] text-slate-500">/ 100</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate text-[11px]" title={`${item.country || 'Unbekannt'} - ${item.provider || 'Unbekannt'} ${item.asn ? `(${item.asn})` : ''}`}>
                            <span className="font-semibold text-white block truncate">{item.country || 'Unbekannt'} {item.isocode ? `(${item.isocode})` : ''}</span>
                            <span className="text-slate-400 text-[10px] block truncate">{item.provider || 'Unbekannt'} {item.asn ? `• ${item.asn}` : ''}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                            {parseUtcDate(item.checkedAt).toLocaleString('de-DE')} Uhr
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`text-[11px] font-mono ${item.isValid ? 'text-slate-300' : 'text-amber-400'}`}>
                              {parseUtcDate(item.expiresAt).toLocaleDateString('de-DE')}
                            </span>
                            {!item.isValid && (
                              <span className="text-[9px] text-amber-400 block">Abgelaufen</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleTransferToWhitelist(item.ip)}
                              className="bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/60 font-semibold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                              title="IP auf die Whitelist übertragen (wird nie wieder blockiert)"
                            >
                              <i className="fa-solid fa-plus text-[9px]"></i>
                              <span>IP Whitelist</span>
                            </button>
                            {item.asn && (
                              <button
                                type="button"
                                onClick={() => handleTransferToWhitelistAsn(item.asn)}
                                className="bg-sky-950/60 hover:bg-sky-900/80 text-sky-300 border border-sky-500/30 hover:border-sky-500/60 font-semibold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                                title={`AS-Nummer ${item.asn} whitelisten (z. B. für Apple Private Relay)`}
                              >
                                <i className="fa-solid fa-shield-halved text-[9px]"></i>
                                <span>AS Whitelist</span>
                              </button>
                            )}
                            {item.rawResponse && (
                              <button
                                type="button"
                                onClick={() => setSelectedRawResponse(item)}
                                className="bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 font-semibold text-[10px] px-2 py-1 rounded-lg transition-all cursor-pointer"
                                title="Rohdaten / JSON ansehen"
                              >
                                <i className="fa-solid fa-code text-[9px]"></i>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteCacheIp(item.ip)}
                              className="bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-300 border border-slate-700 hover:border-red-500/30 font-semibold text-[10px] px-2 py-1 rounded-lg transition-all cursor-pointer"
                              title="Aus dem Cache löschen"
                            >
                              <i className="fa-solid fa-trash text-[9px]"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}
      </main>
      </div>

      {/* ProxyCheck Raw JSON Modal Overlay */}
      {selectedRawResponse && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md p-4 flex items-center justify-center animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-code text-violet-400 text-base"></i>
                <h4 className="text-sm font-bold text-white">ProxyCheck Rohdaten: {selectedRawResponse.ip}</h4>
              </div>
              <button
                onClick={() => setSelectedRawResponse(null)}
                className="text-slate-400 hover:text-white text-base px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-slate-300 bg-slate-950/80">
              <pre className="whitespace-pre-wrap leading-relaxed">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedRawResponse.rawResponse), null, 2);
                  } catch (e) {
                    return selectedRawResponse.rawResponse || 'Keine Rohdaten vorhanden.';
                  }
                })()}
              </pre>
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-between items-center">
              <span className="text-[11px] text-slate-400">
                Geprüft am: {parseUtcDate(selectedRawResponse.checkedAt).toLocaleString('de-DE')} Uhr
              </span>
              <button
                type="button"
                onClick={() => setSelectedRawResponse(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Loading Overlay für Chat-in-Ticket Übertragung */}
      {isConvertingTicket && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-4 animate-fade-in">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin"></div>
            <i className="fa-solid fa-ticket text-violet-400 text-xl absolute"></i>
          </div>
          <div className="text-center space-y-1">
            <h4 className="text-base font-bold text-white">Chat wird in Ticket übertragen...</h4>
            <p className="text-xs text-slate-400 font-medium">Verlauf, Anhang-Dateien & Zuweisung werden übertragen. Bitte einen Moment Geduld.</p>
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

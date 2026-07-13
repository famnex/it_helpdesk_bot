'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminDashboardPage() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge', 'import', 'settings', 'update'
  const router = useRouter();

  // Knowledge States
  const [knowledge, setKnowledge] = useState([]);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [editingChunk, setEditingChunk] = useState(null); // Chunk being edited
  const [isCreatingChunk, setIsCreatingChunk] = useState(false);
  const [chunkTitle, setChunkTitle] = useState('');
  const [chunkFact, setChunkFact] = useState('');
  const [chunkDescription, setChunkDescription] = useState('');
  const [chunkCategory, setChunkCategory] = useState('');
  const [chunkError, setChunkError] = useState('');
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [adminSelectedCategory, setAdminSelectedCategory] = useState('Alle');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  // Users States
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  
  // Import States
  const [importUrl, setImportUrl] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [importChunksList, setImportChunksList] = useState([]);

  // Settings States
  const [smtpConfig, setSmtpConfig] = useState({ host: '', port: 1025, user: '', pass: '', secure: false, sender: '' });
  const [idpConfig, setIdpConfig] = useState({ jwtSecret: '', redirectUrl: '', logoutText: '' });
  const [githubConfig, setGithubConfig] = useState({ repoUrl: '', branch: '' });
  const [geminiConfig, setGeminiConfig] = useState({ apiKey: '', chatModel: '', extractionModel: '' });
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [logoutLabel, setLogoutLabel] = useState('Abmelden');

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
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // --- Knowledge CRUD ---
  const handleSaveChunk = async (e) => {
    e.preventDefault();
    setChunkError('');
    const url = editingChunk ? `/api/admin/knowledge/${editingChunk.id}` : '/api/admin/knowledge';
    const method = editingChunk ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: chunkTitle, fact: chunkFact, description: chunkDescription, category: chunkCategory })
      });

      const data = await res.json();
      
      if (res.ok) {
        setChunkTitle('');
        setChunkFact('');
        setChunkDescription('');
        setChunkCategory('');
        setEditingChunk(null);
        setIsCreatingChunk(false);
        loadAllData();
      } else {
        setChunkError(data.message || data.error || 'Fehler beim Speichern.');
      }
    } catch (err) {
      setChunkError('Verbindungsfehler beim Speichern.');
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

  // Filtered knowledge chunks
  const filteredKnowledge = knowledge.filter(k => {
    const matchesSearch = k.title.toLowerCase().includes(knowledgeSearch.toLowerCase()) ||
      k.fact.toLowerCase().includes(knowledgeSearch.toLowerCase());
    const matchesCategory = adminSelectedCategory === 'Alle' || (k.category || 'Sonstiges') === adminSelectedCategory;
    return matchesSearch && matchesCategory;
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
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-lg z-20 relative">
        <div className="flex items-center gap-3">
          <div className="bg-violet-600 text-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
            <i className="fa-solid fa-gears text-xl"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-white">System-Administration</h1>
            <p className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">Verwaltungs-Bereich</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
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
            className="bg-slate-850 hover:bg-slate-800 text-slate-350 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all"
          >
            <i className="fa-solid fa-ticket mr-1.5"></i>
            Agenten-Portal
          </Link>

          <button 
            onClick={handleLogout}
            className="text-xs text-red-400 hover:bg-red-950/30 border border-red-500/20 px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>{logoutLabel}</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 flex overflow-x-auto gap-4 scrollbar-none shrink-0">
        <button 
          onClick={() => setActiveTab('knowledge')}
          className={`py-4 px-2 border-b-2 font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-2 ${activeTab === 'knowledge' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <i className="fa-solid fa-brain"></i>
          <span>Wissensdatenbank</span>
        </button>
        <button 
          onClick={() => setActiveTab('import')}
          className={`py-4 px-2 border-b-2 font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-2 ${activeTab === 'import' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <i className="fa-solid fa-cloud-arrow-up"></i>
          <span>KI-Import</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`py-4 px-2 border-b-2 font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-2 ${activeTab === 'settings' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <i className="fa-solid fa-sliders"></i>
          <span>Einstellungen</span>
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={`py-4 px-2 border-b-2 font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-2 ${activeTab === 'users' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <i className="fa-solid fa-users"></i>
          <span>Benutzerverwaltung</span>
        </button>
        <button 
          onClick={() => setActiveTab('update')}
          className={`py-4 px-2 border-b-2 font-semibold text-xs transition-all uppercase tracking-wider flex items-center gap-2 ${activeTab === 'update' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <i className="fa-brands fa-github"></i>
          <span>System-Update</span>
        </button>
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
                  placeholder="Wissen durchsuchen..."
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
                  setIsCreatingChunk(true);
                }}
                className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
              >
                <i className="fa-solid fa-plus"></i>
                <span>Wissen anlegen</span>
              </button>
            </div>

            {/* Category Tabs */}
            {knowledge.length > 0 && (
              <div className="flex bg-slate-900/40 p-1.5 border border-slate-800/60 rounded-xl overflow-x-auto gap-2 text-[10px] font-bold scrollbar-none">
                {['Alle', ...new Set(knowledge.map(k => k.category || 'Sonstiges'))].map(cat => (
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
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">Titel / Problembeschreibung</label>
                      <input 
                        type="text" 
                        value={chunkTitle}
                        onChange={(e) => setChunkTitle(e.target.value)}
                        placeholder="z.B. Drucker-Fehler Papierstau"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">Fakt / Konkrete Lösung (Kurz-Info für Bot-Chat)</label>
                      <textarea 
                        value={chunkFact}
                        onChange={(e) => setChunkFact(e.target.value)}
                        placeholder="z.B. Campus-WiFi Passwort ist Campus2026!."
                        rows="2"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                        required
                      />
                    </div>
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
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400 font-bold block">Umfassende Beschreibung / Anleitung (Für öffentliche Wissensdatenbank - Markdown möglich)</label>
                        <button
                          type="button"
                          onClick={handleGenerateDescription}
                          disabled={isGeneratingDesc || !chunkTitle.trim() || !chunkFact.trim()}
                          className="bg-sky-650/20 hover:bg-sky-600 hover:text-white text-sky-400 text-[9px] font-bold px-2 py-0.5 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {isGeneratingDesc ? 'Generiere...' : 'KI-Beschreibung generieren'}
                        </button>
                      </div>
                      <textarea 
                        value={chunkDescription}
                        onChange={(e) => setChunkDescription(e.target.value)}
                        placeholder="Ausführliche Schritt-für-Schritt-Anleitung..."
                        rows="5"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
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
                        setChunkError('');
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2 rounded-xl transition-all"
                    >
                      Abbrechen
                    </button>
                    <button 
                      type="submit"
                      className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all"
                    >
                      Speichern
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
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Kurz-Info (Bot):</div>
                      <p className="text-xs text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800/40 leading-relaxed font-sans">{k.fact}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

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

            {usersLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : usersList.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                Keine Benutzer registriert.
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
                        <th className="px-6 py-4">Registriert</th>
                        <th className="px-6 py-4 text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {usersList.map((usr) => (
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
      </main>

    </div>
  );
}

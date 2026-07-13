'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' | 'error'
  const router = useRouter();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Fehler beim Laden des Profils.');
      }
      const data = await res.json();
      setProfile(data.profile);
      setName(data.profile.name || '');
    } catch (err) {
      setMessage({ text: err.message || 'Ladefehler', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ text: 'Bitte einen Namen eingeben.', type: 'error' });
      return;
    }

    setIsSavingName(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Speichern des Namens.');
      }

      setMessage({ text: 'Name erfolgreich aktualisiert.', type: 'success' });
      // Profil neu laden
      loadProfile();
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleUploadAvatar = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // Dateityp prüfen
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setMessage({ text: 'Ungültiges Dateiformat. Erlaubt sind JPG, PNG, GIF und WEBP.', type: 'error' });
      return;
    }

    // Dateigröße validieren (max 2 MB)
    if (selectedFile.size > 2 * 1024 * 1024) {
      setMessage({ text: 'Die Datei ist zu groß (maximal 2 MB).', type: 'error' });
      return;
    }

    setIsUploading(true);
    setMessage({ text: '', type: '' });

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/profile/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Upload des Profilbilds.');
      }

      const data = await res.json();
      setMessage({ text: 'Profilbild erfolgreich aktualisiert.', type: 'success' });
      // Profil neu laden, um das neue Bild anzuzeigen
      loadProfile();
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center flex-col gap-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Lade Profil...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-lg z-20 relative">
        <div className="flex items-center gap-3">
          <div className="bg-violet-600 text-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
            <i className="fa-solid fa-user-circle text-xl"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Mein Profil</h1>
            <p className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">Benutzereinstellungen</p>
          </div>
        </div>

        <div>
          <Link
            href="/agent"
            className="bg-slate-850 hover:bg-slate-800 text-slate-350 border border-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-arrow-left"></i>
            Agenten-Portal
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-6 md:p-8 overflow-y-auto flex flex-col justify-center">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden">
          {/* Glassmorphism Background Accent */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-sky-600/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* Profile Overview Banner */}
          <div className="flex flex-col items-center text-center space-y-4 pb-6 border-b border-slate-800">
            {/* Avatar Upload Container */}
            <div className="relative group cursor-pointer">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt="Avatar"
                  className="w-24 h-24 rounded-full object-cover border-2 border-violet-500 shadow-xl transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-750 text-3xl text-slate-400 shadow-xl group-hover:scale-105 transition-transform">
                  <i className="fa-solid fa-user"></i>
                </div>
              )}

              {/* Upload Overlay on Hover */}
              <label className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                <i className="fa-solid fa-camera text-base mb-1"></i>
                <span className="text-[9px] font-bold uppercase">Ändern</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.gif,.webp"
                  onChange={handleUploadAvatar}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>

              {/* Loading Indicator */}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 rounded-full text-white">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold text-white">{profile?.name || 'Name nicht eingerichtet'}</h2>
              <p className="text-xs text-slate-450 mt-0.5">{profile?.email}</p>
              <div className="mt-2.5">
                <span className="text-[9px] font-bold text-violet-400 bg-violet-600/10 px-2.5 py-1 rounded-full uppercase border border-violet-500/15 tracking-wider">
                  Rolle: {profile?.role === 'admin' ? 'Administrator' : 'Support-Agent'}
                </span>
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {message.text && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 animate-fade-in ${
                message.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-250'
                  : 'bg-red-950/50 border-red-500/40 text-red-200'
              }`}
            >
              <i className={`fa-solid ${message.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
              <span>{message.text}</span>
            </div>
          )}

          {/* Form to Update Profile Name */}
          <form onSubmit={handleSaveName} className="space-y-4">
            <div>
              <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block mb-1.5">Anzeigename</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dein Anzeigename"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 transition-colors placeholder-slate-600"
              />
            </div>

            <div className="pt-2 flex justify-between items-center">
              <span className="text-[10px] text-slate-500 font-medium">
                Registriert seit: {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('de-DE') : 'Unbekannt'}
              </span>
              <button
                type="submit"
                disabled={isSavingName}
                className="bg-violet-600 hover:bg-violet-750 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingName ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Speichere...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-floppy-disk"></i>
                    <span>Speichern</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

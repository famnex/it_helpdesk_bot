'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [jwtSecret, setJwtSecret] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Prüfen, ob das Setup bereits abgeschlossen ist
    fetch('/api/setup')
      .then(res => res.json())
      .then(data => {
        if (!data.setupRequired) {
          router.push('/login');
        } else {
          setIsChecking(false);
          generateRandomSecret();
        }
      })
      .catch(() => {
        setError('Verbindung zum Server fehlgeschlagen.');
        setIsChecking(false);
      });
  }, []);

  const generateRandomSecret = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+=-';
    let secret = '';
    for (let i = 0; i < 48; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setJwtSecret(secret);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          jwtSecret: jwtSecret.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fehler bei der Einrichtung.');
      }

      // Bei Erfolg leiten wir direkt zum Admin-Dashboard weiter,
      // da die POST-Route die Session bereits im Cookie abgelegt hat.
      router.push('/admin');
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-100">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-semibold tracking-wide text-slate-400">Prüfe Installationsstatus...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 text-slate-100 p-6 relative overflow-hidden">
      {/* Hintergrund-Dekoration */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>

      <div className="max-w-lg w-full bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-800/80 overflow-hidden animate-fade-in relative z-10">
        {/* Header */}
        <div className="p-8 bg-slate-950/40 border-b border-slate-800/60 text-center relative">
          <div className="w-16 h-16 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl mx-auto mb-4 shadow-lg shadow-violet-500/20">
            <i className="fa-solid fa-gears animate-pulse"></i>
          </div>
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
            IT-Helpdesk initialisieren
          </h2>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
            Willkommen bei deinem neuen IT-Support-Portal. Richte das System ein, indem du das erste Administrator-Konto anlegst.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-950/40 border border-red-500/30 text-red-200 text-xs p-4 rounded-xl flex items-start gap-3 animate-shake">
              <i className="fa-solid fa-triangle-exclamation text-red-500 mt-0.5 shrink-0"></i>
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-[10px] text-slate-400 font-bold tracking-wider block mb-2 uppercase">
                Admin E-Mail-Adresse <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <i className="fa-solid fa-envelope text-xs"></i>
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@deine-schule.de"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 font-bold tracking-wider block mb-2 uppercase">
                Admin Name (optional)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <i className="fa-solid fa-user text-xs"></i>
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Max Mustermann"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] text-slate-400 font-bold tracking-wider block uppercase">
                  JWT Secret (für Signaturprüfung)
                </label>
                <button
                  type="button"
                  onClick={generateRandomSecret}
                  className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors uppercase"
                >
                  <i className="fa-solid fa-rotate mr-1"></i> Generieren
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <i className="fa-solid fa-key text-xs"></i>
                </span>
                <input
                  type="text"
                  value={jwtSecret}
                  onChange={(e) => setJwtSecret(e.target.value)}
                  placeholder="Zufälliges JWT-Secret für sichere Sitzungssignierung..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all font-mono"
                />
              </div>
              <p className="text-[9px] text-slate-500 mt-1.5 leading-normal">
                Wird verwendet, um Sessions abzusichern. Sollte geheim gehalten werden. Standardmäßig wurde bereits ein sicherer, zufälliger Schlüssel generiert.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl font-semibold text-xs tracking-wider uppercase transition-all shadow-lg shadow-violet-600/10 hover:shadow-violet-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Richte System ein...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-circle-check"></i>
                  <span>Setup fertigstellen & Einloggen</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 bg-slate-950/20 rounded-2xl border border-slate-800/40 text-[10px] text-slate-400 leading-normal flex items-start gap-2.5">
            <i className="fa-solid fa-info-circle text-violet-500 mt-0.5 shrink-0 text-xs"></i>
            <span>
              Nach Abschluss der Initialisierung wirst du sofort angemeldet und zur Administration weitergeleitet. Dort kannst du weitere Konfigurationen (wie E-Mail-Server, GitHub-Verbindungen und Gemini-API-Schlüssel) hinterlegen.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

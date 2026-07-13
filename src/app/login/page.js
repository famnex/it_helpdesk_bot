'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

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

        // 3. Prüfen, ob bereits eingeloggt
        fetch('/api/auth/me')
          .then(res => res.json())
          .then(data => {
            if (data.user) {
              setUser(data.user);
              redirectUser(data.user.role);
            }
          });
      })
      .catch(err => console.error('Fehler beim Setup-Check:', err));
  }, []);

  const redirectUser = (role) => {
    if (role === 'admin') {
      router.push('/admin');
    } else if (role === 'agent') {
      router.push('/agent');
    } else {
      router.push('/tickets');
    }
  };

  // IdP Redirect auslösen
  const handleIdpLogin = () => {
    // Holt die konfigurierte IdP URL und leitet dorthin weiter
    setIsLoading(true);
    fetch('/api/admin/settings')
      .then(res => res.json())
      .then(data => {
        const idpUrl = data.config?.idp_config?.redirectUrl || 'https://idp.schule.de/auth';
        window.location.href = `${idpUrl}?redirect_uri=${window.location.origin}/helpdesk/api/auth/callback`;
      })
      .catch(() => {
        setError('IdP-Einstellungen konnten nicht geladen werden.');
        setIsLoading(false);
      });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden animate-fade-in">
        
        {/* Header */}
        <div className="p-6 bg-slate-950 border-b border-slate-700 text-center">
          <div className="w-12 h-12 bg-violet-600 rounded-xl flex items-center justify-center text-white text-2xl mx-auto mb-3 shadow-md">
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          <h2 className="text-xl font-bold text-white">Mitarbeiter-Portal Login</h2>
          <p className="text-xs text-slate-400 mt-1">Authentifizierung für Support-Agenten und Admins</p>
        </div>

        <div className="p-6 space-y-6">
          
          {error && (
            <div className="bg-red-950/50 border border-red-500/50 text-red-200 text-xs p-3 rounded-lg flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          {/* 1. Offizieller Login */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 tracking-wide uppercase">Identity Provider</h3>
            <button 
              onClick={handleIdpLogin}
              disabled={isLoading}
              className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <i className="fa-solid fa-right-to-bracket"></i>
                  <span>Über Identity Provider anmelden</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}

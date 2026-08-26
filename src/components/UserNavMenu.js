'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Konsolidiertes Benutzermenü für die obere Navigationsleiste.
 * 
 * @param {Object} props
 * @param {Object} props.user - Der aktuell angemeldete Benutzer { name, email, role, avatarUrl, logoutText }
 * @param {string} props.currentView - Der aktuelle Bereich ('chat' | 'agent' | 'admin' | 'tickets' | 'profile')
 * @param {Function} [props.onLogout] - Optionaler benutzerdefinierter Logout-Handler
 */
export default function UserNavMenu({ user, currentView, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const router = useRouter();

  // Klick außerhalb schließt das Dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  if (!user) return null;

  const displayName = user.name || user.email || 'Benutzer';
  const role = user.role || 'customer';
  const logoutLabel = user.logoutText || 'Abmelden';

  const handleLogoutClick = async () => {
    setIsOpen(false);
    if (onLogout) {
      onLogout();
      return;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/helpdesk';
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/helpdesk';
    }
  };

  const getRoleBadge = () => {
    if (role === 'admin') {
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">Admin</span>;
    }
    if (role === 'agent') {
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30">Agent</span>;
    }
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">Benutzer</span>;
  };

  const renderAvatar = () => {
    if (user.avatarUrl) {
      return (
        <img 
          src={user.avatarUrl} 
          alt={displayName} 
          className="w-6 h-6 rounded-full object-cover border border-slate-700 shrink-0" 
        />
      );
    }
    if (role === 'admin') {
      return <i className="fa-solid fa-user-shield text-purple-400 text-sm shrink-0"></i>;
    }
    if (role === 'agent') {
      return <i className="fa-solid fa-user-tie text-violet-400 text-sm shrink-0"></i>;
    }
    return <i className="fa-solid fa-user text-sky-400 text-sm shrink-0"></i>;
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Menü-Trigger-Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold select-none cursor-pointer ${
          isOpen 
            ? 'bg-slate-800 border-sky-500/50 text-white shadow-lg' 
            : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 hover:border-slate-700 text-slate-200'
        }`}
        title={`Benutzermenü für ${displayName}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {renderAvatar()}
        <span className="max-w-[130px] sm:max-w-[180px] truncate text-slate-200 font-semibold">{displayName}</span>
        <i className={`fa-solid fa-chevron-down text-[10px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-sky-400' : ''}`}></i>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-60 sm:w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-fade-in divide-y divide-slate-800/80">
          
          {/* User Info Header */}
          <div className="px-3 py-2.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-xs text-white truncate">{displayName}</span>
              {getRoleBadge()}
            </div>
            {user.email && user.email !== displayName && (
              <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
            )}
          </div>

          {/* Navigation Links */}
          <div className="py-1.5 space-y-1">
            
            {/* Link: Chat-Frontend (nur wenn man nicht im Chat ist) */}
            {currentView !== 'chat' && (
              <Link
                href="/"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors group"
              >
                <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-all shrink-0">
                  <i className="fa-solid fa-comments text-xs"></i>
                </div>
                <span>Chat-Frontend</span>
              </Link>
            )}

            {/* Link: Agenten-Portal (nur für Agenten & Admins, wenn man nicht im Agenten-Portal ist) */}
            {currentView !== 'agent' && (role === 'agent' || role === 'admin') && (
              <Link
                href="/agent"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors group"
              >
                <div className="w-6 h-6 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:bg-violet-500 group-hover:text-white transition-all shrink-0">
                  <i className="fa-solid fa-ticket text-xs"></i>
                </div>
                <span>Agenten-Portal</span>
              </Link>
            )}

            {/* Link: Admin-Bereich (nur für Admins, wenn man nicht im Admin-Bereich ist) */}
            {currentView !== 'admin' && role === 'admin' && (
              <Link
                href="/admin"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors group"
              >
                <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-all shrink-0">
                  <i className="fa-solid fa-gears text-xs"></i>
                </div>
                <span>Admin-Bereich</span>
              </Link>
            )}

            {/* Link: Meine Tickets (für Kunden) */}
            {currentView !== 'tickets' && role === 'customer' && (
              <Link
                href="/tickets"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors group"
              >
                <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-all shrink-0">
                  <i className="fa-solid fa-ticket text-xs"></i>
                </div>
                <span>Meine Tickets</span>
              </Link>
            )}

            {/* Link: Mein Profil (für Agenten & Admins) */}
            {currentView !== 'profile' && (role === 'agent' || role === 'admin') && (
              <Link
                href="/profile"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors group"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shrink-0">
                  <i className="fa-solid fa-id-badge text-xs"></i>
                </div>
                <span>Mein Profil</span>
              </Link>
            )}

          </div>

          {/* Logout Button */}
          <div className="pt-1.5 pb-0.5">
            <button
              type="button"
              onClick={handleLogoutClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded-xl transition-colors group cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 group-hover:bg-red-600 group-hover:text-white transition-all shrink-0">
                <i className="fa-solid fa-right-from-bracket text-xs"></i>
              </div>
              <span>{logoutLabel}</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

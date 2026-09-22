export default function VerificationBadge({ method }) {
  const label = { idp: 'Schulkonto bestätigt', email: 'E-Mail bestätigt', guest: 'Gast · E-Mail unbestätigt' }[method] || 'Verifikation unbekannt';
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs border ${['idp','email'].includes(method) ? 'text-emerald-300 border-emerald-500/40' : 'text-slate-300 border-slate-600'}`} title="Nachweis bei Ticketanlage. Der Online-Status wird separat angezeigt.">{label}</span>;
}

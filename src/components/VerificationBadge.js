export default function VerificationBadge({ method }) {
  const isVerified = ['idp', 'email'].includes(method);
  const label = { idp: 'Verifiziert', email: 'Verifiziert', guest: 'Gast' }[method] || 'Gast';
  const tooltip = { idp: 'Schulkonto bestätigt', email: 'E-Mail bestätigt', guest: 'Gast · E-Mail unbestätigt' }[method] || 'Verifikation unbekannt';
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] leading-none font-bold border shrink-0 ${
        isVerified
          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
          : 'bg-slate-800 text-slate-400 border-slate-700'
      }`}
      title={tooltip}
    >
      {isVerified && <i className="fa-solid fa-circle-check text-[8px]"></i>}
      <span>{label}</span>
    </span>
  );
}

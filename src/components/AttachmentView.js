import { fixUploadUrl } from '@/lib/formatting';
import { isImageAttachment } from '@/lib/attachments';
export default function AttachmentView({ url, name }) {
  if (!url) return null;
  const src = fixUploadUrl(url);
  const image = isImageAttachment(url) || /^data:image\/(png|jpeg|gif|webp);/.test(url) || url.startsWith('blob:');
  return <a href={src} target="_blank" rel="noopener noreferrer" className="block max-w-full break-all rounded-lg border border-slate-500/40 p-2 text-sm underline" aria-label={name || 'Anhang öffnen'}>{image ? <img src={src} alt={name || 'Bildanhang'} className="max-w-full max-h-48 rounded-lg object-contain" /> : <span>📎 {name || 'Dateianhang herunterladen'}</span>}</a>;
}

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.txt,.xlsx,.csv';
export function attachmentError(file) {
  if (!file || !file.size) return 'Die Datei ist leer.';
  if (file.size > MAX_ATTACHMENT_SIZE) return 'Anhänge dürfen höchstens 10 MB groß sein.';
  if (!/\.(png|jpe?g|gif|webp|pdf|docx?|txt|xlsx|csv)$/i.test(file.name)) return 'Dieser Dateityp wird nicht unterstützt.';
  return null;
}
export const isImageAttachment = name => /\.(png|jpe?g|gif|webp)(?:\?.*)?$/i.test(name || '');
// Read files synchronously: clipboard data is only available during this event.
export function pasteAttachment(event, select, report) {
  const files = Array.from(event.clipboardData?.items || []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
  if (!files.length) return;
  if (files.length > 1) { report('Bitte jeweils eine Datei einfügen oder über die Büroklammer auswählen.'); return; }
  let file = files[0];
  const extension = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'}[file.type];
  if (extension && (!file.name || /^(image|blob)$/i.test(file.name))) file = new File([file],`Zwischenablage.${extension}`,{type:file.type});
  select(file);
  // The browser retains normal text insertion, including the current selection.
}

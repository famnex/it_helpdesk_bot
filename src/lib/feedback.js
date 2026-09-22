export function notify(message) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('helpdesk:notice',{detail:String(message)}));
}

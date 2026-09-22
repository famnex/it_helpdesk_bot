const cleanUrl = url => (url || '').replace(/^\/helpdesk/,'').replace(/^\/uploads\//,'/api/uploads/');
export function mergeConversation(chatMessages, ticketMessages, ticket) {
  const remaining = chatMessages.filter(m => !m.text?.startsWith('[SYSTEM_EVENT:')).map(m => ({
    ...m, id:`chat-${m.id}`, sourceChatMessageId:m.id,
    senderRole:m.sender === 'user' ? 'customer' : 'bot',
    senderEmail:m.sender === 'user' ? ticket.creatorEmail : 'IT-Support-Bot',
    senderName:m.sender === 'user' ? ticket.creatorName || 'Kunde' : 'IT-Support-Bot',
    isPreTicket: (m.createdAt || '') < (ticket.createdAt || '')
  }));
  const ticketItems = ticketMessages.map(m => ({...m}));
  for (const message of ticketItems) {
    // Historical imports had no source ID: pair each exact copy once, preserving repetitions.
    const index = remaining.findIndex(chat => message.sourceChatMessageId
      ? chat.sourceChatMessageId === message.sourceChatMessageId
      : chat.text === message.text && chat.senderRole === message.senderRole && chat.createdAt === message.createdAt && cleanUrl(chat.imageUrl) === cleanUrl(message.imageUrl));
    if (index >= 0) {
      message.sourceChatMessageId = remaining[index].sourceChatMessageId;
      message.isFlagged = remaining[index].isFlagged;
      message.isPreTicket = remaining[index].isPreTicket;
      remaining.splice(index,1);
    }
  }
  return [...remaining,...ticketItems].sort((a,b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

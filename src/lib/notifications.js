import db from '@/lib/db';
import { sendMail } from '@/lib/mailer';

/**
 * Reiht eine E-Mail-Benachrichtigung für ein Ticket in den 5-Minuten-Puffer ein (Debouncing).
 * Wenn bereits eine ausstehende Nachricht für dieses Ticket & Empfänger existiert,
 * wird die Nachricht angehängt und der 5-Minuten-Timer zurückgesetzt.
 */
export async function queueTicketNotification({ ticketId, recipientEmail, recipientRole, senderName, messageText }) {
  if (!recipientEmail || !ticketId || !messageText) return;

  try {
    const existing = db.prepare(`
      SELECT id, messages_summary 
      FROM pending_ticket_notifications 
      WHERE ticket_id = ? AND recipient_email = ? AND sent_at IS NULL
    `).get(ticketId, recipientEmail);

    const newMsgItem = {
      senderName: senderName || (recipientRole === 'customer' ? 'IT-Support' : 'Benutzer'),
      text: messageText,
      time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    };

    if (existing) {
      let currentList = [];
      try {
        currentList = JSON.parse(existing.messages_summary || '[]');
      } catch (e) {
        currentList = [{ text: existing.messages_summary }];
      }

      currentList.push(newMsgItem);

      // Aktualisiere Puffer und setze scheduled_send_at auf jetzt + 5 Minuten zurück
      db.prepare(`
        UPDATE pending_ticket_notifications 
        SET messages_summary = ?, 
            scheduled_send_at = datetime('now', '+5 minutes') 
        WHERE id = ?
      `).run(JSON.stringify(currentList), existing.id);

      console.log(`[Notification-Queue] 5-Minuten-Timer für Ticket ${ticketId} an ${recipientEmail} verlängert. (${currentList.length} Nachricht(en) gepuffert)`);
    } else {
      const initialList = [newMsgItem];

      db.prepare(`
        INSERT INTO pending_ticket_notifications 
        (ticket_id, recipient_email, recipient_role, messages_summary, scheduled_send_at) 
        VALUES (?, ?, ?, ?, datetime('now', '+5 minutes'))
      `).run(ticketId, recipientEmail, recipientRole, JSON.stringify(initialList));

      console.log(`[Notification-Queue] Neue Benachrichtigung für Ticket ${ticketId} an ${recipientEmail} in 5-Minuten-Puffer eingereiht.`);
    }

    // Direkt im Hintergrund prüfen, ob bereits abgelaufene Puffer da sind
    flushPendingNotifications().catch(err => console.error('[Notification-Queue] Flush-Fehler:', err));
  } catch (err) {
    console.error('Fehler beim Einreihen der Ticket-Benachrichtigung:', err);
  }
}

/**
 * Arbeitet abgelaufene Benachrichtigungspuffer (scheduled_send_at <= CURRENT_TIMESTAMP) ab
 * und versendet genau eine zusammengefasste E-Mail pro Empfänger & Ticket.
 */
export async function flushPendingNotifications() {
  try {
    const pendingList = db.prepare(`
      SELECT id, ticket_id as ticketId, recipient_email as recipientEmail, 
             recipient_role as recipientRole, messages_summary as messagesSummary, 
             created_at as createdAt 
      FROM pending_ticket_notifications 
      WHERE sent_at IS NULL AND scheduled_send_at <= CURRENT_TIMESTAMP
    `).all();

    if (pendingList.length === 0) return;

    console.log(`[Notification-Queue] Verarbeite ${pendingList.length} abgelaufene Benachrichtigungspuffer...`);

    for (const item of pendingList) {
      try {
        let msgItems = [];
        try {
          msgItems = JSON.parse(item.messagesSummary || '[]');
        } catch (e) {
          msgItems = [{ senderName: 'Absender', text: item.messagesSummary, time: '' }];
        }

        const ticket = db.prepare('SELECT title FROM tickets WHERE id = ?').get(item.ticketId);
        const ticketTitle = ticket ? ticket.title : 'Support-Anfrage';

        const countText = msgItems.length === 1 ? 'eine neue Nachricht' : `${msgItems.length} neue Nachrichten`;
        const subject = `[IT-Helpdesk] ${msgItems.length === 1 ? 'Neue Nachricht' : 'Neue Nachrichten'} zu Ticket ${item.ticketId}: ${ticketTitle}`;

        const isCustomer = item.recipientRole === 'customer';
        const ticketUrl = `https://cloud.mso-hef.de/helpdesk/${isCustomer ? 'tickets' : 'agent/tickets'}/${item.ticketId}`;

        const text = `Hallo,\n\nes gibt ${countText} zu dem Support-Ticket "${ticketTitle}" (${item.ticketId}).\n\nAus Datenschutzgründen werden keine Nachrichteninhalte per E-Mail übertragen. Bitte klicke auf den folgenden Link, um direkt zum Ticket / Chat zu wechseln:\n\n${ticketUrl}`;

        const html = `
          <div style="font-family: sans-serif; background-color: #020617; color: #f8fafc; padding: 24px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1e293b;">
            <h2 style="color: #8b5cf6; margin-top: 0; font-size: 20px;">Support-Ticket ${item.ticketId}</h2>
            <p style="color: #cbd5e1; font-size: 14px; margin-bottom: 16px; line-height: 1.6;">
              Hallo,<br/><br/>
              es gibt <strong>${countText}</strong> zu dem Support-Ticket <em>"${ticketTitle}"</em>.
            </p>
            <p style="color: #94a3b8; font-size: 13px; margin-bottom: 24px; line-height: 1.5;">
              Aus Datenschutz- und Sicherheitsgründen werden keine Nachrichteninhalte per E-Mail übertragen. Bitte klicke auf den folgenden Button, um direkt zum Ticket / Chat im Portal zu wechseln:
            </p>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${ticketUrl}" style="background-color: #7c3aed; color: #ffffff; padding: 13px 26px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
                Zum Ticket / Chat wechseln
              </a>
            </div>
          </div>
        `;

        await sendMail({ to: item.recipientEmail, subject, html, text });

        // Als versendet markieren
        db.prepare('UPDATE pending_ticket_notifications SET sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.id);
        console.log(`[Notification-Queue] Zusammengefasste E-Mail für Ticket ${item.ticketId} erfolgreich an ${item.recipientEmail} gesendet.`);
      } catch (sendErr) {
        console.error(`[Notification-Queue] Fehler beim Senden an ${item.recipientEmail}:`, sendErr);
      }
    }
  } catch (err) {
    console.error('[Notification-Queue] Fehler bei flushPendingNotifications:', err);
  }
}

// Serverweiter automatischer Timer: alle 30 Sekunden abgelaufene Puffer (>= 5 Minuten alt) flashen & versenden
if (typeof setInterval !== 'undefined') {
  if (!global._notificationFlushInterval) {
    global._notificationFlushInterval = setInterval(() => {
      flushPendingNotifications().catch(err => console.error('[Notification-Queue] Background Flush Fehler:', err));
    }, 30 * 1000);
  }
}

import db from '@/lib/db';

/**
 * Rekonstruiert die digitale Identitäts-Spur eines Chats anhand von:
 * 1. Anmeldungen & E-Mails in derselben Browser-Sitzung (user_session_id)
 * 2. Anmeldungen & E-Mails über dieselbe IP-Adresse (user_ip)
 * 3. Verknüpften Support-Tickets
 * 4. Registrierten Benutzerkonten (users Tabelle)
 * 
 * @param {string} chatId - Die ID des zu prüfenden Chats
 * @returns {object|null} Rekonstruiertes Identitäts-Profil
 */
export function reconstructIdentityTrace(chatId) {
  if (!chatId) return null;

  try {
    // 1. Basis-Chat abfragen
    const chat = db.prepare(`
      SELECT id, user_email as userEmail, user_name as userName, 
             user_ip as userIp, user_session_id as userSessionId, 
             is_abusive as isAbusive, abusive_flagged_at as abusiveFlaggedAt, 
             created_at as createdAt
      FROM chats 
      WHERE id = ?
    `).get(chatId);

    if (!chat) return null;

    const { userEmail, userName, userIp, userSessionId } = chat;

    // Map zur Aggregation aller gefundenen Identitäten (Key: email lowercase)
    const identityMap = new Map();
    const discoveredSessionIds = new Set();
    const discoveredIps = new Set();
    const discoveredChatIds = new Set([chatId]);

    if (userSessionId) discoveredSessionIds.add(userSessionId);
    if (userIp) discoveredIps.add(userIp);

    // Falls im Chat selbst eine E-Mail angegeben ist
    if (userEmail && userEmail.trim()) {
      const cleanEmail = userEmail.trim().toLowerCase();
      identityMap.set(cleanEmail, {
        email: cleanEmail,
        name: userName || null,
        matchSources: new Set(['Direkt im Chat']),
        chatCount: 1
      });
    }

    // 2. Abfrage über Session-ID (höchste Treffergenauigkeit)
    if (userSessionId) {
      const sessionChats = db.prepare(`
        SELECT id, user_email as userEmail, user_name as userName, user_ip as userIp, created_at as createdAt
        FROM chats
        WHERE user_session_id = ?
      `).all(userSessionId);

      for (const sChat of sessionChats) {
        discoveredChatIds.add(sChat.id);
        if (sChat.userIp) discoveredIps.add(sChat.userIp);

        if (sChat.userEmail && sChat.userEmail.trim()) {
          const cleanEmail = sChat.userEmail.trim().toLowerCase();
          const existing = identityMap.get(cleanEmail) || {
            email: cleanEmail,
            name: sChat.userName || null,
            matchSources: new Set(),
            chatCount: 0
          };
          existing.matchSources.add('Browser-Sitzung (Session-ID)');
          if (!existing.name && sChat.userName) existing.name = sChat.userName;
          existing.chatCount += 1;
          identityMap.set(cleanEmail, existing);
        }
      }
    }

    // 3. Abfrage über IP-Adresse (mittlere Treffergenauigkeit)
    if (userIp) {
      const ipChats = db.prepare(`
        SELECT id, user_email as userEmail, user_name as userName, user_session_id as userSessionId, created_at as createdAt
        FROM chats
        WHERE user_ip = ?
      `).all(userIp);

      for (const ipChat of ipChats) {
        discoveredChatIds.add(ipChat.id);
        if (ipChat.userSessionId) discoveredSessionIds.add(ipChat.userSessionId);

        if (ipChat.userEmail && ipChat.userEmail.trim()) {
          const cleanEmail = ipChat.userEmail.trim().toLowerCase();
          const existing = identityMap.get(cleanEmail) || {
            email: cleanEmail,
            name: ipChat.userName || null,
            matchSources: new Set(),
            chatCount: 0
          };
          existing.matchSources.add('IP-Adresse');
          if (!existing.name && ipChat.userName) existing.name = ipChat.userName;
          existing.chatCount += 1;
          identityMap.set(cleanEmail, existing);
        }
      }
    }

    // 4. Benutzerkonten aus der `users`-Tabelle abgleichen
    const emailsList = Array.from(identityMap.keys());
    const linkedIdentities = [];

    if (emailsList.length > 0) {
      const placeholders = emailsList.map(() => '?').join(',');
      const users = db.prepare(`
        SELECT id, email, role, name, avatar_url as avatarUrl, created_at as createdAt
        FROM users
        WHERE LOWER(email) IN (${placeholders})
      `).all(...emailsList);

      const userAccountMap = new Map(users.map(u => [u.email.toLowerCase(), u]));

      for (const [email, info] of identityMap.entries()) {
        const dbUser = userAccountMap.get(email);
        linkedIdentities.push({
          email: email,
          name: (dbUser && dbUser.name) || info.name || 'Unbekannt',
          role: (dbUser && dbUser.role) || 'Gast / Nicht registriert',
          avatarUrl: dbUser ? dbUser.avatarUrl : null,
          userAccountExists: !!dbUser,
          matchSources: Array.from(info.matchSources),
          chatCount: info.chatCount
        });
      }
    }

    // 5. Direktes Ticket für diesen Chat ermitteln
    const directTicket = db.prepare(`
      SELECT id, title, status, creator_email as creatorEmail, chat_id as chatId, created_at as createdAt
      FROM tickets
      WHERE chat_id = ?
    `).get(chatId) || null;

    // 5b. Weitere verknüpfte Tickets der Session/Identität suchen
    let linkedTickets = [];
    const chatIdsArr = Array.from(discoveredChatIds);
    if (chatIdsArr.length > 0 || emailsList.length > 0) {
      const ticketConditions = [];
      const queryParams = [];

      if (chatIdsArr.length > 0) {
        ticketConditions.push(`chat_id IN (${chatIdsArr.map(() => '?').join(',')})`);
        queryParams.push(...chatIdsArr);
      }

      if (emailsList.length > 0) {
        ticketConditions.push(`LOWER(creator_email) IN (${emailsList.map(() => '?').join(',')})`);
        queryParams.push(...emailsList);
      }

      if (ticketConditions.length > 0) {
        linkedTickets = db.prepare(`
          SELECT id, title, status, creator_email as creatorEmail, chat_id as chatId, created_at as createdAt
          FROM tickets
          WHERE ${ticketConditions.join(' OR ')}
          ORDER BY created_at DESC
          LIMIT 10
        `).all(...queryParams);
      }
    }

    // 6. Zuverlässigkeitsscore der Identifikation bestimmen
    let confidenceScore = 'low';
    if (linkedIdentities.some(i => i.userAccountExists && i.matchSources.includes('Browser-Sitzung (Session-ID)'))) {
      confidenceScore = 'high'; // Exakte Übereinstimmung mit registriertem Konto via Session
    } else if (linkedIdentities.some(i => i.userAccountExists) || linkedIdentities.some(i => i.matchSources.includes('Browser-Sitzung (Session-ID)'))) {
      confidenceScore = 'medium'; // Bekannte E-Mail oder Session-Spur vorhanden
    } else if (linkedIdentities.length > 0 || discoveredIps.size > 0) {
      confidenceScore = 'medium';
    }

    // 7. Zusammenfassungs-Text erstellen
    let summaryText = '';
    if (linkedIdentities.length === 0) {
      summaryText = 'Keine konkreten Anmeldungen oder E-Mail-Adressen für diese Browser-Sitzung / IP-Adresse in der Datenbank gefunden.';
    } else {
      const names = linkedIdentities.map(i => `${i.name} (${i.email})`).join(', ');
      summaryText = `${linkedIdentities.length} verknüpfte Identität(en) rekonstruiert: ${names}`;
    }

    return {
      chatId: chat.id,
      isAbusive: chat.isAbusive === 1,
      abusiveFlaggedAt: chat.abusiveFlaggedAt,
      primaryDetails: {
        userName: chat.userName || 'Gast',
        userEmail: chat.userEmail || null,
        userIp: chat.userIp || null,
        userSessionId: chat.userSessionId || null,
        createdAt: chat.createdAt
      },
      confidenceScore,
      linkedIdentities,
      directTicket,
      linkedTickets,
      sessionTrace: {
        sessionId: userSessionId || null,
        totalChatsInSession: discoveredChatIds.size
      },
      ipTrace: {
        ipAddress: userIp || null,
        associatedIps: Array.from(discoveredIps)
      },
      summary: summaryText
    };

  } catch (err) {
    console.error('Fehler bei reconstructIdentityTrace:', err);
    return null;
  }
}

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET & POST: Exportiert alle Helpdesk-Daten (Tickets, Ticket-Nachrichten, Chats, Chat-Nachrichten,
 * Bewertungen & Wissenseinträge) seit einem frei wählbaren Datum als strukturierte JSON-Datei.
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert. Nur Administratoren dürfen Daten exportieren.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get('since') || '';
  const untilParam = searchParams.get('until') || '';
  const includeTickets = searchParams.get('includeTickets') !== 'false';
  const includeChats = searchParams.get('includeChats') !== 'false';
  const includeKnowledge = searchParams.get('includeKnowledge') !== 'false';
  const includeUsers = searchParams.get('includeUsers') === 'true';
  const format = searchParams.get('format') || 'json';

  try {
    const exportResult = generateExportData({
      since: sinceParam,
      until: untilParam,
      includeTickets,
      includeChats,
      includeKnowledge,
      includeUsers,
      requestingUser: user
    });

    if (format === 'download') {
      const jsonString = JSON.stringify(exportResult, null, 2);
      const filename = `helpdesk_export_${sinceParam || 'all'}_bis_${untilParam || new Date().toISOString().split('T')[0]}.json`;

      return new Response(jsonString, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    return NextResponse.json(exportResult);
  } catch (error) {
    console.error('Fehler beim Exportieren der Daten:', error);
    return NextResponse.json({ error: 'Fehler beim Erstellen des Daten-Exports: ' + error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert. Nur Administratoren dürfen Daten exportieren.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      since = '',
      until = '',
      includeTickets = true,
      includeChats = true,
      includeKnowledge = true,
      includeUsers = false,
      format = 'json'
    } = body;

    const exportResult = generateExportData({
      since,
      until,
      includeTickets,
      includeChats,
      includeKnowledge,
      includeUsers,
      requestingUser: user
    });

    if (format === 'download') {
      const jsonString = JSON.stringify(exportResult, null, 2);
      const filename = `helpdesk_export_${since || 'all'}_bis_${until || new Date().toISOString().split('T')[0]}.json`;

      return new Response(jsonString, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    return NextResponse.json(exportResult);
  } catch (error) {
    console.error('Fehler beim Exportieren der Daten (POST):', error);
    return NextResponse.json({ error: 'Fehler beim Erstellen des Daten-Exports: ' + error.message }, { status: 500 });
  }
}

/**
 * Hilfsfunktion zum Abfragen und Zusammenstellen aller Daten
 */
function generateExportData({ since, until, includeTickets, includeChats, includeKnowledge, includeUsers, requestingUser }) {
  const sinceDate = since ? since.trim().split('T')[0] : '';
  const untilDate = until ? until.trim().split('T')[0] : '';

  const sinceTimestamp = sinceDate ? `${sinceDate} 00:00:00` : '1970-01-01 00:00:00';
  const untilTimestamp = untilDate ? `${untilDate} 23:59:59` : '2099-12-31 23:59:59';

  const exportData = {
    tickets: [],
    chats: [],
    knowledge: [],
    users: []
  };

  let totalTickets = 0;
  let totalTicketMessages = 0;
  let totalChats = 0;
  let totalChatMessages = 0;
  let totalKnowledge = 0;
  let ratedTicketsCount = 0;
  let totalRatingSum = 0;

  // 1. Tickets & Ticket Messages
  if (includeTickets) {
    const rawTickets = db.prepare(`
      SELECT 
        t.id, t.title, t.status, t.creator_email as creatorEmail,
        t.assigned_agent_id as assignedAgentId, u.name as assignedAgentName, u.email as assignedAgentEmail,
        t.solution, t.solution_context as solutionContext, t.solution_forgotten as solutionForgotten,
        t.chat_id as chatId, t.is_authenticated_creator as isAuthenticatedCreator,
        t.rating, t.rating_feedback as ratingFeedback, t.rated_at as ratedAt,
        t.closed_by_email as closedByEmail, t.closed_by_name as closedByName, t.closed_by_user_id as closedByUserId, t.closed_at as closedAt,
        t.last_agent_read_at as lastAgentReadAt,
        t.created_at as createdAt, t.updated_at as updatedAt
      FROM tickets t
      LEFT JOIN users u ON t.assigned_agent_id = u.id
      WHERE (t.created_at >= ? AND t.created_at <= ?)
         OR (t.updated_at >= ? AND t.updated_at <= ?)
      ORDER BY t.created_at DESC
    `).all(sinceTimestamp, untilTimestamp, sinceTimestamp, untilTimestamp);

    // Alle Nachrichten zu den exportierten Tickets (oder innerhalb des Zeitraums)
    const ticketIds = rawTickets.map(t => t.id);
    let rawMessages = [];

    if (ticketIds.length > 0) {
      // Nachrichten laden
      const placeholders = ticketIds.map(() => '?').join(',');
      rawMessages = db.prepare(`
        SELECT 
          tm.id, tm.ticket_id as ticketId, tm.sender_email as senderEmail, tm.sender_role as senderRole,
          tm.text, tm.is_internal as isInternal, tm.image_url as imageUrl, tm.created_at as createdAt
        FROM ticket_messages tm
        WHERE tm.ticket_id IN (${placeholders})
        ORDER BY tm.id ASC
      `).all(...ticketIds);
    }

    // Nachrichten den Tickets zuordnen
    const messagesByTicket = {};
    for (const msg of rawMessages) {
      if (!messagesByTicket[msg.ticketId]) {
        messagesByTicket[msg.ticketId] = [];
      }
      messagesByTicket[msg.ticketId].push({
        id: msg.id,
        senderEmail: msg.senderEmail,
        senderRole: msg.senderRole,
        text: msg.text,
        isInternal: !!msg.isInternal,
        imageUrl: msg.imageUrl || null,
        createdAt: msg.createdAt
      });
    }

    exportData.tickets = rawTickets.map(t => {
      const msgs = messagesByTicket[t.id] || [];
      if (t.rating && t.rating > 0) {
        ratedTicketsCount++;
        totalRatingSum += t.rating;
      }

      return {
        id: t.id,
        title: t.title,
        status: t.status,
        creatorEmail: t.creatorEmail,
        isAuthenticatedCreator: !!t.isAuthenticatedCreator,
        assignedAgent: t.assignedAgentId ? {
          id: t.assignedAgentId,
          name: t.assignedAgentName || null,
          email: t.assignedAgentEmail || null
        } : null,
        solution: t.solution || null,
        solutionContext: t.solutionContext || null,
        solutionForgotten: !!t.solutionForgotten,
        chatId: t.chatId || null,
        rating: t.rating || null,
        ratingFeedback: t.ratingFeedback || null,
        ratedAt: t.ratedAt || null,
        closedAt: t.closedAt || null,
        closedBy: t.closedByEmail ? {
          email: t.closedByEmail,
          name: t.closedByName || null,
          userId: t.closedByUserId || null
        } : null,
        lastAgentReadAt: t.lastAgentReadAt || null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messagesCount: msgs.length,
        messages: msgs
      };
    });

    totalTickets = exportData.tickets.length;
    totalTicketMessages = rawMessages.length;
  }

  // 2. Chats & Chat Messages
  if (includeChats) {
    const rawChats = db.prepare(`
      SELECT 
        c.id, c.user_email as userEmail, c.user_name as userName, c.category,
        c.ticket_created as ticketCreated, c.is_agent_on_behalf as isAgentOnBehalf,
        c.is_abusive as isAbusive, c.abusive_flagged_at as abusiveFlaggedAt,
        c.user_ip as userIp, c.user_session_id as userSessionId,
        c.categorized_at as categorizedAt, c.last_active_at as lastActiveAt,
        c.created_at as createdAt
      FROM chats c
      WHERE c.created_at >= ? AND c.created_at <= ? AND c.id NOT LIKE 'link-%'
      ORDER BY c.created_at DESC
    `).all(sinceTimestamp, untilTimestamp);

    const chatIds = rawChats.map(c => c.id);
    let rawChatMessages = [];

    if (chatIds.length > 0) {
      const placeholders = chatIds.map(() => '?').join(',');
      rawChatMessages = db.prepare(`
        SELECT 
          cm.id, cm.chat_id as chatId, cm.sender, cm.text, cm.image_url as imageUrl,
          cm.base_knowledge as baseKnowledge, cm.is_flagged as isFlagged,
          cm.created_at as createdAt
        FROM chat_messages cm
        WHERE cm.chat_id IN (${placeholders})
        ORDER BY cm.id ASC
      `).all(...chatIds);
    }

    const messagesByChat = {};
    for (const msg of rawChatMessages) {
      if (!messagesByChat[msg.chatId]) {
        messagesByChat[msg.chatId] = [];
      }
      messagesByChat[msg.chatId].push({
        id: msg.id,
        sender: msg.sender,
        text: msg.text,
        imageUrl: msg.imageUrl || null,
        baseKnowledge: msg.baseKnowledge || null,
        isFlagged: !!msg.isFlagged,
        createdAt: msg.createdAt
      });
    }

    exportData.chats = rawChats.map(c => {
      const msgs = messagesByChat[c.id] || [];
      return {
        id: c.id,
        userEmail: c.userEmail || null,
        userName: c.userName || null,
        category: c.category || null,
        categorizedAt: c.categorizedAt || null,
        ticketCreated: !!c.ticketCreated,
        isAgentOnBehalf: !!c.isAgentOnBehalf,
        isAbusive: !!c.isAbusive,
        abusiveFlaggedAt: c.abusiveFlaggedAt || null,
        userIp: c.userIp || null,
        userSessionId: c.userSessionId || null,
        lastActiveAt: c.lastActiveAt || null,
        createdAt: c.createdAt,
        messagesCount: msgs.length,
        messages: msgs
      };
    });

    totalChats = exportData.chats.length;
    totalChatMessages = rawChatMessages.length;
  }

  // 3. Knowledge Entries
  if (includeKnowledge) {
    const rawKnowledge = db.prepare(`
      SELECT 
        k.id, k.title, k.fact, k.description, k.category, k.is_private as isPrivate,
        k.source, k.created_at as createdAt
      FROM knowledge k
      WHERE k.created_at >= ? AND k.created_at <= ?
      ORDER BY k.created_at DESC
    `).all(sinceTimestamp, untilTimestamp);

    exportData.knowledge = rawKnowledge.map(k => ({
      id: k.id,
      title: k.title,
      fact: k.fact,
      description: k.description,
      category: k.category,
      isPrivate: !!k.isPrivate,
      source: k.source,
      createdAt: k.createdAt
    }));

    totalKnowledge = exportData.knowledge.length;
  }

  // 4. Users (Optional)
  if (includeUsers) {
    const rawUsers = db.prepare(`
      SELECT id, email, role, name, avatar_url as avatarUrl, responsibilities, created_at as createdAt
      FROM users
      ORDER BY role ASC, name ASC
    `).all();

    exportData.users = rawUsers.map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
      avatarUrl: u.avatarUrl || null,
      responsibilities: u.responsibilities ? JSON.parse(u.responsibilities || '[]') : [],
      createdAt: u.createdAt
    }));
  } else {
    delete exportData.users;
  }

  const averageRating = ratedTicketsCount > 0 
    ? parseFloat((totalRatingSum / ratedTicketsCount).toFixed(2)) 
    : null;

  return {
    exportVersion: '1.0',
    exportMetadata: {
      generatedAt: new Date().toISOString(),
      filter: {
        since: sinceDate || 'alle',
        until: untilDate || 'heute',
        sinceTimestamp,
        untilTimestamp
      },
      exportedBy: {
        id: requestingUser.id,
        email: requestingUser.email,
        name: requestingUser.name || requestingUser.email
      },
      statistics: {
        totalTickets,
        totalTicketMessages,
        totalChats,
        totalChatMessages,
        totalKnowledgeEntries: totalKnowledge,
        ratedTicketsCount,
        averageRating
      }
    },
    data: exportData
  };
}

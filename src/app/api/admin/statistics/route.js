import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET: Statistiken für das Admin-Dashboard laden
 * Berechnet Ticketanzahlen je Agent/Admin pro Tag, Woche, Monat, Jahr.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  try {
    // Alle Agenten/Admins laden
    const agents = db.prepare(`
      SELECT id, email, name, role
      FROM users
      WHERE role IN ('agent', 'admin')
      ORDER BY role ASC, name ASC, email ASC
    `).all();

    // Statistiken je Agent berechnen
    const statistics = agents.map(agent => {
      // 1. Pro Tag im Schnitt (Tickets geschlossen in den letzten 30 Tagen geteilt durch 30)
      const dayRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM tickets 
        WHERE assigned_agent_id = ? 
          AND status = 'closed'
          AND updated_at >= date('now', '-30 days')
      `).get(agent.id);
      const ticketsDayAvg = parseFloat(((dayRow?.count || 0) / 30).toFixed(2));

      // 2. Pro Woche im Schnitt (Tickets geschlossen in den letzten 12 Wochen geteilt durch 12)
      const weekRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM tickets 
        WHERE assigned_agent_id = ? 
          AND status = 'closed'
          AND updated_at >= date('now', '-84 days')
      `).get(agent.id);
      const ticketsWeekAvg = parseFloat(((weekRow?.count || 0) / 12).toFixed(2));

      // 3. Pro Monat im Schnitt (Tickets geschlossen im letzten Jahr geteilt durch 12)
      const monthRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM tickets 
        WHERE assigned_agent_id = ? 
          AND status = 'closed'
          AND updated_at >= date('now', '-365 days')
      `).get(agent.id);
      const ticketsMonthAvg = parseFloat(((monthRow?.count || 0) / 12).toFixed(2));

      // 4. Pro Jahr (Tickets geschlossen im letzten Jahr)
      const yearRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM tickets 
        WHERE assigned_agent_id = ? 
          AND status = 'closed'
          AND updated_at >= date('now', '-365 days')
      `).get(agent.id);
      const ticketsYearTotal = yearRow?.count || 0;

      // 5. Gesamtzahl geschlossener Tickets aller Zeiten
      const totalClosedRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM tickets 
        WHERE assigned_agent_id = ? 
          AND status = 'closed'
      `).get(agent.id);
      const totalClosed = totalClosedRow?.count || 0;

      // 6. Aktuell zugewiesene offene Tickets
      const openTicketsRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM tickets 
        WHERE assigned_agent_id = ? 
          AND status IN ('open', 'assigned')
      `).get(agent.id);
      const openCount = openTicketsRow?.count || 0;

      return {
        agentId: agent.id,
        email: agent.email,
        name: agent.name || agent.email.split('@')[0],
        role: agent.role,
        ticketsDayAvg,
        ticketsWeekAvg,
        ticketsMonthAvg,
        ticketsYearTotal,
        totalClosed,
        openCount
      };
    });

    // 7. Statistiken über Bot-Konversationen und Kategorien berechnen
    const totalChatsRow = db.prepare('SELECT COUNT(*) as count FROM chats').get();
    const totalChats = totalChatsRow?.count || 0;

    const uncategorizedChatsRow = db.prepare("SELECT COUNT(*) as count FROM chats WHERE category IS NULL OR category = ''").get();
    const uncategorizedCount = uncategorizedChatsRow?.count || 0;
    const categorizedCount = totalChats - uncategorizedCount;

    const categoriesRows = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM chats 
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
    `).all();

    const categoryBreakdown = categoriesRows.map(row => ({
      category: row.category,
      count: row.count,
      percentage: totalChats > 0 ? parseFloat(((row.count / totalChats) * 100).toFixed(1)) : 0
    }));

    const botStatistics = {
      totalChats,
      categorizedCount,
      uncategorizedCount,
      categoryBreakdown
    };

    return NextResponse.json({ statistics, botStatistics });
  } catch (err) {
    console.error('Fehler beim Berechnen der Statistiken:', err);
    return NextResponse.json({ error: 'Serverfehler beim Laden der Statistik.' }, { status: 500 });
  }
}

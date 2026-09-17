const db = require('../db/connection');

const AUTO_CLOSE_INTERVAL_MS = 3 * 60 * 60 * 1000;

let schedulerTimer = null;
let isAutoCloseRunning = false;

async function autoCloseResolvedTickets() {
  return db.transaction(async (trx) => {
    const resolvedTickets = await trx('tickets')
      .select('id')
      .where('status', 'resolved')
      .whereRaw("resolved_at <= now() - interval '48 hours'")
      .forUpdate();

    if (resolvedTickets.length === 0) {
      return { closedCount: 0 };
    }

    const ticketIds = resolvedTickets.map((ticket) => ticket.id);

    await trx('tickets')
      .whereIn('id', ticketIds)
      .where('status', 'resolved')
      .whereRaw("resolved_at <= now() - interval '48 hours'")
      .update({
        status: 'closed',
        closed_at: trx.fn.now(),
      });

    await trx('ticket_events').insert(
      ticketIds.map((ticketId) => ({
        ticket_id: ticketId,
        actor_id: null,
        event_type: 'closed',
        from_value: 'resolved',
        to_value: 'closed',
        reason: null,
      }))
    );

    return { closedCount: ticketIds.length };
  });
}

async function runScheduledAutoClose() {
  if (isAutoCloseRunning) {
    return;
  }

  isAutoCloseRunning = true;

  try {
    const result = await autoCloseResolvedTickets();
    console.log(`Scheduled auto-close completed. Closed ${result.closedCount} ticket(s).`);
  } catch (error) {
    console.error('Scheduled auto-close failed:', error);
  } finally {
    isAutoCloseRunning = false;
  }
}

function startAutoCloseScheduler() {
  if (schedulerTimer) {
    return;
  }

  schedulerTimer = setInterval(() => {
    void runScheduledAutoClose();
  }, AUTO_CLOSE_INTERVAL_MS);

  console.log('Auto-close scheduler started. Tickets are checked every 3 hours.');
  void runScheduledAutoClose();
}

function stopAutoCloseScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  autoCloseResolvedTickets,
  startAutoCloseScheduler,
  stopAutoCloseScheduler,
};
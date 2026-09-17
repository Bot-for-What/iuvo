const db = require('../db/connection');

async function writeSecurityAuditEvent({
  actorId = null,
  targetUserId = null,
  eventType,
  beforeValue = null,
  afterValue = null,
  reason = null,
  outcome
}, connection = db) {
  if (!eventType || !outcome) {
    throw new Error('Security audit event type and outcome are required.');
  }

  await connection('security_audit_events').insert({
    actor_id: actorId,
    target_user_id: targetUserId,
    event_type: eventType,
    before_value: beforeValue,
    after_value: afterValue,
    reason,
    outcome
  });
}

module.exports = {
  writeSecurityAuditEvent
};

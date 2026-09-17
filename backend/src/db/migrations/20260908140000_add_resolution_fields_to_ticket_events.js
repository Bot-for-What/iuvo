/**
 * Add resolution_remarks and repair_cost to ticket_events for audit trail.
 * These fields are populated only on status_change events when transitioning to 'resolved'.
 * On all other event types, they remain NULL.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('ticket_events', (table) => {
    table.text('resolution_remarks').nullable();
    table.decimal('repair_cost', 10, 2).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('ticket_events', (table) => {
    table.dropColumn('repair_cost');
    table.dropColumn('resolution_remarks');
  });
};
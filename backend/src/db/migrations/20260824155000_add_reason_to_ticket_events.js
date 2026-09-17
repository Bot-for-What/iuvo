exports.up = async function up(knex) {
  await knex.schema.alterTable('ticket_events', (table) => {
    table.text('reason').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('ticket_events', (table) => {
    table.dropColumn('reason');
  });
};
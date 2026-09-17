exports.up = async function up(knex) {
  await knex.schema.alterTable('ticket_events', (table) => {
    table.uuid('actor_id').nullable().alter();
  });
};

exports.down = async function down(knex) {
  const systemEventCount = await knex('ticket_events')
    .whereNull('actor_id')
    .count('* as count')
    .first();

  if (Number(systemEventCount.count) > 0) {
    throw new Error(
      'Cannot restore NOT NULL on ticket_events.actor_id while system-generated events exist.'
    );
  }

  await knex.schema.alterTable('ticket_events', (table) => {
    table.uuid('actor_id').notNullable().alter();
  });
};

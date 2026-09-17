exports.up = async function up(knex) {
  // Add unread indicator columns to tickets table
  await knex.schema.alterTable('tickets', (table) => {
    table.boolean('raiser_has_unread').notNullable().defaultTo(false);
    table.boolean('assignee_has_unread').notNullable().defaultTo(false);
  });

  // Create ticket_messages table
  await knex.schema.createTable('ticket_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('sender_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('body').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['ticket_id', 'created_at'], 'ticket_messages_ticket_id_created_at_index');
    table.index(['sender_id'], 'ticket_messages_sender_id_index');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ticket_messages');

  await knex.schema.alterTable('tickets', (table) => {
    table.dropColumn('assignee_has_unread');
    table.dropColumn('raiser_has_unread');
  });
};

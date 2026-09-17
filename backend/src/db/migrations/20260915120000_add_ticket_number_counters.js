function parseTicketSequence(ticketNumber) {
  const match = /-(\d+)$/.exec(ticketNumber);

  if (!match) {
    throw new Error(
      `Cannot seed ticket-number counter: invalid ticket number "${ticketNumber}".`
    );
  }

  const sequence = Number(match[1]);

  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error(
      `Cannot seed ticket-number counter: invalid sequence in "${ticketNumber}".`
    );
  }

  return sequence;
}

exports.up = async function up(knex) {
  await knex.schema.createTable('ticket_number_counters', (table) => {
    table
      .uuid('unit_id')
      .notNullable()
      .references('id')
      .inTable('units')
      .onDelete('RESTRICT');

    table
      .uuid('department_id')
      .notNullable()
      .references('id')
      .inTable('departments')
      .onDelete('RESTRICT');

    table.integer('next_sequence').notNullable().defaultTo(1);

    table.primary(['unit_id', 'department_id']);

    table.check('next_sequence > 0');
  });

  const tickets = await knex('tickets').select(
    'unit_id',
    'department_id',
    'ticket_number'
  );

  const highestByScope = new Map();

  for (const ticket of tickets) {
    const sequence = parseTicketSequence(ticket.ticket_number);
    const key = `${ticket.unit_id}:${ticket.department_id}`;
    const previous = highestByScope.get(key) || 0;

    if (sequence > previous) {
      highestByScope.set(key, sequence);
    }
  }

  const rows = Array.from(highestByScope.entries()).map(([key, highest]) => {
    const separatorIndex = key.indexOf(':');
    const unitId = key.slice(0, separatorIndex);
    const departmentId = key.slice(separatorIndex + 1);

    return {
      unit_id: unitId,
      department_id: departmentId,
      next_sequence: highest + 1,
    };
  });

  if (rows.length > 0) {
    await knex('ticket_number_counters').insert(rows);
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ticket_number_counters');
};
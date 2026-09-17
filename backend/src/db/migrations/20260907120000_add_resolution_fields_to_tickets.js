
exports.up = async function up(knex) {
  await knex.schema.alterTable('tickets', (table) => {
    table.text('resolution_remarks').nullable();
    table.decimal('repair_cost', 10, 2).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('tickets', (table) => {
    table.dropColumn('repair_cost');
    table.dropColumn('resolution_remarks');
  });
};

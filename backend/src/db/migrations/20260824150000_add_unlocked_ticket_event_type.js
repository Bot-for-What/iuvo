exports.up = async function up(knex) {
  await knex.raw(
    "ALTER TYPE ticket_event_type ADD VALUE IF NOT EXISTS 'unlocked';"
  );
};

exports.down = async function down() {
  // PostgreSQL enums do not support safely removing a value in-place.
};

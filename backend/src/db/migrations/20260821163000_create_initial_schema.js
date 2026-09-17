const ROLE_VALUES = ['super', 'management', 'admin', 'team', 'staff'];
const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];
const TICKET_STATUS_VALUES = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const TICKET_EVENT_VALUES = [
  'created',
  'claimed',
  'assigned',
  'status_change',
  'priority_change',
  'reopened',
  'closed',
  'unlocked'
];

exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.raw(`
    CREATE TYPE user_role AS ENUM (
      '${ROLE_VALUES.join("', '")}'
    )
  `);

  await knex.raw(`
    CREATE TYPE ticket_priority AS ENUM (
      '${PRIORITY_VALUES.join("', '")}'
    )
  `);

  await knex.raw(`
    CREATE TYPE ticket_status AS ENUM (
      '${TICKET_STATUS_VALUES.join("', '")}'
    )
  `);

  await knex.raw(`
    CREATE TYPE ticket_event_type AS ENUM (
      '${TICKET_EVENT_VALUES.join("', '")}'
    )
  `);

  await knex.schema.createTable('units', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('name').notNullable().unique();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('departments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('name').notNullable().unique();
  });

  await knex.schema.createTable('unit_departments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('unit_id')
      .notNullable()
      .references('id')
      .inTable('units')
      .onDelete('CASCADE');
    table
      .uuid('department_id')
      .notNullable()
      .references('id')
      .inTable('departments')
      .onDelete('RESTRICT');
    table.boolean('is_active').notNullable().defaultTo(true);

    table.unique(['unit_id', 'department_id'], {
      indexName: 'unit_departments_unit_id_department_id_unique'
    });
  });

  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('username').notNullable().unique();
    table.text('password_hash').notNullable();
    table.text('full_name').notNullable();
    table.specificType('role', 'user_role').notNullable();
    table
      .uuid('unit_id')
      .nullable()
      .references('id')
      .inTable('units')
      .onDelete('RESTRICT');
    table
      .uuid('department_id')
      .nullable()
      .references('id')
      .inTable('departments')
      .onDelete('RESTRICT');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('two_factor_enabled').notNullable().defaultTo(false);
    table.text('two_factor_secret').nullable();
    table
      .uuid('created_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['unit_id'], 'users_unit_id_index');
    table.index(['department_id'], 'users_department_id_index');
    table.index(['role'], 'users_role_index');
  });

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_scope_check
    CHECK (
      (
        role = 'super'
        AND unit_id IS NULL
        AND department_id IS NULL
      )
      OR
      (
        role = 'management'
        AND unit_id IS NOT NULL
        AND department_id IS NULL
      )
      OR
      (
        role IN ('admin', 'team', 'staff')
        AND unit_id IS NOT NULL
        AND department_id IS NOT NULL
      )
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX users_one_super_only
    ON users (role)
    WHERE role = 'super'
  `);

  await knex.schema.createTable('tickets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('ticket_number').notNullable().unique();
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
    table
      .uuid('raised_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('assigned_to')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('title').notNullable();
    table.text('description').notNullable();
    table.specificType('priority', 'ticket_priority').notNullable();
    table.specificType('status', 'ticket_status').notNullable().defaultTo('open');
    table.timestamp('resolved_at', { useTz: true }).nullable();
    table.timestamp('closed_at', { useTz: true }).nullable();
    table.integer('reopened_count').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['unit_id', 'department_id'], 'tickets_unit_department_index');
    table.index(['raised_by'], 'tickets_raised_by_index');
    table.index(['assigned_to'], 'tickets_assigned_to_index');
    table.index(['status'], 'tickets_status_index');
    table.index(['priority'], 'tickets_priority_index');
    table.index(['created_at'], 'tickets_created_at_index');
  });

  await knex.raw(`
    ALTER TABLE tickets
    ADD CONSTRAINT tickets_reopened_count_non_negative_check
    CHECK (reopened_count >= 0)
  `);

  await knex.schema.createTable('ticket_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('actor_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.specificType('event_type', 'ticket_event_type').notNullable();
    table.text('from_value').nullable();
    table.text('to_value').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['ticket_id', 'created_at'], 'ticket_events_ticket_id_created_at_index');
    table.index(['actor_id'], 'ticket_events_actor_id_index');
    table.index(['event_type'], 'ticket_events_event_type_index');
  });

  await knex.schema.createTable('saved_filters', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('name').notNullable();
    table.jsonb('filter_json').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id'], 'saved_filters_user_id_index');
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER units_set_updated_at
    BEFORE UPDATE ON units
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);

  await knex.raw(`
    CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);

  await knex.raw(`
    CREATE TRIGGER tickets_set_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);

  await knex('departments').insert([
    { name: 'IT' },
    { name: 'Maintenance' },
    { name: 'Bio-Medical' }
  ]);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('saved_filters');
  await knex.schema.dropTableIfExists('ticket_events');
  await knex.schema.dropTableIfExists('tickets');

  await knex.raw('DROP INDEX IF EXISTS users_one_super_only');
  await knex.schema.dropTableIfExists('users');

  await knex.schema.dropTableIfExists('unit_departments');
  await knex.schema.dropTableIfExists('departments');
  await knex.schema.dropTableIfExists('units');

  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at()');
  await knex.raw('DROP TYPE IF EXISTS ticket_event_type');
  await knex.raw('DROP TYPE IF EXISTS ticket_status');
  await knex.raw('DROP TYPE IF EXISTS ticket_priority');
  await knex.raw('DROP TYPE IF EXISTS user_role');
};

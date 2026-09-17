exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.boolean('must_change_password').notNullable().defaultTo(false);
    table.jsonb('password_policy_override').nullable();
  });

  await knex.schema.createTable('security_settings', (table) => {
    table.smallint('id').primary();
    table.integer('min_password_length').notNullable().defaultTo(3);
    table.boolean('require_uppercase').notNullable().defaultTo(false);
    table.boolean('require_lowercase').notNullable().defaultTo(false);
    table.boolean('require_number').notNullable().defaultTo(false);
    table.boolean('require_special_character').notNullable().defaultTo(false);
    table
      .uuid('updated_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE security_settings
    ADD CONSTRAINT security_settings_singleton_check
    CHECK (id = 1)
  `);

  await knex.raw(`
    ALTER TABLE security_settings
    ADD CONSTRAINT security_settings_min_password_length_check
    CHECK (min_password_length BETWEEN 3 AND 128)
  `);

  await knex('security_settings').insert({
    id: 1,
    min_password_length: 3,
    require_uppercase: false,
    require_lowercase: false,
    require_number: false,
    require_special_character: false,
    updated_by: null
  });

  await knex.schema.createTable('user_permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('permission').notNullable();
    table
      .uuid('granted_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id', 'permission'], {
      indexName: 'user_permissions_user_id_permission_unique'
    });
    table.index(['permission'], 'user_permissions_permission_index');
  });

  await knex.raw(`
    ALTER TABLE user_permissions
    ADD CONSTRAINT user_permissions_supported_permission_check
    CHECK (permission = 'security_admin')
  `);

  await knex.schema.createTable('security_audit_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('actor_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('target_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('event_type').notNullable();
    table.jsonb('before_value').nullable();
    table.jsonb('after_value').nullable();
    table.text('reason').nullable();
    table.text('outcome').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['created_at'], 'security_audit_events_created_at_index');
    table.index(['actor_id', 'created_at'], 'security_audit_events_actor_id_created_at_index');
    table.index(
      ['target_user_id', 'created_at'],
      'security_audit_events_target_user_id_created_at_index'
    );
    table.index(['event_type'], 'security_audit_events_event_type_index');
  });

  await knex.raw(`
    ALTER TABLE security_audit_events
    ADD CONSTRAINT security_audit_events_outcome_check
    CHECK (outcome IN ('allowed', 'denied', 'completed'))
  `);

  await knex.raw(`
    CREATE TRIGGER security_settings_set_updated_at
    BEFORE UPDATE ON security_settings
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);

  await knex.raw(`
    CREATE TRIGGER user_permissions_set_updated_at
    BEFORE UPDATE ON user_permissions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS user_permissions_set_updated_at ON user_permissions');
  await knex.raw('DROP TRIGGER IF EXISTS security_settings_set_updated_at ON security_settings');

  await knex.schema.dropTableIfExists('security_audit_events');
  await knex.schema.dropTableIfExists('user_permissions');
  await knex.schema.dropTableIfExists('security_settings');

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('password_policy_override');
    table.dropColumn('must_change_password');
  });
};

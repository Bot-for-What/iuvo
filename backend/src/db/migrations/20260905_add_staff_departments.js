/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Create staff_departments table
    .createTable('staff_departments', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('unit_id')
        .notNullable()
        .references('id')
        .inTable('units')
        .onDelete('CASCADE');
      table.text('name').notNullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      
      table.unique(['unit_id', 'name']);
      table.index(['unit_id', 'is_active']);
    })
    
    // Add staff_department_id to users
    .alterTable('users', (table) => {
      table.uuid('staff_department_id')
        .nullable()
        .references('id')
        .inTable('staff_departments')
        .onDelete('SET NULL');
      
      table.index('staff_department_id');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .alterTable('users', (table) => {
      table.dropColumn('staff_department_id');
    })
    .dropTable('staff_departments');
};

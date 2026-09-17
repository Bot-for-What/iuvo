exports.up = function(knex) {
  return knex.raw(`
    ALTER TABLE users DROP CONSTRAINT users_role_scope_check;
    ALTER TABLE users ADD CONSTRAINT users_role_scope_check CHECK (
      (role = 'super' AND unit_id IS NULL AND department_id IS NULL)
      OR (role = 'management' AND unit_id IS NULL AND department_id IS NULL)
      OR (role IN ('admin', 'team', 'staff') AND unit_id IS NOT NULL AND department_id IS NOT NULL)
    );
  `);
};

exports.down = function(knex) {
  return knex.raw(`
    ALTER TABLE users DROP CONSTRAINT users_role_scope_check;
    ALTER TABLE users ADD CONSTRAINT users_role_scope_check CHECK (
      (role = 'super' AND unit_id IS NULL AND department_id IS NULL)
      OR (role = 'management' AND unit_id IS NOT NULL AND department_id IS NULL)
      OR (role IN ('admin', 'team', 'staff') AND unit_id IS NOT NULL AND department_id IS NOT NULL)
    );
  `);
};
exports.up = function(knex) {
  return knex.schema.hasTable('users').then(exists => {
    if (exists) return;
    return knex.schema.createTable('users', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('email').unique().notNullable();
      table.string('username').unique().notNullable();
      table.string('full_name').notNullable();
      table.string('password_hash');
      table.string('avatar_url');
      table.string('gitlab_id').unique();
      table.string('slack_id').unique();
      table.json('gitlab_tokens');
      table.json('slack_tokens');
      table.boolean('is_active').defaultTo(true);
      table.enum('role', ['admin', 'user', 'manager']).defaultTo('user');
      table.json('preferences').defaultTo('{}');
      table.timestamps(true, true);
      
      table.index(['email']);
      table.index(['username']);
      table.index(['gitlab_id']);
      table.index(['slack_id']);
    });
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};

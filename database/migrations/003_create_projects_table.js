exports.up = function(knex) {
  return knex.schema.hasTable('projects').then(exists => {
    if (exists) return;
    return knex.schema.createTable('projects', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.text('description');
      table.uuid('team_id').references('id').inTable('teams').onDelete('CASCADE');
      table.string('gitlab_project_id').unique();
      table.string('slack_channel_id');
      table.json('configuration').defaultTo('{}');
      table.json('auto_assignment_rules').defaultTo('{}');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      
      table.index(['team_id']);
      table.index(['gitlab_project_id']);
      table.index(['slack_channel_id']);
    });
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('projects');
};

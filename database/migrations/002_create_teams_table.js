exports.up = function(knex) {
  return knex.schema.hasTable('teams').then(exists => {
    if (exists) return;
    return knex.schema.createTable('teams', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.text('description');
      table.uuid('owner_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('gitlab_group_id');
      table.string('slack_channel_id');
      table.json('configuration').defaultTo('{}');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      
      table.index(['owner_id']);
      table.index(['gitlab_group_id']);
      table.index(['slack_channel_id']);
    });
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('teams');
};

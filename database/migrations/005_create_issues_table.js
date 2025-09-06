exports.up = function(knex) {
  return knex.schema.hasTable('issues').then(exists => {
    if (exists) return;
    return knex.schema.createTable('issues', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.uuid('project_id').references('id').inTable('projects').onDelete('CASCADE');
      table.uuid('recording_id').references('id').inTable('recordings').onDelete('SET NULL');
      table.string('gitlab_issue_id');
      table.string('slack_thread_id');
      table.string('title').notNullable();
      table.text('description').notNullable();
      table.json('acceptance_criteria');
      table.enum('severity', ['critical', 'high', 'medium', 'low']).defaultTo('medium');
      table.enum('priority', ['urgent', 'high', 'normal', 'low']).defaultTo('normal');
      table.enum('status', ['draft', 'submitted', 'in_progress', 'resolved', 'closed']).defaultTo('draft');
      table.string('assignee_id');
      table.json('labels').defaultTo('[]');
      table.json('attachments').defaultTo('[]');
      table.json('generated_test_script');
      table.timestamps(true, true);
      
      table.index(['user_id']);
      table.index(['project_id']);
      table.index(['recording_id']);
      table.index(['gitlab_issue_id']);
      table.index(['status']);
      table.index(['severity']);
      table.index(['created_at']);
    });
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('issues');
};

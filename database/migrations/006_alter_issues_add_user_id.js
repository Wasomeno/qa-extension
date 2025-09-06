exports.up = async function(knex) {
  // Add user_id column if missing and try to backfill from likely legacy columns
  const hasUserId = await knex.schema.hasColumn('issues', 'user_id');
  if (!hasUserId) {
    await knex.schema.table('issues', table => {
      table.uuid('user_id').nullable();
      table.index(['user_id']);
    });

    // Backfill from legacy columns if present
    const hasCreatedBy = await knex.schema.hasColumn('issues', 'created_by');
    if (hasCreatedBy) {
      try {
        await knex.raw('UPDATE issues SET user_id = created_by WHERE user_id IS NULL');
      } catch (_) {
        // swallow backfill errors; leave nulls if types mismatch
      }
    }
    const hasReporterId = await knex.schema.hasColumn('issues', 'reporter_id');
    if (hasReporterId) {
      try {
        await knex.raw('UPDATE issues SET user_id = reporter_id WHERE user_id IS NULL');
      } catch (_) {
        // ignore
      }
    }
  }
};

exports.down = async function(knex) {
  // Non-destructive: keep the column to preserve data
};


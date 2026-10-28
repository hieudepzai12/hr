export async function migrateTaskProgressText(client) {
  await client.query(`ALTER TABLE tasks ADD COLUMN progress_text TEXT NOT NULL DEFAULT '';
    ALTER TABLE task_updates ADD COLUMN progress_text TEXT NOT NULL DEFAULT '';`);
}

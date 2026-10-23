// Department work plans do not require an individual project owner.
export async function migrateProjectDepartmentOwner(client) {
  await client.query('ALTER TABLE projects ALTER COLUMN owner_id DROP NOT NULL');
}

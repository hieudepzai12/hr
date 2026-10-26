// Keep existing duties and requirements intact; introduce the separate role/responsibility section.
export async function migratePositionRoleDescription(client) {
  await client.query('ALTER TABLE positions ADD COLUMN IF NOT EXISTS role_description TEXT');
}

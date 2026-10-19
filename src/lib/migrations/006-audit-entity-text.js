// Role keys are text; existing numeric object IDs are preserved as their text form.
export async function migrateAuditEntityText(client){
 await client.query('ALTER TABLE audit_logs ALTER COLUMN entity_id TYPE TEXT USING entity_id::text');
}

export function changedFields(before = {}, after = {}) {
  const changes = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      changes[key] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return changes;
}

export async function writeAudit(client, { entityType, entityId, actorId, action, before, after, reason, version }) {
  await client.query(`INSERT INTO audit_logs (entity_type, entity_id, actor_id, action, changes, reason, version)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
  [entityType, entityId, actorId, action, JSON.stringify(changedFields(before, after)), reason || null, version || null]);
}

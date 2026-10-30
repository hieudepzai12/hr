export function changedFields(before = {}, after = {}) {
  before ??= {};
  after ??= {};
  const changes = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      changes[key] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return changes;
}

export async function writeAudit(client, { entityType, entityId, actorId, action, before, after, reason, version }) {
  const changes=changedFields(before,after);
  const record=after||before||{};
  const name=record.title||record.name||record.label||record.code;
  changes._record={before:null,after:{...(name?{name:String(name).slice(0,500)}:{})}};
  await client.query(`INSERT INTO audit_logs (entity_type, entity_id, actor_id, action, changes, reason, version)
    VALUES ($1, $2, $3, $4, jsonb_set($5::jsonb,'{_record,after,actor_name}',to_jsonb(COALESCE((SELECT full_name FROM employees WHERE id=$3),'')),true), $6, $7)`,
  [entityType, entityId, actorId, action, JSON.stringify(changes), reason || null, version || null]);
}

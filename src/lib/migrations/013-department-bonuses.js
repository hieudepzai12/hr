export async function migrateDepartmentBonuses(client) {
  await client.query(`ALTER TABLE bonus_awards
    ALTER COLUMN employee_id DROP NOT NULL,
    ADD COLUMN award_scope TEXT NOT NULL DEFAULT 'legacy'
      CHECK (award_scope IN ('legacy','department','employee')),
    ADD CONSTRAINT bonus_award_recipient_check CHECK (
      (award_scope='department' AND employee_id IS NULL AND owner_id IS NULL)
      OR (award_scope IN ('legacy','employee') AND employee_id IS NOT NULL));
    CREATE INDEX bonus_awards_department_scope_idx ON bonus_awards(department_id,award_scope)
      WHERE deleted_at IS NULL;
  `);
}

// Components are kept with the existing immutable award policy snapshot.
// Legacy awards retain their recorded amount; never recalculate historical payouts.
export function bonusComponents(row) {
  const saved=row.policy_snapshot?.award_components;
  if(saved)return {fixed_amount:String(saved.fixed_amount),percentage_amount:String(saved.percentage_amount)};
  return row.policy_snapshot?.calculation==='percentage'
    ? {fixed_amount:'0',percentage_amount:String(row.amount||0)}
    : {fixed_amount:String(row.amount||0),percentage_amount:'0'};
}

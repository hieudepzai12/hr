'use client';
import { vnd } from '@/lib/governance-config';
export default function BonusAwardTable({items,onOpen}) {
  return <div className="ui-card max-w-full overflow-x-auto" role="region" aria-label="Thưởng phòng ban theo dự án" tabIndex={0}><table className="ui-table min-w-[680px]"><thead><tr><th>Nội dung thưởng</th><th>Dự án</th><th>Phòng ban</th><th>Số tiền</th></tr></thead><tbody>{items.map(row=><tr key={row.id}><td><button type="button" onClick={()=>onOpen(row)} className="text-left font-semibold text-teal hover:underline">{row.name}</button>{row.award_scope!=='department'&&<p className="mt-1 text-xs text-slate">Khoản thưởng cũ · {row.employee_id_label}</p>}</td><td>{row.project_id_label||'—'}</td><td>{row.department_id_label||'—'}</td><td className="whitespace-nowrap font-semibold">{vnd(row.amount)}</td></tr>)}</tbody></table></div>;
}

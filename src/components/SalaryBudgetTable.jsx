'use client';

import { vnd } from '@/lib/governance-config';
import { ReportStatusBadge } from './Badges';

export default function SalaryBudgetTable({ items, summary, offset=0, onOpen }) {
  return <div className="min-w-0 space-y-2">
    {summary?.month_count>1&&<p className="text-sm text-amber-dark">Đang xem nhiều tháng. Lọc một tháng để xem bảng quỹ lương của kỳ đó.</p>}
    <div className="ui-card min-w-0 max-w-full overflow-x-auto" role="region" aria-label="Bảng quỹ lương tổng" tabIndex={0}>
      <table className="ui-table min-w-[720px]"><thead><tr><th className="w-16">STT</th><th>Bộ phận</th><th>Số lượng</th><th className="text-right">Quỹ lương</th><th>Ghi chú</th></tr></thead>
        <tbody>{items.map((row,index)=><tr key={row.id}><td>{offset+index+1}</td><td><button type="button" onClick={()=>onOpen(row)} className="text-left font-semibold text-teal hover:underline">{row.name}</button><div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-xs text-slate">{String(row.month).split('-').reverse().join('/')}</span><ReportStatusBadge status={row.status}/></div>{row.budget_mode==='position'&&<p className="mt-1 text-xs text-slate">Dự toán cũ theo vị trí</p>}</td><td>{row.headcount??'—'}</td><td className="whitespace-nowrap text-right font-semibold tabular-nums">{vnd(row.total_amount)}</td><td className="max-w-80 whitespace-pre-wrap break-words">{row.notes||'—'}</td></tr>)}</tbody>
        <tfoot><tr className="bg-[#fff0b3] font-bold text-[#17263f]"><td colSpan={2} className="px-4 py-4">TỔNG CỘNG</td><td className="px-4 py-4">{summary?.headcount??'—'}</td><td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{vnd(summary?.total_amount||'0')}</td><td className="px-4 py-4 text-xs font-medium">{summary?.total||0} dòng theo bộ lọc · gồm mọi trang</td></tr></tfoot>
      </table>
    </div>
    {!items.length&&<p className="ui-empty text-sm">Chưa có ngân sách phù hợp. Chọn tháng và thêm dòng ngân sách.</p>}
  </div>;
}

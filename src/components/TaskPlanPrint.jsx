'use client';
import { progressText } from '@/lib/task-progress';

import Modal from './Modal';
import { PriorityBadge, TaskStatusBadge } from './Badges';

const dateText = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const scopeLabel = { all: 'Toàn bộ nhân sự', department: 'Phòng ban được cấp quyền', self: 'Công việc của tôi' };

export default function TaskPlanPrint({ payload, onClose }) {
  const { tasks, scope, filters, printed_at: printedAt } = payload;
  return <Modal title="Xem trước kế hoạch công việc" onClose={onClose} width="max-w-6xl">
    <div id="task-plan-print-preview" className="print-sheet bg-white text-ink">
      <header className="mb-4 border-b border-line pb-3 text-center">
        <div className="text-xs font-semibold tracking-widest text-slate">HR OTIS</div>
        <h2 className="mt-1 text-xl font-bold">KẾ HOẠCH CÔNG VIỆC</h2>
        <p className="mt-1 text-sm">Phạm vi: {scopeLabel[scope] || scope} · {tasks.length} công việc</p>
        {(filters.from || filters.to) && <p className="mt-1 text-xs">Hạn chót: {dateText(filters.from)} – {dateText(filters.to)}</p>}
        <p className="mt-1 text-xs text-slate">Ngày in: {new Date(printedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
      </header>
      {tasks.length ? <div className="overflow-x-auto"><table className="ui-table task-plan-table">
        <colgroup><col style={{ width: '22%' }} /><col style={{ width: '13%' }} /><col style={{ width: '11%' }} /><col style={{ width: '9%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} /><col style={{ width: '7%' }} /></colgroup>
        <thead><tr><th>Công việc</th><th>Người thực hiện</th><th>Phòng ban / Khách hàng</th><th>Tiến độ</th><th>Vướng mắc</th><th>Giải pháp</th><th>Ý kiến lãnh đạo</th><th>Hạn chót</th></tr></thead>
        <tbody>{tasks.map((task) => <tr key={task.id}>
          <td className="align-top"><strong className="block">#{task.id} {task.title}</strong><span className="mt-1 block"><PriorityBadge priority={task.priority} /></span>{task.description && <span className="mt-1 block whitespace-pre-wrap text-xs text-slate">{task.description}</span>}{task.expected_outcome && <span className="mt-1 block whitespace-pre-wrap text-xs">Đầu ra: {task.expected_outcome}</span>}</td>
          <td className="align-top"><strong>{task.assignee_name || '—'}</strong>{task.collaborator_names && <span className="mt-1 block text-xs text-slate">Phối hợp: {task.collaborator_names}</span>}</td>
          <td className="align-top">{task.department_name || '—'}{task.customer_name && <span className="mt-1 block text-xs text-slate">{task.customer_name}</span>}</td>
          <td className="align-top"><p className="whitespace-pre-wrap break-words">{progressText(task)}</p><span className="mt-1 block"><TaskStatusBadge status={task.status} /></span></td>
          <td className="whitespace-pre-wrap align-top">{task.blockers || '—'}</td>
          <td className="whitespace-pre-wrap align-top">{task.proposed_solution || '—'}</td>
          <td className="whitespace-pre-wrap align-top">{task.leader_opinion || '—'}</td>
          <td className="align-top">{dateText(task.due_date)}{task.start_date && <span className="mt-1 block text-xs text-slate">Từ {dateText(task.start_date)}</span>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="ui-empty">Không có công việc trong phạm vi và bộ lọc đã chọn.</p>}
    </div>
    <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="ui-button ui-button-secondary">Đóng</button><button type="button" disabled={!tasks.length} onClick={() => window.print()} className="ui-button ui-button-primary">In / Lưu PDF</button></div>
  </Modal>;
}

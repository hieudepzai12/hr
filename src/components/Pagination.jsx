'use client';

export default function Pagination({ page, pageSize = 20, total, count = 0, hasMore = false, loading = false, error = false, onPageChange, onPageSizeChange }) {
  const knownTotal = Number.isFinite(total);
  const last = knownTotal ? Math.max(1, Math.ceil(total / pageSize)) : page + (hasMore ? 1 : 0);
  const first = Math.max(1, Math.min(page - 2, last - 4));
  const pages = Array.from({ length: Math.min(5, last) }, (_, i) => first + i);
  const shown = knownTotal ? Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) : count;
  return <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-slate">Số dòng<select aria-label="Số dòng mỗi trang" value={pageSize} disabled={loading || !onPageSizeChange} onChange={e => onPageSizeChange?.(Number(e.target.value))} className="rounded-lg border border-line bg-white px-2 py-2 text-ink disabled:opacity-60">{[10,20,50,100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      {!loading && !error && <span className="text-slate">{shown ? (page - 1) * pageSize + 1 : 0}–{shown ? (page - 1) * pageSize + shown : 0}{knownTotal ? ` / ${total} bản ghi` : ' bản ghi'} · Trang {page}{knownTotal ? `/${last}` : ''}</span>}
      {loading && <span role="status" className="text-slate">Đang tải…</span>}
    </div>
    <nav aria-label="Phân trang" className="flex flex-wrap items-center gap-1">
      <button type="button" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)} className="ui-button ui-button-secondary disabled:opacity-50">Trước</button>
      {pages.map(number => <button type="button" key={number} aria-label={`Trang ${number}`} aria-current={number === page ? 'page' : undefined} disabled={loading || Boolean(error)} onClick={() => onPageChange(number)} className={`ui-button ${number === page ? 'ui-button-primary' : 'ui-button-secondary'} disabled:opacity-50`}>{number}</button>)}
      <button type="button" disabled={loading || Boolean(error) || page >= last} onClick={() => onPageChange(page + 1)} className="ui-button ui-button-secondary disabled:opacity-50">Sau</button>
    </nav>
  </div>;
}

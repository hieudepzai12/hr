'use client';

export default function LoadMore({ hasMore, loading, onClick }) {
  if (!hasMore) return null;
  return <div className="mt-5 text-center">
    <button type="button" onClick={onClick} disabled={loading}
      className="px-4 py-2 rounded-md border border-line bg-paper-raised text-sm text-teal hover:border-teal disabled:opacity-60 focus-ring">
      {loading ? 'Đang tải...' : 'Xem thêm'}
    </button>
  </div>;
}

'use client';
import { useFeedbackEffect } from './useFeedback';

import { useCallback, useEffect, useState } from 'react';
import api from './api';

export default function useTaskPages(filters) {
  const filterKey = JSON.stringify(filters);
  const [pagination, setPagination] = useState({ key: filterKey, page: 1, size: 20 });
  const page = pagination.key === filterKey ? pagination.page : 1;
  const size = pagination.size;
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([filterKey, page, size, revision]);
  const [result, setResult] = useState({ key: '', items: [], total: 0, error: '' });
  useEffect(() => {
    let active = true;
    api.get('/tasks', { params: { ...JSON.parse(filterKey), limit: size, offset: (page - 1) * size, include_total: '1' } })
      .then(({ data }) => {
        if (!active) return;
        const last = Math.max(1, Math.ceil(data.total / size));
        if (page > last) { setPagination({ key: filterKey, page: last, size }); return; }
        setResult({ key, items: data.items, total: data.total, error: '' });
      }).catch(() => { if (active) setResult({ key, items: [], total: 0, error: 'Không tải được danh sách công việc. Vui lòng thử lại.' }); });
    return () => { active = false; };
  }, [filterKey, key, page, size]);
  const refresh = useCallback(() => setRevision(value => value + 1), [setRevision]);
  useFeedbackEffect(result.key === key ? result.error : '');
  return { items: result.key === key ? result.items : [], total: result.key === key ? result.total : 0,
    loading: result.key !== key, error: result.key === key ? result.error : '', page, size,
    setPage: next => setPagination({ key: filterKey, page: next, size }),
    setSize: next => setPagination({ key: filterKey, page: 1, size: next }), refresh };
}

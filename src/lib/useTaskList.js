'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFeedbackEffect } from './useFeedback';
import api from './api';

export default function useTaskList(filters) {
  const filterKey = JSON.stringify(filters);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([filterKey, revision]);
  const [result, setResult] = useState({ key: '', items: [], error: '' });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api.get('/tasks', { signal: controller.signal, params: JSON.parse(filterKey) })
      .then(({ data }) => { if (active) setResult({ key, items: data, error: '' }); })
      .catch(() => { if (active) setResult({ key, items: [], error: 'Không tải được danh sách công việc. Vui lòng thử lại.' }); });
    return () => { active = false; controller.abort(); };
  }, [filterKey, key]);
  const refresh = useCallback(() => setRevision(value => value + 1), [setRevision]);
  const loading = result.key !== key;
  const error = loading ? '' : result.error;
  useFeedbackEffect(error);
  return { items: loading ? [] : result.items, loading, error, refresh };
}

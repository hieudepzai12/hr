'use client';
import { useFeedbackEffect } from './useFeedback';
import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

export default function usePagedList(path, params = {}) {
  const filterKey = JSON.stringify(params);
  const [paging, setPaging] = useState({ filterKey, page: 1, pageSize: 20 });
  const page = paging.filterKey === filterKey ? paging.page : 1;
  const pageSize = paging.pageSize;
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([path, filterKey, page, pageSize, revision]);
  const [result, setResult] = useState({ key: '', items: [], hasMore: false, error: '' });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api.get(path, { signal: controller.signal, params: { ...JSON.parse(filterKey), limit: pageSize, offset: (page - 1) * pageSize } })
      .then(({ data }) => {
        if (!active) return;
        if (!data.items.length && page > 1) { setPaging({ filterKey, page: page - 1, pageSize }); return; }
        setResult({ key, items: data.items, hasMore: data.hasMore, total: data.total, error: '' });
      }).catch(() => { if (active) setResult({ key, items: [], hasMore: false, error: 'Không thể tải danh sách' }); });
    return () => { active = false; controller.abort(); };
  }, [path, filterKey, page, pageSize, key]);
  const refresh = useCallback(() => setRevision(value => value + 1), [setRevision]);
  const loading = result.key !== key;
  const items = loading ? [] : result.items;
  const error = loading ? '' : result.error;
  useFeedbackEffect(error);
  return { items, loading, error, refresh, pagination: { page, pageSize, total: loading ? undefined : result.total,
    count: items.length, hasMore: !loading && result.hasMore, loading, error,
    onPageChange: next => setPaging({ filterKey, page: next, pageSize }),
    onPageSizeChange: next => setPaging({ filterKey, page: 1, pageSize: next }) } };
}

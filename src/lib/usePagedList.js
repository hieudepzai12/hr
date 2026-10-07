'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

const PAGE_SIZE = 20;

export default function usePagedList(path, params = {}) {
  const paramsKey = JSON.stringify(params);
  const generation = useRef(0);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestKey = `${path}:${paramsKey}:${revision}`;
  const [loadedKey, setLoadedKey] = useState('');

  useEffect(() => {
    const requestGeneration = generation;
    const current = ++requestGeneration.current;
    api.get(path, { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, offset: 0 } })
      .then(({ data }) => {
        if (requestGeneration.current !== current) return;
        setItems(data.items);
        setHasMore(data.hasMore);
        setLoadedKey(requestKey);
        setError('');
      })
      .catch(() => { if (requestGeneration.current === current) setError('Không thể tải danh sách'); })
      .finally(() => { if (requestGeneration.current === current) setLoading(false); });
    return () => { if (requestGeneration.current === current) requestGeneration.current++; };
  }, [path, paramsKey, revision, requestKey]);

  const refresh = useCallback(() => {
    setLoading(true);
    setRevision(value => value + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || loadedKey !== requestKey || !hasMore) return;
    const current = generation.current;
    setLoadingMore(true);
    try {
      const { data } = await api.get(path, { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, offset: items.length } });
      if (generation.current !== current) return;
      setItems(previous => [...previous, ...data.items]);
      setHasMore(data.hasMore);
      setError('');
    } catch {
      if (generation.current === current) setError('Không thể tải thêm dữ liệu');
    } finally {
      if (generation.current === current) setLoadingMore(false);
    }
  }, [hasMore, items.length, loadedKey, loading, loadingMore, paramsKey, path, requestKey]);

  const ready = loadedKey === requestKey;
  return { items: ready ? items : [], hasMore: ready && hasMore, loading: !ready || loading, loadingMore, error, refresh, loadMore };
}

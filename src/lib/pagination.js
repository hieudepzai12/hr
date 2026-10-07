export function parsePagination(searchParams) {
  if (!searchParams.has('limit') && !searchParams.has('offset')) return null;
  const limit = Number(searchParams.get('limit') ?? 20);
  const offset = Number(searchParams.get('offset') ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) return false;
  return { limit, offset };
}

export function pagedResult(rows, pagination) {
  if (!pagination) return rows;
  return { items: rows.slice(0, pagination.limit), hasMore: rows.length > pagination.limit };
}

export function appendPagination(sql, params, pagination) {
  if (!pagination) return sql;
  params.push(pagination.limit + 1, pagination.offset);
  return `${sql} LIMIT $${params.length - 1} OFFSET $${params.length}`;
}

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (req, ctx, user) => {
  const { searchParams } = new URL(req.url);
  const assignee_id = searchParams.get('assignee_id');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let sql = `SELECT t.*, e.full_name as assignee_name, e.avatar_color, e.avatar_path,
             c.full_name as creator_name
             FROM tasks t
             LEFT JOIN employees e ON t.assignee_id = e.id
             LEFT JOIN employees c ON t.created_by = c.id
             WHERE 1=1`;
  const params = [];

  if (user.role === 'employee') {
    params.push(user.id);
    sql += ` AND t.assignee_id = $${params.length}`;
  } else if (assignee_id) {
    params.push(assignee_id);
    sql += ` AND t.assignee_id = $${params.length}`;
  }
  if (status) { params.push(status); sql += ` AND t.status = $${params.length}`; }
  if (priority) { params.push(priority); sql += ` AND t.priority = $${params.length}`; }
  if (from) { params.push(from); sql += ` AND t.due_date >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND t.due_date <= $${params.length}`; }
  sql += ' ORDER BY t.due_date ASC';

  const { rows } = await query(sql, params);
  return NextResponse.json(rows);
});

export const POST = withAuth(async (req, ctx, user) => {
  const { title, description, assignee_id, status, priority, start_date, due_date, progress } = await req.json();
  if (!title || !due_date) return NextResponse.json({ error: 'Thiếu tiêu đề hoặc hạn chót' }, { status: 400 });
  const { rows } = await query(
    `INSERT INTO tasks (title, description, assignee_id, created_by, status, priority, start_date, due_date, progress)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [title, description || null, assignee_id || null, user.id, status || 'todo', priority || 'medium', start_date || null, due_date, progress || 0]
  );
  return NextResponse.json(rows[0], { status: 201 });
}, { roles: ['admin', 'manager'] });

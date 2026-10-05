'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';

function PersonNode({ person, peopleByManager }) {
  const children = peopleByManager.get(person.id) || [];
  return <li>
    <div className="node-box">
      <div className="node-title">{person.position || person.role_label}</div>
      <div className="node-name">{person.full_name}</div>
    </div>
    {children.length > 0 && <ul>{children.map((child) =>
      <PersonNode key={child.id} person={child} peopleByManager={peopleByManager} />
    )}</ul>}
  </li>;
}

function OrgChartContent() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/organization')
      .then(({ data }) => setEmployees(data.employees))
      .catch((err) => setError(err.response?.data?.error || 'Không tải được sơ đồ tổ chức.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout title="Sơ đồ tổ chức"><div className="text-slate text-sm">Đang tải...</div></Layout>;

  const visibleIds = new Set(employees.map((person) => person.id));
  const peopleByManager = new Map();
  const roots = [];
  for (const person of employees) {
    if (person.manager_id && visibleIds.has(person.manager_id)) {
      const siblings = peopleByManager.get(person.manager_id) || [];
      siblings.push(person);
      peopleByManager.set(person.manager_id, siblings);
    } else {
      roots.push(person);
    }
  }
  const byName = (a, b) => a.full_name.localeCompare(b.full_name, 'vi');
  roots.sort(byName);
  for (const siblings of peopleByManager.values()) siblings.sort(byName);

  return <Layout title="Sơ đồ tổ chức">
    {error ? <p role="alert" className="text-sm text-clay">{error}</p> : roots.length === 0 ? (
      <p className="text-sm text-slate">Chưa có nhân sự để hiển thị.</p>
    ) : (
      <div className="bg-paper-raised rounded-lg border border-line overflow-x-auto">
        <div className="min-w-max px-8 py-10"><div className="org-tree"><ul>{roots.map((person) =>
          <PersonNode key={person.id} person={person} peopleByManager={peopleByManager} />
        )}</ul></div></div>
      </div>
    )}
  </Layout>;
}

export default function OrgChartPage() {
  return <ProtectedRoute><OrgChartContent /></ProtectedRoute>;
}

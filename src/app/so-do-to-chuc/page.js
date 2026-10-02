'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABEL = { admin: 'Giám đốc', manager: 'Trưởng phòng', employee: 'Nhân viên' };

function PositionBox({ title, name }) {
  return (
    <div className="node-box">
      {title && <div className="node-title">{title}</div>}
      <div className="node-name">{name}</div>
    </div>
  );
}

function DeptBranch({ dept, members }) {
  const lead = members.find((m) => m.role === 'admin' || m.role === 'manager');

  // Chỉ có đúng 1 người và không ai giữ vai trò lead: hiển thị thẳng 1 ô, không bọc thêm ô phòng ban thừa.
  if (!lead && members.length === 1) {
    const only = members[0];
    return (
      <li>
        <PositionBox title={only.position || ROLE_LABEL[only.role]} name={only.full_name} />
      </li>
    );
  }

  const staff = members.filter((m) => m.id !== lead?.id);

  return (
    <li>
      <PositionBox
        title={lead ? (lead.position || ROLE_LABEL[lead.role]) : dept.name}
        name={lead ? lead.full_name : `${members.length} nhân viên`}
      />
      {staff.length > 0 && (
        <ul>
          {staff.map((m) => (
            <li key={m.id}>
              <PositionBox title={m.position || ROLE_LABEL[m.role]} name={m.full_name} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function OrgChartContent() {
  const { isManager } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/departments'), api.get('/employees', { params: { status: 'active' } })])
      .then(([deptRes, empRes]) => {
        setDepartments(deptRes.data);
        setEmployees(empRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Layout title="Sơ đồ tổ chức"><div className="text-slate text-sm">Đang tải...</div></Layout>;
  }

  const membersOf = (deptId) => employees.filter((e) => e.department_id === deptId);
  const director = employees.find((e) => e.role === 'admin');

  // Bỏ các phòng ban chỉ có đúng 1 thành viên là chính Giám đốc, để tránh lặp 2 ô giống hệt nhau.
  const branchDepts = departments.filter((d) => {
    if (!director) return true;
    const mem = membersOf(d.id);
    return !(mem.length === 1 && mem[0].id === director.id);
  });

  return (
    <Layout
      title="Sơ đồ tổ chức"
      subtitle={isManager ? 'Toàn bộ phòng ban trong công ty' : 'Phòng ban của bạn'}
    >
      {departments.length === 0 ? (
        <p className="text-sm text-slate">Chưa có phòng ban nào để hiển thị.</p>
      ) : (
        <div className="bg-paper-raised rounded-lg border border-line overflow-x-auto">
          <div className="min-w-max px-8 py-10">
            <div className="org-tree">
              <ul>
                {departments.length > 1 ? (
                  <li>
                    <PositionBox
                      title={director ? (director.position || 'Giám đốc') : 'Toàn công ty'}
                      name={director ? director.full_name : `${departments.length} phòng ban`}
                    />
                    {branchDepts.length > 0 && (
                      <ul>
                        {branchDepts.map((dept) => (
                          <DeptBranch key={dept.id} dept={dept} members={membersOf(dept.id)} />
                        ))}
                      </ul>
                    )}
                  </li>
                ) : (
                  <DeptBranch dept={departments[0]} members={membersOf(departments[0].id)} />
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}

export default function OrgChartPage() {
  return (
    <ProtectedRoute>
      <OrgChartContent />
    </ProtectedRoute>
  );
}

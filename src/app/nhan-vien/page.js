'use client';
import EmployeeDirectory from '@/components/EmployeeDirectory';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function EmployeesPage() {
  return <ProtectedRoute permission="employees"><EmployeeDirectory /></ProtectedRoute>;
}

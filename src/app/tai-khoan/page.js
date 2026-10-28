'use client';
import EmployeeDirectory from '@/components/EmployeeDirectory';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function AccountsPage() {
  return <ProtectedRoute permission="employees"><EmployeeDirectory accountsOnly /></ProtectedRoute>;
}

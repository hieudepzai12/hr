'use client';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import ManagementInsights from '@/components/ManagementInsights';
export default function Page(){return <ProtectedRoute permission="insights"><Layout title="Báo cáo quản trị" subtitle="Tổng hợp dữ liệu thực tế theo quyền truy cập"><ManagementInsights/></Layout></ProtectedRoute>;}

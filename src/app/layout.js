import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata = {
  title: "OTIS — Quản lý nhân sự",
  description: "Hệ thống quản lý nhân sự nội bộ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

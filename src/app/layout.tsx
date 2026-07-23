import type { Metadata } from "next";
import { AuthProvider } from "@/components/shared/AuthProvider";
import { Header } from "@/components/layout/Header";
import { Nav } from "@/components/layout/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Run Insight — 用例结果分析平台",
  description: "自动化测试用例结果导入、分析与资产沉淀平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans min-h-screen bg-bg">
        <AuthProvider>
          <Header />
          <Nav />
          <main className="min-h-[calc(100vh-100px)]">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}

import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "太阳辐照数据查询（PVGIS）",
  description: "输入地址或经纬度，查询 PVGIS 典型年/逐时辐照数据并展示。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}


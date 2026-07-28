import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "曲情证｜《牡丹亭》格律与至情研究智能体",
  description: "从80支人工标注曲词出发，观察格律形式如何参与《牡丹亭》的“至情”表达。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

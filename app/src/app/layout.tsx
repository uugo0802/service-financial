import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallPromptBanner } from "@/components/InstallPromptBanner";
import { LegalFooterLinks } from "@/components/LegalFooterLinks";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// components/ThemeToggle.tsxの保存キー("theme-preference")と同じ値を、
// このファイルからだけ読む（相互インポートすると"use client"境界を跨ぐため、
// 定数として重複させる。値が変わることはまず無い薄い文字列定数のため許容する）。
const THEME_STORAGE_KEY = "theme-preference";

// 全ページ（ログイン前のページ含む）で、初回ペイント前にlocalStorageの
// 保存済みテーマ設定を<html data-theme>に反映するスクリプト。
// これが無いと、ThemeToggleがマウントされたページ（/settings/appearance）を
// 訪れるまでdata-theme属性が一切設定されず、他の全ページがOSのprefers-color-scheme
// フォールバックにしか従えない（＝ページごとに表示テーマが揃わない根本原因だった）。
// next/scriptのbeforeInteractiveで<head>に注入し、hydration前・初回ペイント前に
// 同期実行させることでチラつき（FOUC）も防ぐ。
//
// 2026-08-30変更: "system"の場合もdata-theme属性を必ず明示値("light"/"dark")で
// 設定する（以前は属性を外してCSSのprefers-color-schemeメディアクエリに委ねていたが、
// Tailwindのdark:バリアントはdata-theme属性でしか判定できない設定に変更したため
// ―globals.cssの@custom-variant dark参照、components/ThemeToggle.tsxも同じ方針）。
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var pref = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var resolved = pref === "light" || pref === "dark"
      ? pref
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "決算書作成から税務申告までワンクリック（スグル）— MVP",
  description: "マイクロ法人・フリーランス向け記帳/確定申告下書き支援ツール（開発中プロトタイプ）",
  appleWebApp: {
    title: "スグル",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1c1917",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <div className="flex-1">
          <AppShell>{children}</AppShell>
        </div>
        <LegalFooterLinks />
        <ServiceWorkerRegister />
        <InstallPromptBanner />
        <Analytics />
      </body>
    </html>
  );
}

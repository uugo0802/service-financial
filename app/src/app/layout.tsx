import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallPromptBanner } from "@/components/InstallPromptBanner";
import { LegalFooterLinks } from "@/components/LegalFooterLinks";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

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

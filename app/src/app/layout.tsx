import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_JP } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { LegalFooterLinks } from "@/components/LegalFooterLinks";
import "./globals.css";

// 游ゴシック(Windows/macOSの標準日本語ゴシック体)をbodyのfont-familyで第一候補にし、
// それが無い環境（Linux/Android等）向けのWebフォールバックとしてNoto Sans JPを読み込む。
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "税務申告AI（ジャービス）— MVP",
  description: "マイクロ法人・フリーランス向け記帳/確定申告下書き支援ツール（開発中プロトタイプ）",
  appleWebApp: {
    title: "ジャービス",
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
      className={`${notoSansJP.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <LegalFooterLinks />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

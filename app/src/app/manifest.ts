import type { MetadataRoute } from "next";

// PWA化の土台。
// 192x192/512x512のPNGアイコン（public/icons/）を追加し、Android/デスクトップの
// インストール要件（十分な解像度のアイコン + maskable purpose）を満たす。
// 本格的なブランドアイコンのデザインが確定したら、public/icons/配下の画像を差し替えるだけでよい。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "税務申告AI（ジャービス）— 記帳・確定申告下書き支援",
    short_name: "ジャービス",
    description: "マイクロ法人・フリーランス向け記帳/確定申告下書き支援ツール（開発中プロトタイプ）",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#1c1917",
    lang: "ja",
    categories: ["finance", "business", "productivity"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

"use client";

import { useEffect } from "react";

// PWA化の土台: public/sw.js を登録するだけの最小コンポーネント。
// レンダリングには関与しないため、layout.tsx から差し込んでも既存UIに影響しない。
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return; // 開発中はHMRと衝突しやすいため本番のみ登録
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // オフライン基盤は将来拡張用のため、登録失敗時もアプリの利用は継続させる
    });
  }, []);

  return null;
}

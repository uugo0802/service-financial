"use client";

import { useCallback, useEffect, useState } from "react";
import { hasSeenInstallPrompt, markInstallPromptSeen } from "@/lib/pwa/installPrompt";

// ブラウザ標準の beforeinstallprompt イベントの型（libには含まれないため最小限だけ定義する）
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

/**
 * 「ホーム画面に追加」を促す非侵襲的なインストールバナー。
 * - ブラウザ標準の beforeinstallprompt イベントが発火したユーザーにのみ表示する（対応ブラウザ・条件を満たす場合のみ）
 * - 一度表示して閉じる／インストールする／実際にインストール完了する、のいずれかが起きたら
 *   localStorageに記録し、以後は二度と表示しない
 * - 自動では出ず、ブラウザがインストール可能と判断した時のみ画面下部に控えめに表示する
 */
export function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hasSeenInstallPrompt(window.localStorage)) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      // ブラウザ標準のミニインフォバー表示を止め、自前のUIで案内する
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      markInstallPromptSeen(window.localStorage);
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      // ユーザーがダイアログを閉じた等、失敗しても致命的にしない
    } finally {
      markInstallPromptSeen(window.localStorage);
      setVisible(false);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    markInstallPromptSeen(window.localStorage);
    setVisible(false);
  }, []);

  if (!visible || !deferredPrompt) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-lg border border-border bg-surface shadow-lg p-4 flex items-center gap-4">
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">ホーム画面に追加できます</span>
          <span className="text-xs text-muted-foreground">アプリのように起動でき、次回からすぐ開けます</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5"
          >
            後で
          </button>
          <button
            type="button"
            onClick={handleInstallClick}
            className="text-xs font-medium bg-red-700 text-white rounded-md px-3 py-1.5 hover:bg-red-800 transition-colors"
          >
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}

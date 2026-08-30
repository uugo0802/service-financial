"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/authClient";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    signOut().finally(() => {
      if (cancelled) return;
      // middlewareがセッションcookieの反映を正しく見られるよう、
      // pushではなくrefreshを挟んでサーバー側の判定もやり直させる
      // （src/app/login/page.tsxのログイン成功時と同じパターン）。
      router.replace("/login");
      router.refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="bg-background text-foreground min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">ログアウトしています…</p>
    </div>
  );
}

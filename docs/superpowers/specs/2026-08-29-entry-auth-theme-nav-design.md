# エントリー体験の再設計（認証強制・テーマ切替・ナビ導線）

## 背景・目的

オーナー(修吾)が本番URL（https://app-ebon-kappa-67.vercel.app）を実際に自分で操作し、以下の問題に直面した。

1. **ルートページ(`/`)がアプリの入り口として機能していない**: `/` にアクセスすると、AppShellもナビもない初期MVPの名残の単体CSVアップロードツール（`src/app/page.tsx`）が表示される。ログイン画面へのリンクも、ダッシュボードへのリンクもなく、そこから実際のアプリ（`/dashboard`等）にたどり着く手段がない。このツール自体は既に`/transactions`のCSV一括取込機能と重複しており、独自に維持する価値がない。
2. **ログインが実質機能していない**: `/login`のマジックリンク認証フォーム自体は動くが、認証成功後にどこへも遷移しない（`redirectTo`が`/login`自身を指しているだけ）。さらに、**保護されるべきページが1つも保護されていない** — `middleware.ts`や各ページでの認証チェックが存在せず、`/dashboard`を含む全ページが未ログインのままアクセス可能（この場合サンプルデータが表示される）。
3. **ダークモードがページごとにバラバラ**: 同一ブラウザセッション内で `/dashboard` はダーク、`/transactions` はライト、`/financial-statements` はダーク、`/login`・`/`はライト（AppShell未適用）という状態を実機で確認した。`design-refresh-foundation`（実装済み）でデザイントークンは導入されたが、全ページへの一貫適用ができていない。切り替えの手段も存在しない。
4. **サイドバーの選択肢が多すぎて見づらい**: `AppShell`の`NAV_GROUPS`は全グループが常時展開された状態で表示され、項目数が多く一覧性が悪い。

## スコープ

**含む**:
- `src/middleware.ts`の新設による、保護ページ（AppShell対象ページ）への認証強制
- ルートページ(`/`)を認証状態に応じたリダイレクトのみに置き換え、旧CSVツールUIを撤去
- `/login`のログイン成功後のリダイレクト実装
- ライト／ダーク／システム設定に依存、の3択テーマ切り替え機能と、AppShell対象ページへの一貫適用
- `AppShell`のサイドバーをグループ単位で折りたたみ可能にする

**含まない**:
- `APP_SHELL_EXCLUDED_PATHS`に含まれる未ログインページ（`/login`・`/pricing`・`/terms`・`/faq`・`/early-access`・`/tokushoho`・`/offline`・`/invite`・`/reset-password`・`/onboarding`）へのダークモード適用。これらはライト固定のまま据え置く
- テーマ設定のサーバー側（DB）保存・デバイス間同期。今回はlocalStorageのみ（将来必要になれば別spec）
- `financial-statements`ページの表示不具合（空欄の貸借対照表・テキスト重なり）。これは無関係の別バグのため、別spec（`2026-08-29-financial-statements-display-fix-design.md`）で扱う
- `tenants.blue_return`列の不整合（`CLAUDE.md`記載の既知の別課題）

## 設計

### ① 認証ミドルウェア

新規`src/middleware.ts`を追加する。保護対象パスの判定は、既存の`isAppShellExcludedPath()`（`src/lib/navigation/appShellNav.ts`、React/ブラウザAPI非依存の純粋関数）をそのまま流用する — 「AppShellでラップされる＝保護ページ」という既存の対応関係を、そのまま「認証必須」の判定にも使う。二重の除外リストを作らない。

```typescript
// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAppShellExcludedPath } from "@/lib/navigation/appShellNav";
import { getSessionFromRequest } from "@/lib/auth/middlewareSession"; // 新規: Supabaseセッションcookieを検証する薄いヘルパー

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isAppShellExcludedPath(pathname)) {
    return NextResponse.next();
  }
  const session = await getSessionFromRequest(request);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest|sw.js).*)"],
};
```

`getSessionFromRequest`はSupabaseのSSR用cookieベースセッション検証（`@supabase/ssr`等、既存の`lib/db/supabaseClient.ts`の実装パターンに合わせる）を行う新規ヘルパー。実装時にSupabase側の推奨パターン（`createServerClient`のcookie連携）を確認し、それに従うこと。

### ② ルートページ・ログイン導線

`src/app/page.tsx`を全面置き換え。旧CSVアップロードツールのUIは削除する（同等機能は`/transactions`のCSV一括取込に存在するため機能損失はない）。

```typescript
// src/app/page.tsx（新規）
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/serverSession"; // 新規: サーバーコンポーネント用セッション取得

export default async function RootPage() {
  const session = await getServerSession();
  redirect(session ? "/dashboard" : "/login");
}
```

`src/app/login/page.tsx`は、認証成功（`onAuthStateChange`で`session`が非nullになった時点）で、URLクエリパラメータ`redirect`の値（なければ`/dashboard`）へ`router.push()`する処理を追加する。`signInWithMagicLink`呼び出し時の`redirectTo`も、現状の「常に`/login`自身」から「`/login?redirect=<元のredirect値>`」に変更し、メールリンク経由でのログイン完了後も同じ遷移ロジックが働くようにする。

### ③ テーマシステム（ライト／ダーク／システム設定に依存）

`design-refresh-foundation`で導入済みのCSS変数トークン（`--background`・`--foreground`等、Tailwindの`bg-background`等のユーティリティにマッピング済み）を前提に、その値をどのモードで解決するかを切り替える仕組みを追加する。

- 新規`src/lib/theme/themePreference.ts`（React非依存の純粋関数）: `'light' | 'dark' | 'system'`の型定義、localStorageのキー名定数、読み書きヘルパー
- 新規`src/components/ThemeProvider.tsx`: マウント時にlocalStorageから設定を読み、`'system'`なら`window.matchMedia('(prefers-color-scheme: dark)')`を購読し、解決結果を`<html>`要素の`data-theme`属性（`"light"` / `"dark"`）に反映する。CSS変数側は`[data-theme="dark"]`セレクタで上書きする形に統一する（現状ページごとに実装がバラバラな根本原因なので、この1箇所に集約する）
- `src/app/layout.tsx`に`<ThemeProvider>`を追加（`<AppShell>`の外側、全ページ共通）
- 既存の`src/app/settings/appearance/page.tsx`（既存ページ、現状の実装は要確認）に3択のトグルUIを追加し、選択を`themePreference.ts`経由でlocalStorageに保存する
- **既存ページの色クラス監査**: 現状「ページごとにダークが効いたり効かなかったりする」のは、各ページが`bg-white`のようなハードコード色クラスと`bg-background`のようなトークンベースクラスを混在させているため（`design-refresh-foundation`がダッシュボード等一部にしか適用されなかった）。AppShell対象の全ページを対象に、ハードコード色クラスをトークンベースのクラスに置き換える。対象ページ数が多いため、実装時はページ単位・機能グループ単位で複数specに分割してもよい（本specでは`/dashboard`・`/transactions`・`/financial-statements`・`/journal`の4ページを最初の対象とし、残りは完了後に別specでロールアウトする）

### ④ サイドバーの折りたたみ

`AppShell.tsx`の`NavGroupList`を拡張し、グループ単位の開閉状態（`useState<Set<string>>`、グループの`label`をキーに管理）を持たせる。初期状態は「現在アクティブなページを含むグループ」のみ展開、他は折りたたむ。グループ見出しをクリック可能にし、開閉をトグルする。折りたたみ状態はページ遷移をまたいで保持する必要はない（都度、アクティブページを含むグループが自動展開されるため）。既存の`NAV_GROUPS`のグルーピング自体は変更しない。

## テスト方針

- `isAppShellExcludedPath`は既存のテストがあるため無改修（回帰確認のみ）
- `middleware.ts`: Next.jsのmiddlewareは`next/server`の`NextRequest`をモックした単体テストで、保護パス・除外パスそれぞれで正しくリダイレクト/素通りするかを検証
- `themePreference.ts`: 読み書き・`'system'`解決ロジックを純粋関数として単体テスト
- `AppShell`の折りたたみ: 該当グループが自動展開されること、クリックでの開閉トグルをコンポーネントテストで検証
- 既存の全テストがグリーンのまま維持されること

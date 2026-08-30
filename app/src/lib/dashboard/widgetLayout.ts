// ダッシュボードのウィジェット（各パネル）の並び順・表示/非表示設定を扱う純粋ロジック。
//
// このモジュール自体はlocalStorageに一切アクセスしない（SSRでも安全に呼び出せる）。
// 実際の読み書きはUI側（hooks/useDashboardWidgetLayout.ts）が
// `typeof window !== "undefined"` を確認したうえで、ここで定義したparse/serialize関数を
// 通して行う（ReceiptUpload.tsxのカメラ対応判定と同様、ロジックとブラウザAPIアクセスを分離する方針）。
//
// 保存データは「他バージョン（将来追加されたウィジェットID等）とも安全に共存できる」ことを
// 前提に設計する: 未知のIDは無視し、既知なのに保存データに存在しないID（新しく追加された
// ウィジェットなど）は末尾に補完する。破損データ（JSONとして壊れている、配列でない等）は
// 既定レイアウトへ安全にフォールバックする。

/** ダッシュボードに表示しうるウィジェットの一覧（app/src/components/dashboard/ 配下のパネルに対応） */
export type DashboardWidgetId =
  | "statTiles"
  | "trendLine"
  | "trendBar"
  | "kpiTrend"
  | "expenseBreakdown"
  | "benchmark"
  | "tagging"
  | "budgetSummary";

export interface DashboardWidgetMeta {
  id: DashboardWidgetId;
  /** 並び替えUIに表示するラベル */
  label: string;
}

/**
 * 既知のウィジェット一覧と、その既定の並び順（配列の並び順がそのまま既定順）。
 * page.tsx が元々レンダリングしていた固定順（StatTile群 → 月次推移 → 年度別推移 →
 * 経営指標 → 経費内訳 → ベンチマーク比較）をそのまま既定値として踏襲し、後から追加した
 * タグ付け・予算実績ウィジェットは末尾に追記する（末尾追加は既存の保存済みレイアウトとも
 * 安全に共存できる設計になっている。parseWidgetLayoutのコメント参照）。
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidgetMeta[] = [
  { id: "statTiles", label: "サマリー指標（今期・前期の売上/損益）" },
  { id: "trendLine", label: "月次 売上・経費・損益の推移" },
  { id: "trendBar", label: "年度別 売上・経費・損益" },
  { id: "kpiTrend", label: "年度別 経営指標（経費率・成長率）" },
  { id: "expenseBreakdown", label: "経費内訳（勘定科目別）" },
  { id: "benchmark", label: "経費構成の参考比較（対売上比）" },
  { id: "tagging", label: "取引にタグを付ける" },
  { id: "budgetSummary", label: "予算実績（概要）" },
];

const KNOWN_WIDGET_IDS: ReadonlySet<string> = new Set(DASHBOARD_WIDGETS.map((w) => w.id));

/** localStorageに保存するキー。スキーマを変える場合はバージョン番号を上げる想定 */
export const DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY = "sf.dashboard.widgetLayout.v1";

export interface DashboardWidgetLayoutEntry {
  id: DashboardWidgetId;
  /** falseなら非表示（配列からは削除せず、順序情報は保持したまま表示だけ抑制する） */
  visible: boolean;
}

/** 並び順 = 配列の並び順。表示/非表示は各エントリのvisibleで管理する */
export type DashboardWidgetLayout = DashboardWidgetLayoutEntry[];

/** 何も保存されていない場合の既定レイアウト（すべて表示、DASHBOARD_WIDGETSの順） */
export function getDefaultWidgetLayout(): DashboardWidgetLayout {
  return DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true }));
}

export function getWidgetLabel(id: DashboardWidgetId): string {
  return DASHBOARD_WIDGETS.find((w) => w.id === id)?.label ?? id;
}

function isValidEntry(value: unknown): value is DashboardWidgetLayoutEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    KNOWN_WIDGET_IDS.has(candidate.id) &&
    typeof candidate.visible === "boolean"
  );
}

/**
 * localStorageから読み出した生の文字列（未保存ならnull）を検証済みのレイアウトへ変換する。
 * 以下のいずれの場合も例外を投げず、安全に既定レイアウトへフォールバックする:
 *   - 保存データが存在しない（raw === null）
 *   - JSONとしてパースできない
 *   - 配列でない、要素の形がおかしい（id/visibleの型不一致等 = 壊れたデータ・旧バージョンの形式）
 *   - 現バージョンでは存在しない未知のウィジェットID（未来バージョンが書き込んだデータ）を含む
 *     → その要素だけ無視し、他の有効な要素は活かす
 *   - 既知のウィジェットのうち保存データに含まれていないものがある（新しく追加されたウィジェット）
 *     → 末尾に表示状態で補完する
 * 同じIDが複数回出現した場合は最初の出現のみを採用する。
 */
export function parseWidgetLayout(raw: string | null | undefined): DashboardWidgetLayout {
  if (!raw) return getDefaultWidgetLayout();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return getDefaultWidgetLayout();
  }

  if (!Array.isArray(parsed)) return getDefaultWidgetLayout();

  const seen = new Set<DashboardWidgetId>();
  const entries: DashboardWidgetLayout = [];
  for (const item of parsed) {
    if (!isValidEntry(item)) continue; // 未知ID・壊れた要素は無視
    if (seen.has(item.id)) continue; // 重複IDは最初のものだけ採用
    seen.add(item.id);
    entries.push({ id: item.id, visible: item.visible });
  }

  // 保存データに含まれていない既知ウィジェット（後から追加されたもの等）は表示状態で末尾に補完する
  for (const w of DASHBOARD_WIDGETS) {
    if (!seen.has(w.id)) {
      entries.push({ id: w.id, visible: true });
    }
  }

  return entries;
}

export function serializeWidgetLayout(layout: DashboardWidgetLayout): string {
  return JSON.stringify(layout);
}

/** 指定ウィジェットの表示/非表示を反転する（順序は変えない） */
export function toggleWidgetVisibility(layout: DashboardWidgetLayout, id: DashboardWidgetId): DashboardWidgetLayout {
  return layout.map((entry) => (entry.id === id ? { ...entry, visible: !entry.visible } : entry));
}

/**
 * 指定ウィジェットを一つ上/下に移動する。既に先頭/末尾で動かせない場合は
 * 何もせず、渡されたlayoutをそのまま返す（呼び出し側で結果の参照比較による
 * 変化判定もできるようにする）。
 */
export function moveWidget(
  layout: DashboardWidgetLayout,
  id: DashboardWidgetId,
  direction: "up" | "down"
): DashboardWidgetLayout {
  const index = layout.findIndex((entry) => entry.id === id);
  if (index === -1) return layout;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= layout.length) return layout;

  const next = [...layout];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

/**
 * ドラッグ&ドロップ用の並び替え: sourceId のエントリを取り除き、targetId の
 * （取り除いた後の）位置に挿入する。up/down方向を問わず、ドラッグ先の要素の
 * 直前に割り込む形になる。source/targetが同じ、またはどちらかが層内に
 * 存在しない場合は何もせず渡されたlayoutをそのまま返す。
 */
export function reorderWidget(
  layout: DashboardWidgetLayout,
  sourceId: DashboardWidgetId,
  targetId: DashboardWidgetId
): DashboardWidgetLayout {
  if (sourceId === targetId) return layout;

  const sourceIndex = layout.findIndex((entry) => entry.id === sourceId);
  const targetIndex = layout.findIndex((entry) => entry.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) return layout;

  const next = [...layout];
  const [moved] = next.splice(sourceIndex, 1);
  const insertIndex = next.findIndex((entry) => entry.id === targetId);
  next.splice(insertIndex, 0, moved);
  return next;
}

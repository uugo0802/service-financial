// 取引先・仕入先マスタ — 顧客（売上先）・仕入先の基本情報を一元管理するための純粋関数群。
//
// 背景: 現状、取引先名は取引明細（lib/categorize配下）・請求書下書き（lib/invoice/clientInvoice.ts）・
// インボイス登録番号のバリデーション（lib/categorize/invoiceRegistrationValidator.ts）などに、
// それぞれ自由入力の文字列として散在しており、表記ゆれ（全角/半角、スペースの有無等）や
// 同一取引先の重複登録の温床になっている。本モジュールは「取引先を一度登録すれば、
// 正規化された名称・種別（売上先/仕入先）・既定の勘定科目・インボイス登録番号・メモを
// 一元的に参照できる」ための最小限のデータモデルと、作成・検証・一覧表示・重複検出のための
// 純粋関数を提供する。
//
// 実DBアクセスは行わない: この codebase の Supabase 連携は未接続のスキャフォールドのため
// （lib/dashboard/benchmarkComparison.ts と同じ方針）、呼び出し側（UI）が保持するプレーンな
// 配列を引数として受け取り、新しい配列/オブジェクトを返す純粋関数のみで構成する。
//
// 注意（税理士法第2条対応）: 本モジュールは取引先情報の整理・重複検出を行うだけであり、
// 個別具体の税務相談・税務代理は一切行わない。インボイス登録番号の形式・チェックデジット検証は
// invoiceRegistrationValidator.ts（変更禁止・そのままインポートして利用する）に委譲し、
// 検証ロジック自体をここに複製しない。登録番号が形式上正しくても、国税庁「適格請求書発行事業者
// 公表サイト」上での実在・有効性確認は別途必要であり、本モジュールはそれを保証しない
// （invoiceRegistrationValidator.ts のコメントと同じ前提）。

import { validateInvoiceRegistrationNumber } from "../categorize/invoiceRegistrationValidator";

/** 取引先の種別。売上先（顧客）か仕入先か。 */
export type CounterpartyKind = "client" | "vendor";

/** UIの選択肢用。表示順もこの並びに揃える */
export const COUNTERPARTY_KIND_OPTIONS: CounterpartyKind[] = ["client", "vendor"];

export const COUNTERPARTY_KIND_LABELS: Record<CounterpartyKind, string> = {
  client: "売上先（顧客）",
  vendor: "仕入先",
};

/** 取引先マスタの下書き（保存前の入力値）。 */
export interface CounterpartyDraft {
  /** 取引先の正式名称・屋号（表示用。そのままユーザー入力を保持する） */
  name: string;
  kind: CounterpartyKind;
  /** この取引先との取引に既定で使う勘定科目名（任意。dictionary.ts の科目名を想定するが強制はしない） */
  defaultAccountName?: string;
  /** 適格請求書発行事業者の登録番号（"T"+13桁、任意。免税事業者・未登録事業者は空でよい） */
  invoiceRegistrationNumber?: string;
  /** 補足メモ（任意） */
  notes?: string;
}

/** 保存済みの取引先マスタレコード。 */
export interface Counterparty extends CounterpartyDraft {
  id: string;
  /** ISO8601形式の作成日時 */
  createdAt: string;
  /** ISO8601形式の最終更新日時 */
  updatedAt: string;
}

export type CounterpartyFieldErrors = Partial<Record<"name" | "invoiceRegistrationNumber", string>>;

export const EMPTY_COUNTERPARTY_DRAFT: CounterpartyDraft = {
  name: "",
  kind: "client",
  defaultAccountName: "",
  invoiceRegistrationNumber: "",
  notes: "",
};

/**
 * 取引先名を重複検出・比較用に正規化する（表示用の名称そのものは変更しない）。
 * - 前後の空白を除去
 * - 全角スペースを半角スペースに統一したうえで、連続する空白を1つに圧縮
 * - 大文字小文字の違いを無視（半角英字のみ。全角/半角文字種そのものを揃える正規化は対象外）
 */
export function normalizeCounterpartyName(name: string): string {
  return (name ?? "")
    .trim()
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * 下書きのバリデーション（形式チェックのみ）。エラーがなければ空オブジェクトを返す。
 * - 取引先名は必須
 * - インボイス登録番号は「入力されている場合のみ」invoiceRegistrationValidator.ts の
 *   形式・チェックデジット検証にかける。未入力自体はエラーにしない
 *   （免税事業者・登録前の事業者もこのマスタに登録できる必要があるため）。
 *
 * 同名取引先の重複はここでは検証しない（保存をブロックすべき「不正な入力」ではなく、
 * ユーザー確認を促す「データ品質上の注意」であるため）。重複の検出は
 * findDuplicateCounterparties / isDuplicateCounterpartyName を別途利用すること。
 */
export function validateCounterpartyDraft(draft: CounterpartyDraft): CounterpartyFieldErrors {
  const errors: CounterpartyFieldErrors = {};
  const name = draft.name?.trim() ?? "";

  if (!name) {
    errors.name = "取引先名を入力してください";
  }

  const registrationNumber = draft.invoiceRegistrationNumber?.trim();
  if (registrationNumber) {
    const result = validateInvoiceRegistrationNumber(registrationNumber);
    if (!result.valid) {
      errors.invoiceRegistrationNumber = result.message;
    }
  }

  return errors;
}

export function hasCounterpartyErrors(errors: CounterpartyFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `counterparty-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 登録番号を、有効な場合は正規化形式（"T"+13桁）に、それ以外は入力をトリムしただけの値に整える */
function normalizeRegistrationNumberForSave(registrationNumber: string | undefined): string | undefined {
  const trimmed = registrationNumber?.trim();
  if (!trimmed) return undefined;
  const validation = validateInvoiceRegistrationNumber(trimmed);
  return validation.normalized ?? trimmed;
}

/**
 * バリデーション済みの下書きから保存用の Counterparty を作成する。
 * 呼び出し側は事前に validateCounterpartyDraft でエラーがないことを確認しておくこと。
 * 登録番号は、形式・チェックデジットが有効な場合は正規化形式（"T"+13桁）で保存し、
 * 無効な入力（フォームバリデーションを迂回して渡された場合等）や未入力の場合は
 * トリム済みの入力値（または undefined）をそのまま保持する（データを黙って欠落させない）。
 */
export function createCounterparty(draft: CounterpartyDraft, now: Date = new Date()): Counterparty {
  const nowIso = now.toISOString();

  return {
    id: generateId(),
    name: draft.name.trim(),
    kind: draft.kind,
    defaultAccountName: draft.defaultAccountName?.trim() || undefined,
    invoiceRegistrationNumber: normalizeRegistrationNumberForSave(draft.invoiceRegistrationNumber),
    notes: draft.notes?.trim() || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * 既存の Counterparty に下書きの変更を適用した新しいオブジェクトを返す（immutableな更新）。
 * id・createdAt は既存レコードのものを維持し、updatedAt のみ更新する。
 */
export function updateCounterparty(
  existing: Counterparty,
  draft: CounterpartyDraft,
  now: Date = new Date()
): Counterparty {
  return {
    ...existing,
    name: draft.name.trim(),
    kind: draft.kind,
    defaultAccountName: draft.defaultAccountName?.trim() || undefined,
    invoiceRegistrationNumber: normalizeRegistrationNumberForSave(draft.invoiceRegistrationNumber),
    notes: draft.notes?.trim() || undefined,
    updatedAt: now.toISOString(),
  };
}

/** 保存済みレコードを編集フォームの初期値へ変換する */
export function counterpartyToDraft(record: Counterparty): CounterpartyDraft {
  return {
    name: record.name,
    kind: record.kind,
    defaultAccountName: record.defaultAccountName ?? "",
    invoiceRegistrationNumber: record.invoiceRegistrationNumber ?? "",
    notes: record.notes ?? "",
  };
}

export interface CounterpartyListFilter {
  /** 指定した場合、この種別のみに絞り込む */
  kind?: CounterpartyKind;
  /** 名称・メモに対する部分一致検索（大文字小文字を無視） */
  query?: string;
}

/**
 * 取引先一覧を種別・キーワードで絞り込み、正規化名の昇順（日本語ロケール）で並び替える。
 * 元の配列は変更しない。
 */
export function listCounterparties(
  records: readonly Counterparty[],
  filter: CounterpartyListFilter = {}
): Counterparty[] {
  const query = filter.query?.trim().toLowerCase();

  return records
    .filter((record) => (filter.kind ? record.kind === filter.kind : true))
    .filter((record) => {
      if (!query) return true;
      const haystack = `${record.name} ${record.notes ?? ""}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => normalizeCounterpartyName(a.name).localeCompare(normalizeCounterpartyName(b.name), "ja"));
}

/**
 * 指定した名称（正規化後）が、既存の一覧内（excludeId で指定したレコード自身を除く）に
 * すでに存在するかを判定する。フォームでの「登録前の重複警告」用の軽量チェックであり、
 * 保存自体をブロックするものではない（同名でも別の登録番号・別のメモで意図的に分けたい
 * ケースもあり得るため、警告に留める）。
 */
export function isDuplicateCounterpartyName(
  records: readonly Counterparty[],
  name: string,
  excludeId?: string
): boolean {
  const key = normalizeCounterpartyName(name);
  if (!key) return false;
  return records.some((record) => record.id !== excludeId && normalizeCounterpartyName(record.name) === key);
}

export interface CounterpartyDuplicateGroup {
  normalizedName: string;
  records: Counterparty[];
}

/**
 * 正規化名が一致する（＝表記ゆれ以外は同一とみなせる）取引先のグループを検出する。
 * 1件しかない名称はグループとして返さない（重複が疑われるものだけを返す）。
 */
export function findDuplicateCounterparties(records: readonly Counterparty[]): CounterpartyDuplicateGroup[] {
  const groups = new Map<string, Counterparty[]>();

  for (const record of records) {
    const key = normalizeCounterpartyName(record.name);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  return [...groups.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([normalizedName, bucket]) => ({ normalizedName, records: bucket }));
}

/**
 * 正規化名が重複する取引先を1件に統合する（表記ゆれによる二重登録の整理用）。
 * - kind（売上先/仕入先）が異なるレコードはマージしない。売上先と仕入先を誤って
 *   同一視すると請求書・仕訳側の判定を壊しかねないため、安全側に倒してどちらも残す。
 * - 各グループ内では、最も古い（createdAt が最小の）レコードを残し、より新しい重複レコードで
 *   欠落しているフィールド（defaultAccountName / invoiceRegistrationNumber / notes）のみ補完する。
 *   既に値がある項目は上書きしない（先勝ち。ユーザーが後から手動修正した値を消さないため）。
 */
export function dedupeCounterpartiesByName(records: readonly Counterparty[]): Counterparty[] {
  const order: string[] = [];
  const groups = new Map<string, Counterparty[]>();

  for (const record of records) {
    const key = normalizeCounterpartyName(record.name);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(record);
  }

  const result: Counterparty[] = [];

  for (const key of order) {
    const bucket = groups.get(key)!;
    const byKind = new Map<CounterpartyKind, Counterparty[]>();
    for (const record of bucket) {
      const list = byKind.get(record.kind) ?? [];
      list.push(record);
      byKind.set(record.kind, list);
    }
    for (const sameKindBucket of byKind.values()) {
      result.push(mergeCounterpartyGroup(sameKindBucket));
    }
  }

  return result;
}

function mergeCounterpartyGroup(bucket: Counterparty[]): Counterparty {
  const sorted = [...bucket].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [primary, ...rest] = sorted;
  let merged = primary;
  for (const other of rest) {
    merged = {
      ...merged,
      defaultAccountName: merged.defaultAccountName ?? other.defaultAccountName,
      invoiceRegistrationNumber: merged.invoiceRegistrationNumber ?? other.invoiceRegistrationNumber,
      notes: merged.notes ?? other.notes,
      updatedAt: other.updatedAt > merged.updatedAt ? other.updatedAt : merged.updatedAt,
    };
  }
  return merged;
}

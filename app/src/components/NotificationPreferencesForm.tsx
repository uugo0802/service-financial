"use client";

import { useState, useSyncExternalStore } from "react";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DigestFrequency,
  NotificationPreferences,
  QuietHours,
  isValidTimeString,
  loadNotificationPreferences,
  saveNotificationPreferences,
  validateNotificationPreferences,
} from "@/lib/notifications/preferences";

// 通知の詳細設定（ダイジェスト配信頻度・静音時間帯）を編集するフォーム。
//
// 設定はサーバー側に配信基盤がまだ無いプロトタイプの段階のため、ReceiptUpload.tsxの
// カメラ対応判定と同様、ブラウザのlocalStorageにこの端末限定で保存する。
// localStorageの読み取りはuseEffect内でのsetState（ハイドレーション後にcascading renderを
// 引き起こすため本リポジトリのlintルールで禁止）ではなく、ReceiptUpload.tsxのcameraSupported判定と
// 同じuseSyncExternalStoreパターンで行う: SSR/初回ハイドレーション時はgetServerSnapshot()で
// 常にDEFAULT_NOTIFICATION_PREFERENCESを返して不一致を防ぎ、クライアントでのみ実際の保存値を返す。
//
// フォームの編集値は「ユーザーがまだ何も編集していない間はstoredPreferences（localStorageの値、
// 未保存ならDEFAULT）をそのまま表示し、一度でも編集したらそのeditableな下書き(draft)を使う」という
// 単純な派生state方式にする。これによりuseEffect無しで「保存済みの値を初期値としてフォームに
// 反映しつつ、以後は自由に編集できる」を実現している。
//
// 実際の判定ロジック（妥当性検証・静音時間帯の判定）は lib/notifications/preferences.ts 側の
// 純粋関数に委譲し、このコンポーネントは入力の受け渡しと保存タイミングの制御にのみ徹する。

const DIGEST_FREQUENCY_OPTIONS: { key: DigestFrequency; label: string; description: string }[] = [
  { key: "weekly", label: "毎週", description: "週次アクティビティダイジェストを毎週配信します。" },
  { key: "monthly", label: "毎月", description: "配信頻度を月1回に抑えます。" },
  { key: "off", label: "配信しない", description: "ダイジェストメールの配信を停止します。" },
];

function subscribeNoop() {
  return () => {};
}

// getSnapshot()はuseSyncExternalStoreの要件上、値が変わっていない間は同一参照を返す必要がある
// （毎回JSON.parseし直すと参照が変わり続け、無限レンダリングになってしまう）ため、
// このモジュール内で一度だけ読み込んでキャッシュする。localStorageへの保存はsaveNotificationPreferences
// 経由でのみ行われ、このキャッシュはページの再読み込みまで不変で構わない（他タブでの変更をこの
// フォームへリアルタイム反映する要件はない）。
let cachedStoredPreferences: NotificationPreferences | null = null;

function getStoredPreferencesSnapshot(): NotificationPreferences {
  if (cachedStoredPreferences === null) {
    cachedStoredPreferences = loadNotificationPreferences(window.localStorage);
  }
  return cachedStoredPreferences;
}

function getServerPreferencesSnapshot(): NotificationPreferences {
  return DEFAULT_NOTIFICATION_PREFERENCES;
}

export function NotificationPreferencesForm() {
  const storedPreferences = useSyncExternalStore(
    subscribeNoop,
    getStoredPreferencesSnapshot,
    getServerPreferencesSnapshot
  );
  // ユーザーが未編集の間はnull（= storedPreferencesをそのまま使う）。一度でも編集したら
  // その時点の値を持つオブジェクトに変わり、以後はこのdraftが表示・編集対象になる。
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const preferences = draft ?? storedPreferences;
  const validation = validateNotificationPreferences(preferences);

  function updatePreferences(update: Partial<NotificationPreferences>) {
    setDraft({ ...preferences, ...update });
    setSavedAt(null);
  }

  function updateQuietHours(update: Partial<QuietHours>) {
    setDraft({ ...preferences, quietHours: { ...preferences.quietHours, ...update } });
    setSavedAt(null);
  }

  function handleSave() {
    if (!validation.valid) return;
    if (typeof window === "undefined") return;
    saveNotificationPreferences(window.localStorage, preferences);
    cachedStoredPreferences = preferences; // 次回のgetSnapshot()呼び出しにも保存内容を反映させる
    setSavedAt(Date.now());
  }

  const startTimeInvalid = !isValidTimeString(preferences.quietHours.start);
  const endTimeInvalid = !isValidTimeString(preferences.quietHours.end);
  const isAlwaysQuiet =
    !startTimeInvalid && !endTimeInvalid && preferences.quietHours.start === preferences.quietHours.end;

  return (
    <div className="border border-border bg-surface rounded-md p-5 flex flex-col gap-6">
      <div>
        <div className="text-xs text-muted-foreground mb-2">ダイジェストの配信頻度</div>
        <div className="flex flex-wrap gap-2">
          {DIGEST_FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => updatePreferences({ digestFrequency: opt.key })}
              aria-pressed={preferences.digestFrequency === opt.key}
              className={`text-sm px-4 py-2 border transition-colors ${
                preferences.digestFrequency === opt.key
                  ? "bg-accent border-accent text-white"
                  : "bg-surface border-border text-muted-foreground hover:border-foreground/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {DIGEST_FREQUENCY_OPTIONS.find((o) => o.key === preferences.digestFrequency)?.description}
        </p>
      </div>

      <div className="border-t border-border/60 pt-4">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={preferences.quietHours.enabled}
            onChange={(e) => updateQuietHours({ enabled: e.target.checked })}
          />
          静音時間帯を設定する（この時間帯は緊急ではない通知を抑制します）
        </label>

        {preferences.quietHours.enabled && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                開始時刻
                <input
                  type="time"
                  value={preferences.quietHours.start}
                  onChange={(e) => updateQuietHours({ start: e.target.value })}
                  className="border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                終了時刻
                <input
                  type="time"
                  value={preferences.quietHours.end}
                  onChange={(e) => updateQuietHours({ end: e.target.value })}
                  className="border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                />
              </label>
            </div>

            {startTimeInvalid && <p className="text-xs text-red-700">開始時刻が正しい形式（HH:mm）ではありません。</p>}
            {endTimeInvalid && <p className="text-xs text-red-700">終了時刻が正しい形式（HH:mm）ではありません。</p>}

            {!startTimeInvalid && !endTimeInvalid && (
              <p className="text-xs text-muted-foreground">
                {isAlwaysQuiet
                  ? "開始・終了が同じ時刻のため、終日静音として扱われます。"
                  : preferences.quietHours.start > preferences.quietHours.end
                    ? `${preferences.quietHours.start}〜翌${preferences.quietHours.end}の日をまたぐ時間帯が静音になります。`
                    : `${preferences.quietHours.start}〜${preferences.quietHours.end}の時間帯が静音になります。`}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              期限超過（overdue）の申告期限リマインダーは、見逃した場合の影響が大きいため静音時間帯中でも通知されます。
            </p>
          </div>
        )}
      </div>

      {!validation.valid && (
        <div role="alert" className="text-xs text-red-700 border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 px-3 py-2">
          <p className="font-semibold">保存できません。以下の内容をご確認ください:</p>
          <ul className="list-disc list-inside">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-border/60 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!validation.valid}
          className="text-sm px-4 py-2 border border-accent bg-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          設定を保存する
        </button>
        {savedAt !== null && <span className="text-xs text-emerald-700 dark:text-emerald-400">保存しました（この端末のみ）</span>}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        この設定はこの端末のブラウザにのみ保存され、実際のメール配信基盤とはまだ連携していません（プロトタイプ）。
      </p>
    </div>
  );
}

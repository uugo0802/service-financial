import { describe, expect, it } from "vitest";
import { FAQ_CATEGORIES, FAQ_CATEGORY_LABELS, FAQ_CATEGORY_ORDER, FAQ_ENTRIES, FaqCategory } from "./content";

// ------------------------------------------------------------------
// このテストは通常の構造テストに加えて、コンプライアンス上のガードレール
// （税理士法第2条: 個別具体の税務相談の禁止）を機械的にチェックする役割も持つ。
// FAQ回答文を追加・変更するたびに必ず実行されることを前提としている。
// ------------------------------------------------------------------

describe("FAQ_ENTRIES structural invariants", () => {
  it("is non-empty", () => {
    expect(FAQ_ENTRIES.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    const ids = FAQ_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-empty question and answer text for every entry", () => {
    for (const entry of FAQ_ENTRIES) {
      expect(entry.question.trim().length).toBeGreaterThan(0);
      expect(entry.answer.trim().length).toBeGreaterThan(0);
    }
  });

  it("only uses categories from the allowed FAQ_CATEGORIES set", () => {
    const allowed = new Set<FaqCategory>(FAQ_CATEGORIES);
    for (const entry of FAQ_ENTRIES) {
      expect(allowed.has(entry.category)).toBe(true);
    }
  });

  it("has a label for every category in FAQ_CATEGORIES", () => {
    for (const category of FAQ_CATEGORIES) {
      expect(FAQ_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("has FAQ_CATEGORY_ORDER be a permutation of FAQ_CATEGORIES (no missing/extra/duplicate entries)", () => {
    expect([...FAQ_CATEGORY_ORDER].sort()).toEqual([...FAQ_CATEGORIES].sort());
    expect(new Set(FAQ_CATEGORY_ORDER).size).toBe(FAQ_CATEGORY_ORDER.length);
  });

  it("has at least one entry for every category (no orphan/empty category)", () => {
    const usedCategories = new Set(FAQ_ENTRIES.map((e) => e.category));
    for (const category of FAQ_CATEGORIES) {
      expect(usedCategories.has(category)).toBe(true);
    }
  });

  it("ids are kebab-case-ish (lowercase letters, digits, hyphens only)", () => {
    for (const entry of FAQ_ENTRIES) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

// ------------------------------------------------------------------
// コンプライアンス・ガードレール: 個別具体の税務相談に見える表現の検出
//
// 税理士法上、「あなたの場合は」「御社の場合は」のような一人称的・断定的な言い回しと、
// 具体的な税額（円/万円表記）が同じ回答の中に同時に出てくると、あたかも利用者個別の
// 事情に基づいて税額を確定させたかのような「個別具体の税務相談」に読めてしまう危険がある。
// このテストは、その組み合わせが回答文に紛れ込んでいないかを機械的に検出する
// lint的なガードレールであり、完全な自然言語理解ではなく簡易なパターンマッチである点に注意。
// ------------------------------------------------------------------

/** 「あなた個人・自社に断定的に当てはめる」ことを示唆する一人称的フレーズ */
const INDIVIDUALIZED_ADVICE_PHRASES = [
  /あなたの場合は/,
  /お客様の場合は/,
  /御社の場合は/,
  /貴社の場合は/,
  /あなたは.{0,10}(できます|べきです|必要です)/,
];

/** 具体的な金額（例: 123,000円 / 65万円）を示すパターン */
const CONCRETE_AMOUNT_PATTERN = /\d[\d,]*\s*(円|万円)/;

/** 断定を強める語（「必ず」「確実に」など）が金額と結びついているケースも念のため検出する */
const DEFINITIVE_QUALIFIER_PATTERN = /(必ず|確実に|間違いなく)/;

export function hasIndividualizedAdviceRiskyPhrasing(text: string): boolean {
  const mentionsPersonalizedFraming = INDIVIDUALIZED_ADVICE_PHRASES.some((pattern) => pattern.test(text));
  if (!mentionsPersonalizedFraming) return false;
  return CONCRETE_AMOUNT_PATTERN.test(text) || DEFINITIVE_QUALIFIER_PATTERN.test(text);
}

describe("FAQ_ENTRIES compliance guardrail (税理士法第2条: 個別具体の税務相談の禁止)", () => {
  it("never combines a first-person definitive claim (e.g. あなたの場合は) with a concrete tax amount", () => {
    for (const entry of FAQ_ENTRIES) {
      expect(
        hasIndividualizedAdviceRiskyPhrasing(entry.answer),
        `entry "${entry.id}" answer looks like individualized tax advice: ${entry.answer}`
      ).toBe(false);
    }
  });

  it("detects the risky pattern in an obviously non-compliant example answer (sanity check for the guardrail itself)", () => {
    const badExample = "あなたの場合は、経費として120,000円を計上できます。";
    expect(hasIndividualizedAdviceRiskyPhrasing(badExample)).toBe(true);
  });

  it("does not flag general explanations that mention amounts without personalized framing", () => {
    const okExample = "青色申告特別控除は、要件を満たすと最大65万円の控除を受けられる制度です。";
    expect(hasIndividualizedAdviceRiskyPhrasing(okExample)).toBe(false);
  });

  it("does not flag personalized framing that stays qualitative (no concrete amount or definitive qualifier)", () => {
    const okExample = "あなたの場合は、税理士に確認することをおすすめします。";
    expect(hasIndividualizedAdviceRiskyPhrasing(okExample)).toBe(false);
  });

  it("every advisor-referral-relevant answer at least gestures toward consulting a tax accountant for individualized cases", () => {
    // advisorカテゴリの回答は、提携税理士への送客導線という趣旨から外れていないことを確認する
    const advisorEntries = FAQ_ENTRIES.filter((e) => e.category === "advisor");
    expect(advisorEntries.length).toBeGreaterThan(0);
    for (const entry of advisorEntries) {
      expect(entry.answer).toMatch(/税理士/);
    }
  });
});

import { describe, expect, it } from "vitest";
import { ELTAX_SUBMISSION_STEPS, ETAX_SUBMISSION_STEPS, getSubmissionSteps } from "./submissionSteps";

// 税理士法対応の要件: 「当社が申告書を作成/送信する」という表現ではなく、
// 「送信は本人の権限・操作で行う」ことを各ステップで明確にする必要がある。
// これを自動テストで担保し、将来の文言変更でこの前提が崩れないようにする。
describe("submission step compliance wording", () => {
  it.each([
    ["etax", ETAX_SUBMISSION_STEPS],
    ["eltax", ELTAX_SUBMISSION_STEPS],
  ] as const)("%s exposes exactly 5 steps, each with a self-operation notice", (_system, steps) => {
    expect(steps).toHaveLength(5);
    steps.forEach((step, i) => {
      expect(step.id).toBe(i + 1);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
      expect(step.selfOperationNotice).toMatch(/本人/);
    });
  });

  it("never claims the company performs the actual submission on the user's behalf", () => {
    const allNotices = [...ETAX_SUBMISSION_STEPS, ...ELTAX_SUBMISSION_STEPS].map((s) => s.selfOperationNotice);
    for (const notice of allNotices) {
      expect(notice).not.toMatch(/当社が(送信|代理送信)します/);
    }
  });
});

describe("getSubmissionSteps", () => {
  it("returns the e-Tax steps for 'etax'", () => {
    expect(getSubmissionSteps("etax")).toBe(ETAX_SUBMISSION_STEPS);
  });

  it("returns the eLTAX steps for 'eltax'", () => {
    expect(getSubmissionSteps("eltax")).toBe(ELTAX_SUBMISSION_STEPS);
  });
});

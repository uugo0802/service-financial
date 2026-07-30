import { describe, expect, it } from "vitest";
import { EMPTY_TENANT_PROFILE_DRAFT, TenantProfileDraft } from "../db/tenants";
import {
  completeCurrentOnboardingStep,
  completeOnboardingStep,
  createOnboardingWizardState,
  getOnboardingProgressPercent,
  getOnboardingStepDefinition,
  getOnboardingStepFieldErrors,
  goToOnboardingStep,
  isOnboardingComplete,
  isOnboardingStepCompleted,
  isOnboardingStepUnlocked,
  isOnboardingStepValid,
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL_STEPS,
  resetOnboardingWizardState,
} from "./steps";

const validIndividualDraft: TenantProfileDraft = {
  entityType: "individual",
  displayName: "山田商店",
  fiscalYearEndMonth: "",
  blueReturn: true,
};

const validCorpDraft: TenantProfileDraft = {
  entityType: "corp",
  displayName: "今ごえん合同会社",
  fiscalYearEndMonth: "3",
  blueReturn: false,
};

describe("ONBOARDING_STEPS", () => {
  it("defines 4 steps in the expected order", () => {
    expect(ONBOARDING_TOTAL_STEPS).toBe(4);
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual(["entityType", "fiscalYear", "blueReturn", "review"]);
  });
});

describe("getOnboardingStepDefinition", () => {
  it("returns the matching step definition for a valid 1-indexed step number", () => {
    expect(getOnboardingStepDefinition(1)).toEqual(ONBOARDING_STEPS[0]);
    expect(getOnboardingStepDefinition(4)).toEqual(ONBOARDING_STEPS[3]);
  });

  it("returns undefined for step 0 and negative step numbers", () => {
    expect(getOnboardingStepDefinition(0)).toBeUndefined();
    expect(getOnboardingStepDefinition(-1)).toBeUndefined();
  });

  it("returns undefined for a step number beyond the last step", () => {
    expect(getOnboardingStepDefinition(ONBOARDING_TOTAL_STEPS + 1)).toBeUndefined();
  });
});

describe("getOnboardingStepFieldErrors / isOnboardingStepValid", () => {
  it("flags a missing display name on step 1", () => {
    const draft = { ...EMPTY_TENANT_PROFILE_DRAFT };
    const errors = getOnboardingStepFieldErrors(draft, 1);
    expect(errors.displayName).toBeDefined();
    expect(isOnboardingStepValid(draft, 1)).toBe(false);
  });

  it("passes step 1 once display name is filled in", () => {
    expect(isOnboardingStepValid(validIndividualDraft, 1)).toBe(true);
  });

  it("does not require a fiscal year end month on step 2 for an individual", () => {
    const draft: TenantProfileDraft = { ...validIndividualDraft, fiscalYearEndMonth: "" };
    expect(getOnboardingStepFieldErrors(draft, 2)).toEqual({});
    expect(isOnboardingStepValid(draft, 2)).toBe(true);
  });

  it("requires a fiscal year end month on step 2 for a corp", () => {
    const draft: TenantProfileDraft = { ...validCorpDraft, fiscalYearEndMonth: "" };
    const errors = getOnboardingStepFieldErrors(draft, 2);
    expect(errors.fiscalYearEndMonth).toBeDefined();
    expect(isOnboardingStepValid(draft, 2)).toBe(false);
  });

  it("rejects an out-of-range fiscal year end month for a corp", () => {
    const draft: TenantProfileDraft = { ...validCorpDraft, fiscalYearEndMonth: "13" };
    expect(isOnboardingStepValid(draft, 2)).toBe(false);
  });

  it("does not surface display-name errors on step 2 even though the field is still invalid overall", () => {
    const draft: TenantProfileDraft = { ...validCorpDraft, displayName: "", fiscalYearEndMonth: "3" };
    expect(getOnboardingStepFieldErrors(draft, 2)).toEqual({});
    expect(isOnboardingStepValid(draft, 2)).toBe(true);
  });

  it("step 3 (blue/white return) has no field errors regardless of value", () => {
    expect(getOnboardingStepFieldErrors(validIndividualDraft, 3)).toEqual({});
    expect(isOnboardingStepValid({ ...validIndividualDraft, blueReturn: false }, 3)).toBe(true);
  });

  it("the review step (4) surfaces every remaining error across the whole draft", () => {
    const draft: TenantProfileDraft = { ...EMPTY_TENANT_PROFILE_DRAFT, entityType: "corp" };
    const errors = getOnboardingStepFieldErrors(draft, 4);
    expect(errors.displayName).toBeDefined();
    expect(errors.fiscalYearEndMonth).toBeDefined();
    expect(isOnboardingStepValid(draft, 4)).toBe(false);
  });

  it("the review step is valid once the whole draft is valid", () => {
    expect(isOnboardingStepValid(validCorpDraft, 4)).toBe(true);
  });

  it("returns no errors for an out-of-range step number", () => {
    expect(getOnboardingStepFieldErrors(validIndividualDraft, 99)).toEqual({});
  });
});

describe("createOnboardingWizardState", () => {
  it("starts at step 1 with nothing completed and only step 1 unlocked", () => {
    const state = createOnboardingWizardState();
    expect(state.displayedStep).toBe(1);
    expect(state.completedSteps).toEqual([]);
    expect(isOnboardingStepUnlocked(state, 1)).toBe(true);
    expect(isOnboardingStepUnlocked(state, 2)).toBe(false);
  });
});

describe("completeOnboardingStep", () => {
  it("gates advancing to the next step when the current step's required fields are invalid", () => {
    const state = createOnboardingWizardState();
    const draft = { ...EMPTY_TENANT_PROFILE_DRAFT }; // missing displayName -> step 1 invalid
    const attempt = completeOnboardingStep(state, draft, 1);

    expect(attempt).toEqual(state);
    expect(attempt.displayedStep).toBe(1);
    expect(isOnboardingStepCompleted(attempt, 1)).toBe(false);
    expect(isOnboardingStepUnlocked(attempt, 2)).toBe(false);
  });

  it("advances and unlocks the next step once the current step is valid", () => {
    const state = createOnboardingWizardState();
    const next = completeOnboardingStep(state, validIndividualDraft, 1);

    expect(isOnboardingStepCompleted(next, 1)).toBe(true);
    expect(next.displayedStep).toBe(2);
    expect(isOnboardingStepUnlocked(next, 2)).toBe(true);
    expect(isOnboardingStepUnlocked(next, 3)).toBe(false);
  });

  it("ignores an attempt to complete a step that is not yet unlocked", () => {
    const state = createOnboardingWizardState();
    const attempt = completeOnboardingStep(state, validCorpDraft, 3); // step 3 is locked

    expect(attempt).toEqual(state);
  });

  it("gates the fiscal-year step for a corp with a missing month, even though step 1 is valid", () => {
    let state = createOnboardingWizardState();
    state = completeOnboardingStep(state, validCorpDraft, 1);
    expect(state.displayedStep).toBe(2);

    const draftMissingMonth: TenantProfileDraft = { ...validCorpDraft, fiscalYearEndMonth: "" };
    const attempt = completeOnboardingStep(state, draftMissingMonth, 2);

    expect(attempt).toEqual(state);
    expect(isOnboardingStepCompleted(attempt, 2)).toBe(false);
  });

  it("does not advance past the last step when completing the review step", () => {
    let state = createOnboardingWizardState();
    state = completeOnboardingStep(state, validCorpDraft, 1);
    state = completeOnboardingStep(state, validCorpDraft, 2);
    state = completeOnboardingStep(state, validCorpDraft, 3);
    state = completeOnboardingStep(state, validCorpDraft, 4);

    expect(state.displayedStep).toBe(4);
    expect(isOnboardingComplete(state)).toBe(true);
  });

  it("is idempotent when completing an already-completed step twice", () => {
    let state = createOnboardingWizardState();
    state = completeOnboardingStep(state, validIndividualDraft, 1);
    const again = completeOnboardingStep(state, validIndividualDraft, 1);

    expect(again.completedSteps).toEqual([1]);
    expect(again.displayedStep).toBe(2);
  });
});

describe("completeCurrentOnboardingStep", () => {
  it("completes whatever step is currently displayed", () => {
    const state = createOnboardingWizardState();
    const next = completeCurrentOnboardingStep(state, validIndividualDraft);
    expect(isOnboardingStepCompleted(next, 1)).toBe(true);
    expect(next.displayedStep).toBe(2);
  });
});

describe("goToOnboardingStep (going back a step)", () => {
  it("allows navigating back to an already-unlocked step to review it", () => {
    let state = createOnboardingWizardState();
    state = completeOnboardingStep(state, validCorpDraft, 1);
    state = completeOnboardingStep(state, validCorpDraft, 2); // displayedStep is now 3

    const back = goToOnboardingStep(state, 1);
    expect(back.displayedStep).toBe(1);
    // completed/unlocked status is preserved even though we navigated back
    expect(isOnboardingStepCompleted(back, 1)).toBe(true);
    expect(isOnboardingStepCompleted(back, 2)).toBe(true);
    expect(isOnboardingStepUnlocked(back, 3)).toBe(true);
  });

  it("refuses to jump ahead to a step that has not been unlocked yet", () => {
    const state = createOnboardingWizardState();
    const attempt = goToOnboardingStep(state, 4);
    expect(attempt).toEqual(state);
  });

  it("refuses to navigate to step 0 or a negative step number", () => {
    const state = createOnboardingWizardState();
    expect(goToOnboardingStep(state, 0)).toEqual(state);
    expect(goToOnboardingStep(state, -2)).toEqual(state);
  });
});

describe("getOnboardingProgressPercent", () => {
  it("computes the percentage of completed steps at each step", () => {
    let state = createOnboardingWizardState();
    expect(getOnboardingProgressPercent(state)).toBe(0);

    state = completeOnboardingStep(state, validCorpDraft, 1);
    expect(getOnboardingProgressPercent(state)).toBe(25);

    state = completeOnboardingStep(state, validCorpDraft, 2);
    expect(getOnboardingProgressPercent(state)).toBe(50);

    state = completeOnboardingStep(state, validCorpDraft, 3);
    expect(getOnboardingProgressPercent(state)).toBe(75);

    state = completeOnboardingStep(state, validCorpDraft, 4);
    expect(getOnboardingProgressPercent(state)).toBe(100);
  });
});

describe("isOnboardingComplete", () => {
  it("is false until every step (including review) has been completed", () => {
    let state = createOnboardingWizardState();
    expect(isOnboardingComplete(state)).toBe(false);

    state = completeOnboardingStep(state, validIndividualDraft, 1);
    state = completeOnboardingStep(state, validIndividualDraft, 2);
    state = completeOnboardingStep(state, validIndividualDraft, 3);
    expect(isOnboardingComplete(state)).toBe(false);

    state = completeOnboardingStep(state, validIndividualDraft, 4);
    expect(isOnboardingComplete(state)).toBe(true);
  });

  it("blocks final completion at the review step if an earlier field becomes invalid again", () => {
    let state = createOnboardingWizardState();
    state = completeOnboardingStep(state, validCorpDraft, 1);
    state = completeOnboardingStep(state, validCorpDraft, 2);
    state = completeOnboardingStep(state, validCorpDraft, 3);

    const brokenDraft: TenantProfileDraft = { ...validCorpDraft, fiscalYearEndMonth: "" };
    const attempt = completeOnboardingStep(state, brokenDraft, 4);

    expect(attempt).toEqual(state);
    expect(isOnboardingComplete(attempt)).toBe(false);
  });
});

describe("resetOnboardingWizardState", () => {
  it("returns a fresh state equivalent to createOnboardingWizardState", () => {
    const progressed = completeOnboardingStep(createOnboardingWizardState(), validIndividualDraft, 1);
    expect(isOnboardingStepCompleted(progressed, 1)).toBe(true); // sanity check: progress was actually made

    const reset = resetOnboardingWizardState();
    expect(reset).toEqual(createOnboardingWizardState());
    expect(isOnboardingStepCompleted(reset, 1)).toBe(false);
  });
});

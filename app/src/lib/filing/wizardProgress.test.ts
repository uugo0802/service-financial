import { describe, expect, it } from "vitest";
import {
  completeStep,
  createWizardState,
  getProgressPercent,
  goToStep,
  isStepCompleted,
  isStepUnlocked,
  isWizardComplete,
  resetWizardState,
} from "./wizardProgress";

describe("createWizardState", () => {
  it("starts at step 1 with nothing completed and only step 1 unlocked", () => {
    const state = createWizardState(5);
    expect(state.displayedStep).toBe(1);
    expect(state.completedSteps).toEqual([]);
    expect(isStepUnlocked(state, 1)).toBe(true);
    expect(isStepUnlocked(state, 2)).toBe(false);
  });

  it("throws for a non-positive or non-integer total", () => {
    expect(() => createWizardState(0)).toThrow();
    expect(() => createWizardState(-1)).toThrow();
    expect(() => createWizardState(2.5)).toThrow();
  });
});

describe("completeStep", () => {
  it("marks the current step completed and unlocks/advances to the next one", () => {
    const state = createWizardState(5);
    const next = completeStep(state, 5, 1);

    expect(isStepCompleted(next, 1)).toBe(true);
    expect(next.displayedStep).toBe(2);
    expect(isStepUnlocked(next, 2)).toBe(true);
    expect(isStepUnlocked(next, 3)).toBe(false);
  });

  it("ignores an attempt to complete a step that is not yet unlocked", () => {
    const state = createWizardState(5);
    const attempt = completeStep(state, 5, 3); // step 3 is locked, only step 1 is unlocked

    expect(attempt).toEqual(state);
    expect(isStepCompleted(attempt, 3)).toBe(false);
  });

  it("ignores step 0 and negative step numbers instead of treating them as unlocked", () => {
    const state = createWizardState(5);

    expect(completeStep(state, 5, 0)).toEqual(state);
    expect(completeStep(state, 5, -1)).toEqual(state);
    expect(isStepCompleted(state, 0)).toBe(false);
  });

  it("throws when totalSteps is not a positive integer", () => {
    const state = createWizardState(5);
    expect(() => completeStep(state, 0, 1)).toThrow();
    expect(() => completeStep(state, -3, 1)).toThrow();
    expect(() => completeStep(state, 2.5, 1)).toThrow();
  });

  it("does not advance past the last step when completing the final step", () => {
    let state = createWizardState(3);
    state = completeStep(state, 3, 1);
    state = completeStep(state, 3, 2);
    state = completeStep(state, 3, 3);

    expect(state.displayedStep).toBe(3);
    expect(isWizardComplete(state, 3)).toBe(true);
  });

  it("is idempotent when completing an already-completed step twice", () => {
    let state = createWizardState(5);
    state = completeStep(state, 5, 1);
    const again = completeStep(state, 5, 1);

    expect(again.completedSteps).toEqual([1]);
    expect(again.displayedStep).toBe(2);
  });
});

describe("goToStep", () => {
  it("allows navigating back to an already-unlocked step to review it", () => {
    let state = createWizardState(5);
    state = completeStep(state, 5, 1);
    state = completeStep(state, 5, 2); // displayedStep is now 3

    const back = goToStep(state, 1);
    expect(back.displayedStep).toBe(1);
    // completed/unlocked status is preserved even though we navigated back
    expect(isStepCompleted(back, 1)).toBe(true);
    expect(isStepCompleted(back, 2)).toBe(true);
    expect(isStepUnlocked(back, 3)).toBe(true);
  });

  it("refuses to jump ahead to a step that has not been unlocked yet", () => {
    const state = createWizardState(5);
    const attempt = goToStep(state, 4);

    expect(attempt).toEqual(state);
  });

  it("refuses to navigate to step 0 or a negative step number", () => {
    const state = createWizardState(5);

    expect(goToStep(state, 0)).toEqual(state);
    expect(goToStep(state, -2)).toEqual(state);
  });
});

describe("getProgressPercent", () => {
  it("computes the percentage of completed steps", () => {
    let state = createWizardState(4);
    expect(getProgressPercent(state, 4)).toBe(0);

    state = completeStep(state, 4, 1);
    expect(getProgressPercent(state, 4)).toBe(25);

    state = completeStep(state, 4, 2);
    state = completeStep(state, 4, 3);
    state = completeStep(state, 4, 4);
    expect(getProgressPercent(state, 4)).toBe(100);
  });
});

describe("isWizardComplete", () => {
  it("is false until every step has been completed", () => {
    let state = createWizardState(2);
    expect(isWizardComplete(state, 2)).toBe(false);

    state = completeStep(state, 2, 1);
    expect(isWizardComplete(state, 2)).toBe(false);

    state = completeStep(state, 2, 2);
    expect(isWizardComplete(state, 2)).toBe(true);
  });
});

describe("resetWizardState", () => {
  it("returns a fresh state equivalent to createWizardState", () => {
    const progressed = completeStep(createWizardState(5), 5, 1);
    expect(isStepCompleted(progressed, 1)).toBe(true); // sanity check: progress was actually made

    const reset = resetWizardState(5);
    expect(reset).toEqual(createWizardState(5));
    expect(isStepCompleted(reset, 1)).toBe(false);
  });
});

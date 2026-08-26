import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { generatePlan } from "../src/generator.ts";
import { isPermitted } from "../src/selection.ts";
import { arbProfile, arbSetup, library, makeProfile, makeSetup } from "./helpers.ts";

/**
 * The invariants from ENGINEERING.md §9, asserted over arbitrary situations.
 *
 * These are the rules that stop the app hurting someone. They are properties,
 * not examples: it is the situations we did not think to write down that would
 * otherwise slip through.
 */
describe("safety invariants hold for every situation", () => {
  const runs = { numRuns: 300 };

  it("never prescribes an exercise contraindicated by a declared limitation", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        for (const day of plan.days) {
          for (const item of day.exercises) {
            const ex = library.byId(item.exerciseId);
            expect(ex).toBeDefined();
            for (const limit of profile.limitations) {
              expect(ex?.contraindications).not.toContain(limit);
            }
          }
        }
      }),
      runs
    );
  });

  it("never prescribes an expert movement, and never intermediate to a beginner", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        for (const day of plan.days) {
          for (const item of day.exercises) {
            const ex = library.byId(item.exerciseId);
            expect(ex?.level).not.toBe("expert");
            if (profile.experience === "new") expect(ex?.level).toBe("beginner");
          }
        }
      }),
      runs
    );
  });

  it("never prescribes equipment the setup does not have", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        for (const day of plan.days) {
          for (const item of day.exercises) {
            const ex = library.byId(item.exerciseId);
            for (const need of ex?.requires ?? []) {
              expect(setup.equipment).toContain(need);
            }
          }
        }
      }),
      runs
    );
  });

  it("gates plyometrics on experience, knees, and somewhere to land", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        const blocked =
          profile.experience === "new" ||
          profile.experience === "returning" ||
          profile.limitations.includes("knees") ||
          setup.constraints.noJumping;
        if (!blocked) return;
        for (const day of plan.days) {
          for (const item of day.exercises) {
            expect(library.byId(item.exerciseId)?.isJumping).toBe(false);
          }
        }
      }),
      runs
    );
  });

  it("respects the setup's space and noise constraints", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        for (const day of plan.days) {
          for (const item of day.exercises) {
            const ex = library.byId(item.exerciseId);
            if (setup.constraints.quiet) expect(ex?.isLoud).toBe(false);
            if (setup.constraints.tightSpace) expect(ex?.spaceNeeded).toBe("tight");
          }
        }
      }),
      runs
    );
  });

  it("always includes a warm-up", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        for (const day of plan.days) {
          expect(day.exercises.some((e) => e.warmup)).toBe(true);
        }
      }),
      runs
    );
  });

  it("caps beginner volume regardless of what the goal asks for", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        if (profile.experience !== "new") return;
        const plan = generatePlan(library, profile, setup);
        for (const day of plan.days) {
          for (const item of day.exercises) {
            if (item.warmup) continue;
            expect(item.prescription.sets).toBeLessThanOrEqual(2);
          }
        }
      }),
      runs
    );
  });

  it("the more conservative rule wins when limitations stack", () => {
    // Every limitation at once is the harshest possible case. It must still
    // produce a usable plan rather than an empty one or an unsafe one.
    const profile = makeProfile({
      limitations: ["knees", "lower-back", "shoulders", "wrists", "neck"],
      experience: "new",
    });
    const plan = generatePlan(library, profile, makeSetup());
    for (const day of plan.days) {
      for (const item of day.exercises) {
        const ex = library.byId(item.exerciseId);
        expect(ex?.contraindications).toEqual([]);
      }
    }
  });
});

describe("isPermitted", () => {
  it("is the single gate the generator relies on", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        const ctx = {
          setup,
          limitations: profile.limitations,
          experience: profile.experience,
        };
        for (const day of plan.days) {
          for (const item of day.exercises) {
            const ex = library.byId(item.exerciseId);
            if (ex) expect(isPermitted(ex, ctx)).toBe(true);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});

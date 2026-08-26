import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  estimateDaySeconds,
  estimateExerciseSeconds,
  generatePlan,
} from "../src/generator.ts";
import { resolveArchetype } from "../src/archetypes.ts";
import { resolveTier } from "../src/equipment.ts";
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

  it("warms up with movement, never a held stretch", () => {
    // Holding a static stretch before strength work measurably reduces output,
    // so a warm-up built from held folds is worse than none.
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        for (const day of plan.days) {
          for (const item of day.exercises) {
            if (!item.warmup) continue;
            expect(library.byId(item.exerciseId)?.dynamic, item.exerciseId).toBe(true);
          }
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

/**
 * The generator's contract from ENGINEERING.md §8, minus the safety rules
 * above: it must fill the session it promised, in the time it promised.
 *
 * These are the properties the doc names and the suite was missing -- which is
 * why a plan could quietly hand someone 31 minutes of a 75-minute request.
 */
describe("the plan is the plan we said we would build", () => {
  const runs = { numRuns: 300 };

  it("never leaves a session with nothing in it", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        expect(plan.days.length).toBe(profile.schedule.daysPerWeek);
        for (const day of plan.days) {
          const work = day.exercises.filter((e) => !e.warmup);
          expect(work.length, `${day.name} has no working exercise`).toBeGreaterThan(0);
        }
      }),
      runs
    );
  });

  it("never prescribes the same movement twice in one session", () => {
    // A warm-up that repeats the work is not a warm-up, and a day that lists
    // the same lift twice reads as a bug to the person doing it.
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        for (const day of plan.days) {
          const ids = day.exercises.map((e) => e.exerciseId);
          expect(new Set(ids).size, `${day.name} repeats a movement`).toBe(ids.length);
        }
      }),
      runs
    );
  });

  it("gives every day a name you can tell apart from the others", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const names = generatePlan(library, profile, setup).days.map((d) => d.name);
        expect(new Set(names).size).toBe(names.length);
      }),
      runs
    );
  });

  it("never overruns the time budget", () => {
    // Someone who set aside 30 minutes has 30 minutes. This one is absolute.
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const budget = profile.schedule.minutesPerSession * 60;
        for (const day of generatePlan(library, profile, setup).days) {
          expect(
            estimateDaySeconds(day),
            `${day.name} overruns ${profile.schedule.minutesPerSession}min`
          ).toBeLessThanOrEqual(budget);
        }
      }),
      runs
    );
  });

  /**
   * The budget is a ceiling the plan fills as far as sound programming allows,
   * not a quota it must hit: padding a beginner's session to fill an hour would
   * breach safety rule 5, and a pool thinned by limitations and a tight room
   * runs out of movements before it runs out of minutes.
   *
   * So the guarantee is stated in two halves -- more time never buys less, and
   * where nothing else is binding, the time asked for is the time given.
   */
  it("never gives less training for more time", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const at = (minutesPerSession: number): number => {
          const p = { ...profile, schedule: { ...profile.schedule, minutesPerSession } };
          return estimateDaySeconds(generatePlan(library, p, setup).days[0]!);
        };

        expect(at(45), "45 minutes gave less than 20").toBeGreaterThanOrEqual(at(20));
        expect(at(75), "75 minutes gave less than 45").toBeGreaterThanOrEqual(at(45));
      }),
      { numRuns: 120 }
    );
  });

  it("leaves no room it could have used", () => {
    // The fitter's own job, stated exactly: if any exercise is still below the
    // archetype's set ceiling, adding one more set to the cheapest of them must
    // overrun. Anything less means budget was left on the table.
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const budget = profile.schedule.minutesPerSession * 60;
        const arch = resolveArchetype(
          profile.goal,
          resolveTier(setup.equipment),
          profile.experience,
          profile.schedule.daysPerWeek
        );
        const ceiling =
          profile.experience === "new" ? arch.sets : arch.sets + (arch.reps === null ? 3 : 1);

        for (const day of generatePlan(library, profile, setup).days) {
          const growable = day.exercises.filter(
            (e) => !e.warmup && e.prescription.sets < ceiling
          );
          if (growable.length === 0) continue;

          const cheapest = Math.min(
            ...growable.map(
              (e) =>
                estimateExerciseSeconds({
                  ...e.prescription,
                  sets: e.prescription.sets + 1,
                }) - estimateExerciseSeconds(e.prescription)
            )
          );
          expect(
            estimateDaySeconds(day) + cheapest,
            `${day.name} had room for another set and did not take it`
          ).toBeGreaterThan(budget);
        }
      }),
      runs
    );
  });

  it("never puts a jump in a mobility session", () => {
    // Safety rule 6. It currently holds by how MOBILITY_DAY is composed rather
    // than by construction, which is exactly the kind of thing that decays.
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, { ...profile, goal: "mobility" }, setup);
        for (const day of plan.days) {
          for (const item of day.exercises) {
            expect(library.byId(item.exerciseId)?.isJumping).toBe(false);
          }
        }
      }),
      runs
    );
  });
});

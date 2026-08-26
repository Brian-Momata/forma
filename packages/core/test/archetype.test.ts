import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveArchetype } from "../src/archetypes.ts";
import { resolveTier } from "../src/equipment.ts";
import { estimateDaySeconds, generatePlan } from "../src/generator.ts";
import type { EquipmentId } from "../src/types.ts";
import { arbProfile, arbSetup, library, makeProfile, makeSetup } from "./helpers.ts";

/**
 * The product requirement, as a test.
 *
 * "Home with dumbbells", "a gym with no leg press", and "home with nothing"
 * must be three different plans -- not one plan with the names swapped. If
 * this file ever goes green while the plans are cosmetically different but
 * structurally identical, the app has lost its reason to exist.
 */
const SITUATIONS: Array<{ name: string; equipment: EquipmentId[] }> = [
  { name: "nothing", equipment: [] },
  { name: "bands only", equipment: ["bands"] },
  { name: "dumbbells", equipment: ["dumbbells", "bench"] },
  { name: "garage gym", equipment: ["barbell", "rack", "bench"] },
  { name: "full gym", equipment: ["barbell", "rack", "bench", "cable", "machines", "dumbbells"] },
];

describe("the same goal produces structurally different plans per situation", () => {
  const profile = makeProfile({ goal: "strength", experience: "consistent" });

  const plans = SITUATIONS.map((s) => ({
    ...s,
    tier: resolveTier(s.equipment),
    plan: generatePlan(library, profile, makeSetup({ name: s.name, equipment: s.equipment })),
  }));

  it("resolves each situation to a distinct tier", () => {
    const tiers = plans.map((p) => p.tier);
    expect(new Set(tiers).size).toBe(SITUATIONS.length);
  });

  it("uses a different mechanism of progression per tier", () => {
    const methods = plans.map(
      (p) =>
        resolveArchetype(profile.goal, p.tier, profile.experience, 3).progression
    );
    // Bodyweight and bands both climb a ladder; the loaded tiers add weight.
    expect(methods).toEqual(["chain", "chain", "reps-then-load", "load", "load"]);
  });

  it("prescribes fewer reps and longer rest as load becomes available", () => {
    const shape = plans.map((p) => {
      const a = resolveArchetype(profile.goal, p.tier, profile.experience, 3);
      return { reps: a.reps?.[1] ?? 0, rest: a.restSec };
    });

    for (let i = 1; i < shape.length; i++) {
      const prev = shape[i - 1]!;
      const cur = shape[i]!;
      expect(cur.reps).toBeLessThanOrEqual(prev.reps);
      expect(cur.rest).toBeGreaterThanOrEqual(prev.rest);
    }
    // And the extremes must be meaningfully apart, not a rounding difference.
    expect(shape[0]!.reps - shape[shape.length - 1]!.reps).toBeGreaterThanOrEqual(6);
    expect(shape[shape.length - 1]!.rest - shape[0]!.rest).toBeGreaterThanOrEqual(40);
  });

  it("selects genuinely different exercises, not renamed equivalents", () => {
    const firstDayIds = plans.map(
      (p) =>
        new Set(
          p.plan.days[0]!.exercises.filter((e) => !e.warmup).map((e) => e.exerciseId)
        )
    );

    for (let i = 0; i < firstDayIds.length; i++) {
      for (let j = i + 1; j < firstDayIds.length; j++) {
        const a = firstDayIds[i]!;
        const b = firstDayIds[j]!;
        const shared = [...a].filter((id) => b.has(id)).length;
        const overlap = shared / Math.min(a.size, b.size);
        expect(overlap).toBeLessThan(0.75);
      }
    }
  });

  it("reaches for load whenever the situation offers it", () => {
    for (const p of plans) {
      if (p.tier === "bodyweight") continue;
      const working = p.plan.days[0]!.exercises.filter((e) => !e.warmup);
      const loaded = working.filter(
        (e) => (library.byId(e.exerciseId)?.requires.length ?? 0) > 0
      );
      expect(loaded.length).toBeGreaterThan(0);
    }
  });

  it("explains itself differently for each situation", () => {
    const rationales = plans.map((p) => p.plan.rationale);
    expect(new Set(rationales).size).toBe(SITUATIONS.length);
  });
});

describe("plan generation is total and honest", () => {
  it("always produces a usable plan, whatever the situation", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        expect(plan.days.length).toBe(profile.schedule.daysPerWeek);
        for (const day of plan.days) {
          const working = day.exercises.filter((e) => !e.warmup);
          expect(working.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("never overruns the session the person asked for", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const plan = generatePlan(library, profile, setup);
        const budget = profile.schedule.minutesPerSession * 60;
        for (const day of plan.days) {
          // A single mandatory exercise may exceed a very small budget; that is
          // preferable to handing back an empty session.
          const working = day.exercises.filter((e) => !e.warmup);
          if (working.length <= 1) continue;
          expect(estimateDaySeconds(day)).toBeLessThanOrEqual(budget);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("is deterministic: the same answers always give the same plan", () => {
    fc.assert(
      fc.property(arbProfile, arbSetup, (profile, setup) => {
        const a = generatePlan(library, profile, setup);
        const b = generatePlan(library, profile, setup);
        expect(JSON.stringify(a.days)).toEqual(JSON.stringify(b.days));
      }),
      { numRuns: 100 }
    );
  });

  it("fills every slot it can, balancing push against pull", () => {
    // A session that lost its only pull is a worse session than a shorter one.
    const profile = makeProfile({ goal: "strength", experience: "regular" });
    for (const s of SITUATIONS) {
      const plan = generatePlan(
        library,
        profile,
        makeSetup({ name: s.name, equipment: s.equipment })
      );
      const patterns = plan.days[0]!.exercises
        .filter((e) => !e.warmup)
        .map((e) => library.byId(e.exerciseId)?.pattern ?? "");
      const pushes = patterns.filter((p) => p.includes("push")).length;
      const pulls = patterns.filter((p) => p.includes("pull")).length;
      expect(pushes, `${s.name} has no push`).toBeGreaterThan(0);
      expect(pulls, `${s.name} has no pull`).toBeGreaterThan(0);
    }
  });
});

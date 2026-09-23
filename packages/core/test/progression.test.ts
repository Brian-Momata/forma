import { describe, expect, it } from "vitest";

import { generatePlan } from "../src/generator.ts";
import { applyFeedback, progressionNote } from "../src/progression.ts";
import type { SelectionContext } from "../src/selection.ts";
import type { EquipmentId, Feel, Plan } from "../src/types.ts";
import { library, makeProfile, makeSetup } from "./helpers.ts";

function build(equipment: EquipmentId[]) {
  const profile = makeProfile({ goal: "strength", experience: "regular" });
  const setup = makeSetup({ equipment });
  const plan = generatePlan(library, profile, setup);
  const ctx: SelectionContext = {
    setup,
    limitations: profile.limitations,
    experience: profile.experience,
  };
  return { plan, ctx };
}

const working = (plan: Plan) => plan.days[0]!.exercises.filter((e) => !e.warmup);
const warmups = (plan: Plan) => plan.days[0]!.exercises.filter((e) => e.warmup);

describe("progression responds to how the session felt", () => {
  it("advances the week on any feedback", () => {
    const { plan, ctx } = build([]);
    for (const feel of ["too-easy", "just-right", "too-hard"] as Feel[]) {
      expect(applyFeedback(library, plan, feel, ctx, 1).week).toBe(plan.week + 1);
    }
  });

  it("trims a set and lengthens rest when it was too hard", () => {
    const { plan, ctx } = build(["dumbbells", "bench"]);
    const next = applyFeedback(library, plan, "too-hard", ctx, 1);

    working(next).forEach((item, i) => {
      const before = working(plan)[i]!;
      expect(item.prescription.sets).toBeLessThanOrEqual(before.prescription.sets);
      expect(item.prescription.restSec).toBeGreaterThanOrEqual(before.prescription.restSec);
    });
  });

  it("nudges reps up when it felt just right", () => {
    const { plan, ctx } = build(["dumbbells", "bench"]);
    const next = applyFeedback(library, plan, "just-right", ctx, 1);

    working(next).forEach((item, i) => {
      const before = working(plan)[i]!;
      if (before.prescription.reps !== undefined) {
        expect(item.prescription.reps).toBe(before.prescription.reps + 1);
      }
      expect(item.prescription.sets).toBe(before.prescription.sets);
    });
  });

  it("never progresses the warm-up", () => {
    const { plan, ctx } = build([]);
    for (const feel of ["too-easy", "just-right", "too-hard"] as Feel[]) {
      const next = applyFeedback(library, plan, feel, ctx, 1);
      expect(warmups(next)).toEqual(warmups(plan));
    }
  });

  it("cannot drive a plan below one set or above five", () => {
    const { plan, ctx } = build(["dumbbells", "bench"]);
    let down = plan;
    for (let i = 0; i < 10; i++) down = applyFeedback(library, down, "too-hard", ctx, i);
    for (const item of working(down)) expect(item.prescription.sets).toBeGreaterThanOrEqual(1);

    let up = plan;
    for (let i = 0; i < 10; i++) up = applyFeedback(library, up, "too-easy", ctx, i);
    for (const item of working(up)) {
      expect(item.prescription.sets).toBeLessThanOrEqual(5);
      expect(item.prescription.reps ?? 0).toBeLessThanOrEqual(25);
    }
  });
});

describe("how you get stronger depends on the situation", () => {
  it("moves a bodyweight plan up its ladder rather than adding sets", () => {
    const { plan, ctx } = build([]);
    // Seed a plan that definitely contains a chained movement.
    const chained = working(plan).find((item) => library.byId(item.exerciseId)?.chainId);
    expect(chained, "expected a chained bodyweight movement").toBeDefined();

    const next = applyFeedback(library, plan, "too-easy", ctx, 1);
    const after = working(next).find(
      (_, i) => working(plan)[i]?.exerciseId === chained?.exerciseId
    );

    const before = library.byId(chained!.exerciseId)!;
    const now = library.byId(after!.exerciseId)!;
    expect(now.chainId).toBe(before.chainId);
    expect(now.chainRank ?? 0).toBeGreaterThan(before.chainRank ?? 0);
  });

  it("adds a set to the compounds on a dumbbell plan", () => {
    // reps-then-load: there is a weight, but not one you can nudge by a kilo,
    // so volume is the honest lever here.
    const { plan, ctx } = build(["dumbbells", "bench"]);
    const next = applyFeedback(library, plan, "too-easy", ctx, 1);

    const compoundBumped = working(next).some((item, i) => {
      const before = working(plan)[i];
      const ex = library.byId(item.exerciseId);
      return (
        ex?.mechanic === "compound" &&
        before !== undefined &&
        item.prescription.sets > before.prescription.sets
      );
    });
    expect(compoundBumped).toBe(true);
  });

  /**
   * The Complete screen tells someone on a barbell plan that next session
   * "keeps the reps and asks for a little more weight". It has to be true: this
   * is the tier whose entire progression is load.
   */
  describe("load tiers actually move the load", () => {
    it("raises the weight and leaves the reps alone once one is logged", () => {
      const { plan, ctx } = build(["barbell", "rack", "bench", "dumbbells"]);
      const first = working(plan)[0]!;
      const logged = new Map([[first.exerciseId, 60]]);

      const next = applyFeedback(library, plan, "too-easy", ctx, 1, logged);
      const after = working(next)[0]!;

      expect(after.prescription.targetWeightKg).toBeGreaterThan(60);
      expect(after.prescription.reps).toBe(first.prescription.reps);
      expect(after.prescription.sets).toBe(first.prescription.sets);
    });

    it("keeps climbing from the target once the plan carries one", () => {
      const { plan, ctx } = build(["barbell", "rack", "bench"]);
      const seeded: Plan = {
        ...plan,
        days: plan.days.map((d) => ({
          ...d,
          exercises: d.exercises.map((e) =>
            e.warmup ? e : { ...e, prescription: { ...e.prescription, targetWeightKg: 80 } }
          ),
        })),
      };

      const next = applyFeedback(library, seeded, "too-easy", ctx, 1);
      const repBased = working(next).filter((e) => e.prescription.reps !== undefined);
      expect(repBased.length).toBeGreaterThan(0);
      for (const item of repBased) {
        expect(item.prescription.targetWeightKg).toBeGreaterThan(80);
      }

      // A hold is not a lift: timed work progresses by duration, whatever the
      // tier, and must not have a weight pushed onto it.
      for (const item of working(next).filter((e) => e.prescription.durationSec !== undefined)) {
        expect(item.prescription.durationSec).toBeGreaterThan(
          working(seeded).find((s) => s.exerciseId === item.exerciseId)!.prescription
            .durationSec!
        );
      }
    });

    /**
     * The bug this guards: load progression was the only thing that ever wrote
     * `targetWeightKg`, so a dumbbell plan -- which progresses by reps -- threw
     * away the weight someone dialled in, every session, forever.
     */
    it("remembers the weight on a tier that does not progress by load", () => {
      const { plan, ctx } = build(["dumbbells", "bench"]);
      expect(plan.tier).toBe("dumbbell");
      const first = working(plan)[0]!;
      const logged = new Map([[first.exerciseId, 17.5]]);

      for (const feel of ["too-easy", "just-right", "too-hard"] as Feel[]) {
        const after = working(applyFeedback(library, plan, feel, ctx, 1, logged))[0]!;
        expect(after.prescription.targetWeightKg).toBe(17.5);
      }
    });

    it("follows the weight down when the person lifts lighter than the plan asked", () => {
      const { plan, ctx } = build(["dumbbells", "bench"]);
      const first = working(plan)[0]!;
      const seeded: Plan = {
        ...plan,
        days: plan.days.map((d) => ({
          ...d,
          exercises: d.exercises.map((e) =>
            e.warmup ? e : { ...e, prescription: { ...e.prescription, targetWeightKg: 20 } }
          ),
        })),
      };

      const logged = new Map([[first.exerciseId, 15]]);
      const after = working(applyFeedback(library, seeded, "just-right", ctx, 1, logged))[0]!;
      // Where they actually are, not where the plan hoped they would be.
      expect(after.prescription.targetWeightKg).toBe(15);
    });

    it("adds reps instead when nothing has been logged, and says so", () => {
      const { plan, ctx } = build(["barbell", "rack", "bench"]);
      const next = applyFeedback(library, plan, "too-easy", ctx, 1);

      const before = working(plan)[0]!;
      const after = working(next)[0]!;
      expect(after.prescription.targetWeightKg ?? null).toBeNull();
      expect(after.prescription.reps ?? 0).toBeGreaterThan(before.prescription.reps ?? 0);

      // And the screen must not promise a weight change that did not happen.
      expect(progressionNote("too-easy", { tier: "full-gym" }, false)).not.toContain(
        "more weight"
      );
    });
  });

  it("explains itself differently depending on the tier", () => {
    const bodyweight = progressionNote("too-easy", { tier: "bodyweight" });
    const gym = progressionNote("too-easy", { tier: "full-gym" });
    const dumbbell = progressionNote("too-easy", { tier: "dumbbell" });

    expect(bodyweight).toContain("harder variation");
    expect(gym).toContain("weight");
    expect(new Set([bodyweight, gym, dumbbell]).size).toBe(3);
  });

  it("keeps the design's wording for the too-hard case", () => {
    expect(progressionNote("too-hard", { tier: "bodyweight" })).toBe(
      "Next session trims a set and adds 15s to every rest."
    );
  });
});

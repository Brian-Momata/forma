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

  it("adds a set to the compounds on a loaded plan", () => {
    const { plan, ctx } = build(["barbell", "rack", "bench", "dumbbells"]);
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

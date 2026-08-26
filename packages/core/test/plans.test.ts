import { describe, expect, it } from "vitest";

import { emptyPlan, generatePlan } from "../src/generator.ts";
import { Plan, type Goal, type Schedule } from "../src/types.ts";
import { library, makeProfile, makeSetup } from "./helpers.ts";

/**
 * A person is not one goal.
 *
 * Someone can run a strength plan at the gym and a mobility plan at home in
 * the same week, so the goal and schedule belong to the plan rather than the
 * person -- the profile only supplies defaults.
 */
describe("a person can hold several plans at once", () => {
  const profile = makeProfile({ goal: "strength", experience: "regular" });
  const setup = makeSetup({ equipment: ["dumbbells", "bench"] });

  it("builds a different plan per goal from one profile", () => {
    const goals: Goal[] = ["strength", "fat-loss", "mobility", "endurance", "general"];
    const plans = goals.map((goal, i) =>
      generatePlan(library, profile, setup, { goal, planId: `plan-${i}` })
    );

    for (const [i, plan] of plans.entries()) {
      expect(plan.goal, `plan ${i}`).toBe(goals[i]);
      expect(Plan.safeParse(plan).success).toBe(true);
    }

    // Different goals must yield genuinely different sessions, not renames.
    const signatures = plans.map((p) =>
      p.days[0]!.exercises.filter((e) => !e.warmup).map((e) => e.exerciseId).join("|")
    );
    expect(new Set(signatures).size).toBeGreaterThan(1);
    expect(new Set(plans.map((p) => p.name)).size).toBe(goals.length);
  });

  it("honours a per-plan schedule instead of the profile's", () => {
    const schedule: Schedule = { daysPerWeek: 5, minutesPerSession: 45 };
    const plan = generatePlan(library, profile, setup, { schedule, planId: "p" });

    expect(plan.days).toHaveLength(5);
    expect(plan.schedule).toEqual(schedule);
    // The profile is untouched by a plan-level override.
    expect(profile.schedule.daysPerWeek).toBe(3);
  });

  it("stays reproducible: identical requests give identical plans", () => {
    // The plan id must NOT feed the seed. If it did, the same answers would
    // produce a different plan on every install, and "we built this from what
    // you told us" would stop being true.
    const a = generatePlan(library, profile, setup, { planId: "a" });
    const b = generatePlan(library, profile, setup, { planId: "b" });

    expect(a.id).not.toBe(b.id);
    expect(JSON.stringify(a.days)).toBe(JSON.stringify(b.days));
  });

  it("accepts a custom name", () => {
    const plan = generatePlan(library, profile, setup, { name: "  Winter block  ", planId: "p" });
    expect(plan.name).toBe("Winter block");
  });

  it("falls back to the profile when no override is given", () => {
    const plan = generatePlan(library, profile, setup, { planId: "p" });
    expect(plan.goal).toBe(profile.goal);
    expect(plan.schedule).toEqual(profile.schedule);
  });
});

describe("a plan can be built from scratch", () => {
  const setup = makeSetup({ equipment: ["dumbbells"] });

  it("starts empty, valid, and marked as the person's own", () => {
    const plan = emptyPlan(setup, {
      planId: "custom-1",
      name: "My own thing",
      goal: "strength",
      schedule: { daysPerWeek: 3, minutesPerSession: 40 },
      now: 1,
    });

    expect(Plan.safeParse(plan).success).toBe(true);
    expect(plan.generated).toBe(false);
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0]!.exercises).toHaveLength(0);
    // No invented rationale: we did not decide anything about it.
    expect(plan.tags).toEqual([]);
  });

  it("resolves the tier from the setup so the editor can still advise", () => {
    expect(
      emptyPlan(setup, {
        planId: "c",
        name: "n",
        goal: "general",
        schedule: { daysPerWeek: 1, minutesPerSession: 30 },
        now: 0,
      }).tier
    ).toBe("dumbbell");
  });
});

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import {
  createLibrary,
  Exercise,
  type Library,
  type Profile,
  type Setup,
  type SetupId,
} from "@form/core";
import raw from "../../../packages/core/src/library/exercises.json" with { type: "json" };

import {
  createCustomPlan,
  createGeneratedPlan,
  newId,
  plansForSetup,
  regenerateSetupPlans,
  saveSetup,
} from "./repo";

const library: Library = createLibrary((raw as unknown[]).map((r) => Exercise.parse(r)));

const profile: Profile = {
  goal: "strength",
  experience: "returning",
  schedule: { daysPerWeek: 3, minutesPerSession: 30 },
  limitations: [],
  units: "kg",
  accent: "#D4FF3F",
  restColor: "#8A7BFF",
  highContrast: false,
  autoAdvance: true,
  restOverrideSec: null,
  disclaimerAcceptedAt: 0,
  createdAt: 0,
  updatedAt: 0,
};

const setup: Setup = {
  id: newId("setup") as SetupId,
  name: "Home",
  location: "home",
  equipment: ["dumbbells", "bench"],
  constraints: { tightSpace: false, noJumping: false, quiet: false },
  createdAt: 0,
  updatedAt: 0,
};

/**
 * One person can run several plans in the same place. When the place changes,
 * *all* of them are stale -- a plan that still prescribes dumbbells you have
 * sold is the failure this guards against.
 */
describe("regenerating a setup's plans", () => {
  it("rebuilds every generated plan and leaves hand-built ones alone", async () => {
    await saveSetup(setup);

    const strength = await createGeneratedPlan(library, profile, setup, {
      goal: "strength",
      schedule: { daysPerWeek: 3, minutesPerSession: 30 },
      name: "Strength block",
    });
    const mobility = await createGeneratedPlan(library, profile, setup, {
      goal: "mobility",
      schedule: { daysPerWeek: 2, minutesPerSession: 20 },
      name: "Loosen up",
    });
    const mine = await createCustomPlan(setup, {
      goal: "general",
      schedule: { daysPerWeek: 1, minutesPerSession: 45 },
      name: "My own thing",
    });

    // The dumbbells are gone.
    const stripped: Setup = { ...setup, equipment: [] };
    await saveSetup(stripped);
    const rebuilt = await regenerateSetupPlans(library, profile, stripped);

    expect(rebuilt).toHaveLength(2);

    const after = await plansForSetup(setup.id);
    const byId = new Map(after.map((p) => [p.id, p]));

    // Each plan keeps its own identity: the rebuild is per plan, not one plan
    // per setup.
    expect(byId.get(strength.id)?.goal).toBe("strength");
    expect(byId.get(strength.id)?.name).toBe("Strength block");
    expect(byId.get(mobility.id)?.goal).toBe("mobility");
    expect(byId.get(mobility.id)?.schedule.daysPerWeek).toBe(2);

    // And neither still asks for equipment that is no longer there.
    for (const id of [strength.id, mobility.id]) {
      const plan = byId.get(id)!;
      expect(plan.tier).toBe("bodyweight");
      for (const day of plan.days) {
        for (const item of day.exercises) {
          expect(library.byId(item.exerciseId)?.requires ?? []).toHaveLength(0);
        }
      }
    }

    // The plan the person built is theirs.
    expect(byId.get(mine.id)).toEqual(mine);
  });

  it("does not invent a plan for a setup where someone only built their own", async () => {
    const other: Setup = { ...setup, id: newId("setup") as SetupId, name: "Hotel" };
    await saveSetup(other);
    await createCustomPlan(other, {
      goal: "general",
      schedule: { daysPerWeek: 2, minutesPerSession: 20 },
      name: "Hotel plan",
    });

    expect(await regenerateSetupPlans(library, profile, other)).toHaveLength(0);
    expect(await plansForSetup(other.id)).toHaveLength(1);
  });
});

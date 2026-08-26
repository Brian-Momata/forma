import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import Dexie from "dexie";

import type { PlanId, SessionId } from "@form/core";

import { FormDatabase } from "./schema";

/**
 * Migration tests.
 *
 * Losing someone's training history is the worst bug this app can ship
 * (ENGINEERING.md §5), so every migration is exercised against a database
 * built at the previous version.
 */
describe("v1 -> v2: plans gain their own goal and schedule", () => {
  it("backfills without losing anything", async () => {
    const name = `form-test-${Math.random().toString(36).slice(2)}`;

    // Build a database exactly as v1 wrote it: no goal, no schedule.
    const v1 = new Dexie(name);
    v1.version(1).stores({
      profile: "id, updatedAt",
      setups: "id, updatedAt, location",
      plans: "id, setupId, updatedAt",
      sessions: "id, planId, setupId, startedAt",
      meta: "key",
    });
    await v1.open();
    await v1.table("plans").put({
      id: "plan_old",
      setupId: "setup_1",
      name: "Old Plan",
      tier: "dumbbell",
      rationale: "…",
      tags: ["Home"],
      days: [
        { name: "A", weekday: null, exercises: [{ exerciseId: "Pushups", warmup: false, prescription: { sets: 3, reps: 10, restSec: 60 } }] },
        { name: "B", weekday: null, exercises: [] },
      ],
      week: 4,
      generated: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await v1.table("sessions").put({
      id: "session_old",
      planId: "plan_old",
      setupId: "setup_1",
      dayIndex: 0,
      startedAt: 10,
      endedAt: 20,
      sets: [{ exerciseId: "Pushups", setIndex: 0, reps: 10, durationSec: null, weightKg: null, skipped: false, completedAt: 15 }],
      feel: "just-right",
      createdAt: 10,
      updatedAt: 20,
    });
    v1.close();

    // Reopen at v2 and let the upgrade run.
    const db = new FormDatabase(name);
    await db.open();

    const plan = await db.plans.get("plan_old" as PlanId);
    expect(plan).toBeDefined();
    // Backfilled from the plan's own shape, not a guess.
    expect(plan?.schedule).toEqual({ daysPerWeek: 2, minutesPerSession: 30 });
    expect(plan?.goal).toBe("general");

    // And nothing else moved.
    expect(plan?.name).toBe("Old Plan");
    expect(plan?.week).toBe(4);
    expect(plan?.days).toHaveLength(2);
    expect(plan?.days[0]?.exercises[0]?.prescription.reps).toBe(10);

    const session = await db.sessions.get("session_old" as SessionId);
    expect(session?.sets).toHaveLength(1);
    expect(session?.feel).toBe("just-right");

    db.close();
  });
});

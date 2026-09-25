import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import type { PlanId, SetRecord, SetupId } from "@form/core";

import {
  countFinishedSessions,
  finishSession,
  getSession,
  newSession,
  recordSessionProgress,
  saveSession,
} from "./repo";
import { db } from "./schema";

const set = (exerciseId: string, index: number): SetRecord => ({
  exerciseId: exerciseId as SetRecord["exerciseId"],
  setIndex: index,
  reps: 10,
  durationSec: null,
  weightKg: 60,
  skipped: false,
  completedAt: 100 + index,
});

/**
 * Losing someone's training history is the worst bug this app can ship
 * (ENGINEERING.md §1.5), and the way it used to happen was quiet: sets lived in
 * memory until the person tapped Done on the summary, so closing the app one
 * screen early erased the whole workout.
 */
describe("a session survives the app closing", () => {
  it("banks sets as they happen, before anything is finished", async () => {
    await db.delete();
    await db.open();

    const session = newSession("p1" as PlanId, "s1" as SetupId, 0, "Full Body A");
    await saveSession(session);

    await recordSessionProgress(session.id, [set("Squat", 0), set("Squat", 1)], null);

    // Nothing has been "finished" -- this is mid-workout -- and the sets are
    // already durable.
    const stored = await getSession(session.id);
    expect(stored?.sets).toHaveLength(2);
    expect(stored?.endedAt).toBeNull();
  });

  it("keeps the sets when a session is ended early", async () => {
    await db.delete();
    await db.open();

    const session = newSession("p1" as PlanId, "s1" as SetupId, 0, "Full Body A");
    await saveSession(session);
    await recordSessionProgress(session.id, [set("Squat", 0)], null);
    // "End and save" closes the session out; it must not discard what was done.
    await recordSessionProgress(session.id, [set("Squat", 0)], 5_000);

    const stored = await getSession(session.id);
    expect(stored?.sets).toHaveLength(1);
    expect(stored?.endedAt).toBe(5_000);
    expect(await countFinishedSessions()).toBe(1);
  });

  it("does not move the end time when feedback arrives later", async () => {
    await db.delete();
    await db.open();

    const session = newSession("p1" as PlanId, "s1" as SetupId, 0, "Full Body A");
    await saveSession(session);
    await recordSessionProgress(session.id, [set("Squat", 0)], 5_000);
    await finishSession(session.id, [set("Squat", 0)], "just-right");

    const stored = await getSession(session.id);
    // The workout ended when it ended, not when someone got round to rating it.
    expect(stored?.endedAt).toBe(5_000);
    expect(stored?.feel).toBe("just-right");
  });

  it("records what the day was called at the time", async () => {
    await db.delete();
    await db.open();

    const session = newSession("p1" as PlanId, "s1" as SetupId, 0, "Full Body A");
    await saveSession(session);

    // History is a record, not a projection: renaming the plan's day later must
    // not rewrite what this session was.
    expect((await getSession(session.id))?.dayName).toBe("Full Body A");
  });

  it("counts every finished session, not just the loaded page of history", async () => {
    await db.delete();
    await db.open();

    for (let i = 0; i < 120; i++) {
      const s = newSession("p1" as PlanId, "s1" as SetupId, 0, "Day");
      await saveSession(s);
      await recordSessionProgress(s.id, [set("Squat", 0)], 1_000 + i);
    }

    // listSessions() stops at 100; a lifetime total that silently stops moving
    // at 100 is worse than no total at all.
    expect(await countFinishedSessions()).toBe(120);
  });

  it("does not keep a session that closed with nothing done", async () => {
    await db.delete();
    await db.open();

    // Opened by mistake and ended straight away, or every set skipped: it is
    // not a day trained, so it must not count, keep a streak alive, or move
    // the plan on to the next day.
    const empty = newSession("p1" as PlanId, "s1" as SetupId, 0, "Full Body A");
    await saveSession(empty);
    await recordSessionProgress(empty.id, [], 5_000);
    expect(await getSession(empty.id)).toBeUndefined();

    const skipped = newSession("p1" as PlanId, "s1" as SetupId, 0, "Full Body A");
    await saveSession(skipped);
    await recordSessionProgress(skipped.id, [{ ...set("Squat", 0), skipped: true }], null);
    await finishSession(skipped.id, [{ ...set("Squat", 0), skipped: true }], "just-right");
    expect(await getSession(skipped.id)).toBeUndefined();

    expect(await countFinishedSessions()).toBe(0);
  });

  it("keeps a session still in progress even before its first set", async () => {
    await db.delete();
    await db.open();

    const session = newSession("p1" as PlanId, "s1" as SetupId, 0, "Full Body A");
    await saveSession(session);
    await recordSessionProgress(session.id, [], null);
    expect(await getSession(session.id)).toBeDefined();
  });

  it("does not let a late mid-session write erase the feedback", async () => {
    await db.delete();
    await db.open();

    const session = newSession("p1" as PlanId, "s1" as SetupId, 0, "Full Body A");
    await saveSession(session);
    // The store fires these without waiting, so they can interleave.
    await Promise.all([
      recordSessionProgress(session.id, [set("Squat", 0)], 5_000),
      finishSession(session.id, [set("Squat", 0)], "too-easy"),
      recordSessionProgress(session.id, [set("Squat", 0)], 5_000),
    ]);
    expect((await getSession(session.id))?.feel).toBe("too-easy");
  });
});

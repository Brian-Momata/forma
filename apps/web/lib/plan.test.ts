import { describe, expect, it } from "vitest";
import { createLibrary, Exercise, type Library, type PlanDay, type Session } from "@form/core";
import raw from "../../../packages/core/src/library/exercises.json" with { type: "json" };

import {
  lastLoggedWeights,
  resolveDay,
  streakDays,
  summarise,
  upcomingDays,
  weekProgress,
} from "./plan";

const library: Library = createLibrary((raw as unknown[]).map((r) => Exercise.parse(r)));

const day = (name: string, exerciseIds: string[]): PlanDay => ({
  name,
  weekday: null,
  exercises: exerciseIds.map((id) => ({
    exerciseId: id as PlanDay["exercises"][number]["exerciseId"],
    warmup: false,
    prescription: { sets: 3, reps: 10, restSec: 60 },
  })),
});

const session = (startedAt: number, ended = true): Session =>
  ({
    id: `s${startedAt}`,
    planId: "p",
    setupId: "su",
    dayIndex: 0,
    startedAt,
    endedAt: ended ? startedAt + 1000 : null,
    sets: [],
    feel: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  }) as unknown as Session;

describe("resolving a day for the player", () => {
  const known = library.core[0]!.id;

  it("reports what it could not resolve instead of swallowing it", () => {
    // The plan screen counts what the player will run, so a movement the
    // library no longer has must be visible rather than quietly dropped.
    const { items, unresolved } = resolveDay(library, day("A", [known, "Not_An_Exercise"]));
    expect(items).toHaveLength(1);
    expect(unresolved).toEqual(["Not_An_Exercise"]);
  });

  it("marks movements that take external load", () => {
    const barbell = library.all.find((e) => e.requires.includes("barbell"))!;
    const bodyweight = library.all.find((e) => e.requires.length === 0)!;
    const { items } = resolveDay(library, day("A", [barbell.id, bodyweight.id]));

    expect(items[0]?.loadable).toBe(true);
    expect(items[1]?.loadable).toBe(false);
  });
});

describe("what comes next", () => {
  const days = summarise({
    days: [day("One", []), day("Two", []), day("Three", []), day("Four", []), day("Five", [])],
  } as never);

  it("follows the rotation rather than the array order", () => {
    // On day four of five the next sessions are five and one -- not one and two.
    expect(upcomingDays(days, 3).map((d) => d.day.name)).toEqual(["Five", "One"]);
  });

  it("wraps from the last day back to the first", () => {
    expect(upcomingDays(days, 4).map((d) => d.day.name)).toEqual(["One", "Two"]);
  });

  it("has nothing to suggest for a one-day plan", () => {
    expect(upcomingDays(summarise({ days: [day("Only", [])] } as never), 0)).toEqual([]);
  });
});

describe("counting days", () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

  it("counts consecutive days back from today", () => {
    const now = at(2026, 3, 10);
    const sessions = [session(at(2026, 3, 10)), session(at(2026, 3, 9)), session(at(2026, 3, 8))];
    expect(streakDays(sessions, now)).toBe(3);
  });

  it("keeps a streak alive on a day you have not trained yet", () => {
    const now = at(2026, 3, 10, 9);
    expect(streakDays([session(at(2026, 3, 9))], now)).toBe(1);
  });

  it("ignores sessions that were never finished", () => {
    expect(streakDays([session(at(2026, 3, 10), false)], at(2026, 3, 10))).toBe(0);
  });

  it("survives a daylight-saving boundary", () => {
    // Local midnight is not a whole number of days from UTC midnight, and the
    // offset moves twice a year: dividing a timestamp by 86400000 merged or
    // skipped a day every time the clocks changed.
    const sessions = [
      session(at(2026, 3, 27)),
      session(at(2026, 3, 28)),
      session(at(2026, 3, 29)),
      session(at(2026, 3, 30)),
    ];
    expect(streakDays(sessions, at(2026, 3, 30))).toBe(4);

    const autumn = [
      session(at(2026, 10, 23)),
      session(at(2026, 10, 24)),
      session(at(2026, 10, 25)),
      session(at(2026, 10, 26)),
    ];
    expect(streakDays(autumn, at(2026, 10, 26))).toBe(4);
  });

  it("puts a week's sessions in Monday-first order", () => {
    // 2026-03-11 is a Wednesday.
    const week = weekProgress([session(at(2026, 3, 11))], at(2026, 3, 13));
    expect(week).toEqual([false, false, true, false, false, false, false]);
  });
});

/**
 * A weight typed in once is a weight the app should still know next week. It
 * used to live only in the session record, so the stepper opened on blank every
 * time and load progression had nothing to progress.
 */
describe("remembering what was lifted", () => {
  const set = (exerciseId: string, weightKg: number | null, skipped = false) =>
    ({ exerciseId, setIndex: 0, reps: 10, durationSec: null, weightKg, skipped, completedAt: 1 }) as
      unknown as Session["sets"][number];

  const withSets = (startedAt: number, sets: Session["sets"]): Session => ({
    ...session(startedAt),
    sets,
  });

  it("takes the heaviest working set of the most recent session that has one", () => {
    // Newest first, as the database returns them.
    const sessions = [
      withSets(3000, [set("Squat", 40), set("Squat", 45)]),
      withSets(2000, [set("Squat", 100), set("Press", 20)]),
    ];

    const last = lastLoggedWeights(sessions);
    // A deload is followed, not overruled by a heavier older session.
    expect(last.get("Squat")).toBe(45);
    // A movement absent from the newest session still comes from history.
    expect(last.get("Press")).toBe(20);
  });

  it("ignores skipped sets and unlogged weights", () => {
    const last = lastLoggedWeights([
      withSets(1000, [set("Squat", 60, true), set("Press", null), set("Row", 0)]),
    ]);
    expect(last.size).toBe(0);
  });

  it("hands the player a fallback without overwriting the plan's target", () => {
    const known = library.core[0]!.id;
    const { items } = resolveDay(library, day("A", [known]), new Map([[known, 18]]));
    expect(items[0]!.lastWeightKg).toBe(18);
    expect(items[0]!.targetWeightKg).toBeNull();
  });
});

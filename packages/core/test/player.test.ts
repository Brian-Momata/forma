import { describe, expect, it } from "vitest";

import {
  CHIME_MS,
  READY_SEC,
  TRANSITION_SEC,
  abandon,
  addRest,
  advance,
  completeSet,
  completedSets,
  elapsedSec,
  isChiming,
  phaseProgress,
  remainingSec,
  skip,
  start,
  setWeight,
  tick,
  togglePause,
  totalSets,
  type PlayerItem,
  type PlayerState,
} from "../src/player.ts";
import type { ExerciseId } from "../src/types.ts";

const timed = (id: string, sets: number, durationSec: number, restSec: number): PlayerItem => ({
  exerciseId: id as ExerciseId,
  name: id,
  kind: "time",
  sets,
  reps: null,
  durationSec,
  restSec,
  warmup: false,
  cues: ["a", "b"],
  images: [],
  loadable: false,
  targetWeightKg: null,
});

const repped = (id: string, sets: number, reps: number, restSec: number): PlayerItem => ({
  exerciseId: id as ExerciseId,
  name: id,
  kind: "reps",
  sets,
  reps,
  durationSec: null,
  restSec,
  warmup: false,
  cues: ["a", "b"],
  images: [],
  loadable: false,
  targetWeightKg: null,
});

const T0 = 1_000_000;
const at = (sec: number) => T0 + sec * 1000;

/** Drives the machine forward the way a real 1s interval would. */
function runFor(state: PlayerState, seconds: number, fromSec = 0): PlayerState {
  let s = state;
  for (let i = 1; i <= seconds; i++) s = tick(s, at(fromSec + i));
  return s;
}

describe("player state machine", () => {
  it("walks ready -> set -> rest -> set -> transition -> complete", () => {
    const items = [timed("A", 2, 10, 5), timed("B", 1, 10, 0)];
    let s = start(items, T0);
    const seen: string[] = [s.phase];

    for (let i = 1; i <= 120; i++) {
      const next = tick(s, at(i));
      if (next.phase !== s.phase) seen.push(next.phase);
      s = next;
      if (s.phase === "complete") break;
    }

    expect(seen).toEqual(["ready", "set", "rest", "set", "transition", "ready", "set", "complete"]);
  });

  it("counts a timed set down and a rep set up", () => {
    const timedState = start([timed("A", 1, 30, 0)], T0);
    const afterReady = runFor(timedState, READY_SEC);
    expect(afterReady.phase).toBe("set");
    expect(remainingSec(afterReady, at(READY_SEC))).toBe(30);
    expect(remainingSec(afterReady, at(READY_SEC + 10))).toBe(20);

    const repState = start([repped("A", 1, 10, 0)], T0);
    const repSet = runFor(repState, READY_SEC);
    expect(repSet.phase).toBe("set");
    // Open-ended: it ends when the person says so, so there is nothing to count down.
    expect(remainingSec(repSet, at(READY_SEC + 10))).toBeNull();
    expect(elapsedSec(repSet, at(READY_SEC + 10))).toBe(10);
  });

  it("never auto-advances a rep-based set", () => {
    let s = start([repped("A", 1, 10, 0)], T0);
    s = runFor(s, 300);
    expect(s.phase).toBe("set");

    s = completeSet(s, at(300));
    expect(s.phase).toBe("complete");
    expect(completedSets(s)).toBe(1);
  });

  it("fires the tone on every countdown that reaches zero", () => {
    const items = [timed("A", 2, 5, 5)];
    let s = start(items, T0);
    const chimes: number[] = [];

    for (let i = 1; i <= 40; i++) {
      const next = tick(s, at(i));
      if (next.chimeAt !== null && next.chimeAt !== s.chimeAt) chimes.push(i);
      s = next;
      if (s.phase === "complete") break;
    }

    // ready ends, set 1 ends, rest ends, set 2 ends.
    expect(chimes).toEqual([READY_SEC, READY_SEC + 5, READY_SEC + 10, READY_SEC + 15]);
  });

  it("shows the chime for its animation window then stops", () => {
    let s = start([timed("A", 1, 5, 0)], T0);
    s = runFor(s, READY_SEC);
    expect(isChiming(s, at(READY_SEC))).toBe(true);
    expect(isChiming(s, at(READY_SEC) + CHIME_MS - 1)).toBe(true);
    expect(isChiming(s, at(READY_SEC) + CHIME_MS)).toBe(false);
  });
});

describe("the timer survives a phone that goes to sleep", () => {
  it("does not lose time when ticks are dropped mid-phase", () => {
    // The real failure mode: a backgrounded phone stops firing intervals. If we
    // counted ticks, this set would run long by exactly the missing seconds.
    let s = start([timed("A", 1, 60, 0)], T0);
    s = tick(s, at(READY_SEC));
    expect(s.phase).toBe("set");

    // 40 seconds pass with no ticks at all, then one arrives.
    const woke = tick(s, at(READY_SEC + 40));
    expect(remainingSec(woke, at(READY_SEC + 40))).toBe(20);
    expect(woke.phase).toBe("set");
  });

  it("completes a phase that expired while the screen was off", () => {
    let s = start([timed("A", 1, 30, 0)], T0);
    s = tick(s, at(READY_SEC));
    // Ten minutes of nothing.
    s = tick(s, at(READY_SEC + 600));
    expect(s.phase).toBe("complete");
    expect(completedSets(s)).toBe(1);
  });

  it("is idempotent for a repeated timestamp", () => {
    let s = start([timed("A", 2, 10, 10)], T0);
    s = runFor(s, 5);
    const once = tick(s, at(5));
    const twice = tick(once, at(5));
    expect(twice).toEqual(once);
  });
});

describe("pause and resume", () => {
  it("freezes the countdown and gives the time back", () => {
    let s = start([timed("A", 1, 60, 0)], T0);
    s = tick(s, at(READY_SEC));
    expect(remainingSec(s, at(READY_SEC + 10))).toBe(50);

    s = togglePause(s, at(READY_SEC + 10));
    // Thirty seconds of standing still must not burn the set.
    expect(remainingSec(s, at(READY_SEC + 40))).toBe(50);
    expect(tick(s, at(READY_SEC + 40)).phase).toBe("set");

    s = togglePause(s, at(READY_SEC + 40));
    expect(remainingSec(s, at(READY_SEC + 45))).toBe(45);
  });
});

describe("skip, rest and abandon", () => {
  it("does not credit a skipped set", () => {
    let s = start([timed("A", 2, 30, 10)], T0);
    s = tick(s, at(READY_SEC));
    s = skip(s, at(READY_SEC + 2));
    expect(s.phase).toBe("rest");
    expect(completedSets(s)).toBe(0);
    expect(s.records[0]?.skipped).toBe(true);
  });

  it("extends the rest by the amount asked for", () => {
    let s = start([timed("A", 2, 10, 20)], T0);
    s = runFor(s, READY_SEC + 10);
    expect(s.phase).toBe("rest");
    expect(remainingSec(s, at(READY_SEC + 10))).toBe(20);

    s = addRest(s, 20);
    expect(remainingSec(s, at(READY_SEC + 10))).toBe(40);
    expect(phaseProgress(s, at(READY_SEC + 30))).toBeCloseTo(0.5, 1);
  });

  it("skips a rest that was never prescribed", () => {
    // A zero-second rest is a rest the person did not ask for.
    let s = start([timed("A", 2, 5, 0)], T0);
    s = runFor(s, READY_SEC + 5);
    expect(s.phase).toBe("set");
    expect(s.setIndex).toBe(1);
  });

  it("ends the session on abandon without inventing records", () => {
    let s = start([timed("A", 3, 30, 30)], T0);
    s = runFor(s, READY_SEC);
    s = abandon(s, at(20));
    expect(s.phase).toBe("complete");
    expect(s.endedAt).toBe(at(20));
    expect(s.records).toHaveLength(0);
  });
});

describe("progress reporting", () => {
  it("counts sets across the whole session", () => {
    const s = start([timed("A", 2, 10, 5), repped("B", 3, 10, 30)], T0);
    expect(totalSets(s)).toBe(5);
    expect(completedSets(s)).toBe(0);
  });

  it("handles an empty plan without crashing", () => {
    const s = start([], T0);
    expect(s.phase).toBe("complete");
    expect(advance(s, at(1))).toEqual(s);
    expect(tick(s, at(1))).toEqual(s);
  });

  it("waits on the transition when auto-advance is off", () => {
    let s = start([timed("A", 1, 5, 0), timed("B", 1, 5, 0)], T0, { autoAdvance: false });
    s = runFor(s, READY_SEC + 5);
    expect(s.phase).toBe("transition");
    s = runFor(s, 60, READY_SEC + 5);
    expect(s.phase).toBe("transition");
    expect(skip(s, at(100)).phase).toBe("ready");
  });

  it("applies a rest override from settings to every exercise", () => {
    const s = start([timed("A", 2, 10, 45)], T0, { restOverrideSec: 15 });
    expect(s.items[0]?.restSec).toBe(15);
  });

  it("auto-advances the transition after the designed interval", () => {
    let s = start([timed("A", 1, 5, 0), timed("B", 1, 5, 0)], T0);
    s = runFor(s, READY_SEC + 5);
    expect(s.phase).toBe("transition");
    s = runFor(s, TRANSITION_SEC, READY_SEC + 5);
    expect(s.phase).toBe("ready");
  });
});

/**
 * Weight is what makes the load tiers mean anything: the plan cannot guess what
 * someone squats, so the session records it and progression reads it back.
 */
describe("logging what was on the bar", () => {
  const loaded = (id: string, sets: number, target: number | null): PlayerItem => ({
    ...repped(id, sets, 8, 60),
    loadable: true,
    targetWeightKg: target,
  });

  it("starts from the plan's target when there is one", () => {
    expect(start([loaded("Squat", 3, 60)], 0).weightKg).toBe(60);
    expect(start([loaded("Squat", 3, null)], 0).weightKg).toBeNull();
  });

  it("writes the weight onto every set of that exercise", () => {
    let state = start([loaded("Squat", 2, 60)], 0);
    state = advance(state, 1000); // ready -> set
    state = completeSet(state, 2000);
    state = advance(state, 3000); // rest -> set
    state = completeSet(state, 4000);

    expect(state.records.map((r) => r.weightKg)).toEqual([60, 60]);
  });

  it("keeps a correction for the sets that follow it", () => {
    let state = start([loaded("Squat", 2, 60)], 0);
    state = advance(state, 1000);
    state = setWeight(state, 65);
    state = completeSet(state, 2000);
    state = advance(state, 3000);
    state = completeSet(state, 4000);

    expect(state.records.map((r) => r.weightKg)).toEqual([65, 65]);
  });

  it("does not carry one exercise's load onto the next", () => {
    let state = start([loaded("Squat", 1, 60), loaded("Bench", 1, 40)], 0);
    state = advance(state, 1000);
    state = completeSet(state, 2000); // -> transition
    state = advance(state, 3000); // -> ready on Bench
    state = advance(state, 4000); // -> set
    state = completeSet(state, 5000);

    expect(state.records.map((r) => r.weightKg)).toEqual([60, 40]);
  });

  it("records nothing for a movement that takes no load", () => {
    let state = start([repped("Pushup", 1, 10, 60)], 0);
    state = advance(state, 1000);
    state = setWeight(state, 20);
    state = completeSet(state, 2000);

    // A bodyweight push-up has no weight to log, whatever the state says.
    expect(state.records[0]?.weightKg).toBeNull();
  });

  it("refuses a negative or absurd load", () => {
    const state = start([loaded("Squat", 1, 60)], 0);
    expect(setWeight(state, -10).weightKg).toBe(0);
    expect(setWeight(state, 9000).weightKg).toBe(500);
  });
});

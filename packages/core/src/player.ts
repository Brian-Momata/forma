import { assertNever, type ExerciseId, type SetRecord } from "./types.ts";

/**
 * The workout state machine, ported from the interaction in the design.
 *
 *   ready -> set -> (rest | transition) -> ... -> complete
 *
 * Pure, and the clock is injected: every function takes `now`. Nothing here
 * calls Date.now or setInterval. That is what makes the timer testable without
 * fake timers, and -- more importantly -- what makes drift correction possible.
 * Elapsed time is always derived from timestamps, never from counting ticks,
 * because a backgrounded phone silently drops interval callbacks and would
 * otherwise shorten every set.
 */

export const READY_SEC = 3;
export const TRANSITION_SEC = 6;
export const CHIME_MS = 1300;

export type Phase = "ready" | "set" | "rest" | "transition" | "complete";

/**
 * A plan item flattened for playback. The player never touches the library --
 * the app resolves exercises up front, so the machine stays pure data.
 */
export interface PlayerItem {
  exerciseId: ExerciseId;
  name: string;
  kind: "reps" | "time";
  sets: number;
  reps: number | null;
  durationSec: number | null;
  restSec: number;
  warmup: boolean;
  cues: readonly string[];
  images: readonly string[];
}

export interface PlayerState {
  items: readonly PlayerItem[];
  exIndex: number;
  setIndex: number;
  phase: Phase;

  /** Wall-clock start of the current phase. All elapsed time derives from this. */
  phaseStartedAt: number;
  /** Total time spent paused within the current phase. */
  pausedMs: number;
  /** Set while paused, so elapsed freezes without losing the phase start. */
  pausedAt: number | null;

  /** Extra seconds the person added to the current rest. */
  bonusRestSec: number;

  startedAt: number;
  endedAt: number | null;
  records: readonly SetRecord[];
  /** When the end-of-phase tone last fired, for the chime animation. */
  chimeAt: number | null;
  autoAdvance: boolean;
}

export interface StartOptions {
  autoAdvance?: boolean;
  /** Overrides every prescribed rest, from the user's settings. */
  restOverrideSec?: number | null;
}

export function start(
  items: readonly PlayerItem[],
  now: number,
  options: StartOptions = {}
): PlayerState {
  const resolved =
    options.restOverrideSec == null
      ? items
      : items.map((i) => ({ ...i, restSec: options.restOverrideSec as number }));

  return {
    items: resolved,
    exIndex: 0,
    setIndex: 0,
    phase: resolved.length === 0 ? "complete" : "ready",
    phaseStartedAt: now,
    pausedMs: 0,
    pausedAt: null,
    bonusRestSec: 0,
    startedAt: now,
    endedAt: resolved.length === 0 ? now : null,
    records: [],
    chimeAt: null,
    autoAdvance: options.autoAdvance ?? true,
  };
}

export function currentItem(state: PlayerState): PlayerItem | undefined {
  return state.items[state.exIndex];
}

export function nextItem(state: PlayerState): PlayerItem | undefined {
  return state.items[state.exIndex + 1];
}

/**
 * How long the current phase runs, or null when it is open-ended.
 *
 * A rep-based set has no deadline -- it ends when the person says it does --
 * so its timer counts up instead of down.
 */
export function phaseDuration(state: PlayerState): number | null {
  const item = currentItem(state);
  switch (state.phase) {
    case "ready":
      return READY_SEC;
    case "set":
      if (!item) return null;
      return item.kind === "time" ? (item.durationSec ?? 0) : null;
    case "rest":
      return (item?.restSec ?? 0) + state.bonusRestSec;
    case "transition":
      return state.autoAdvance ? TRANSITION_SEC : null;
    case "complete":
      return null;
    default:
      return assertNever(state.phase);
  }
}

/** Milliseconds spent in the current phase, excluding paused time. */
export function phaseElapsedMs(state: PlayerState, now: number): number {
  const upTo = state.pausedAt ?? now;
  return Math.max(0, upTo - state.phaseStartedAt - state.pausedMs);
}

/** Seconds left in the current phase; null when the phase is open-ended. */
export function remainingSec(state: PlayerState, now: number): number | null {
  const duration = phaseDuration(state);
  if (duration === null) return null;
  return Math.max(0, Math.ceil(duration - phaseElapsedMs(state, now) / 1000));
}

/** Seconds spent so far in an open-ended phase, for the count-up display. */
export function elapsedSec(state: PlayerState, now: number): number {
  return Math.floor(phaseElapsedMs(state, now) / 1000);
}

/** 0..1 progress through the current phase. Open-ended phases report 0. */
export function phaseProgress(state: PlayerState, now: number): number {
  const duration = phaseDuration(state);
  if (duration === null || duration <= 0) return 0;
  return Math.min(1, phaseElapsedMs(state, now) / 1000 / duration);
}

export function totalSets(state: PlayerState): number {
  return state.items.reduce((sum, i) => sum + i.sets, 0);
}

export function completedSets(state: PlayerState): number {
  return state.records.filter((r) => !r.skipped).length;
}

export function isChiming(state: PlayerState, now: number): boolean {
  return state.chimeAt !== null && now - state.chimeAt < CHIME_MS;
}

function enterPhase(state: PlayerState, phase: Phase, now: number): PlayerState {
  return {
    ...state,
    phase,
    phaseStartedAt: now,
    pausedMs: 0,
    pausedAt: null,
    bonusRestSec: 0,
    endedAt: phase === "complete" ? now : state.endedAt,
  };
}

function recordSet(state: PlayerState, now: number, skipped: boolean): SetRecord[] {
  const item = currentItem(state);
  if (!item) return [...state.records];
  return [
    ...state.records,
    {
      exerciseId: item.exerciseId,
      setIndex: state.setIndex,
      reps: item.kind === "reps" ? item.reps : null,
      durationSec: item.kind === "time" ? item.durationSec : null,
      weightKg: null,
      skipped,
      completedAt: now,
    },
  ];
}

/**
 * Moves to the next phase.
 *
 * `skipped` distinguishes a set the person chose to skip from one they
 * finished, so history stays truthful rather than flattering.
 */
export function advance(state: PlayerState, now: number, skipped = false): PlayerState {
  const item = currentItem(state);
  if (!item || state.phase === "complete") return state;

  switch (state.phase) {
    case "ready":
      return enterPhase(state, "set", now);

    case "set": {
      const records = recordSet(state, now, skipped);
      const moreSets = state.setIndex + 1 < item.sets;
      const moreExercises = state.exIndex + 1 < state.items.length;

      if (moreSets) {
        // A zero-second rest is a rest the person did not ask for.
        const next = enterPhase(
          { ...state, records, setIndex: state.setIndex + 1 },
          item.restSec > 0 ? "rest" : "set",
          now
        );
        return next;
      }
      if (moreExercises) {
        return enterPhase({ ...state, records }, "transition", now);
      }
      return enterPhase({ ...state, records }, "complete", now);
    }

    case "rest":
      return enterPhase(state, "set", now);

    case "transition":
      return enterPhase(
        { ...state, exIndex: state.exIndex + 1, setIndex: 0 },
        "ready",
        now
      );

    default:
      // "complete" is excluded by the guard above; this makes any new phase a
      // compile error rather than a silent no-op.
      return assertNever(state.phase);
  }
}

/**
 * Advances the clock. Call as often as you like -- it is idempotent for a
 * given `now`, and correct even if a backgrounded phone skipped ten minutes
 * of ticks, because it recomputes from timestamps.
 */
export function tick(state: PlayerState, now: number): PlayerState {
  if (state.phase === "complete" || state.pausedAt !== null) return state;

  const remaining = remainingSec(state, now);
  if (remaining === null || remaining > 0) return state;

  // The countdown reached zero: fire the tone, then move on.
  return advance({ ...state, chimeAt: now }, now, false);
}

export function pause(state: PlayerState, now: number): PlayerState {
  if (state.pausedAt !== null || state.phase === "complete") return state;
  return { ...state, pausedAt: now };
}

export function resume(state: PlayerState, now: number): PlayerState {
  if (state.pausedAt === null) return state;
  return {
    ...state,
    pausedMs: state.pausedMs + (now - state.pausedAt),
    pausedAt: null,
  };
}

export function togglePause(state: PlayerState, now: number): PlayerState {
  return state.pausedAt === null ? pause(state, now) : resume(state, now);
}

/** "Set complete" on a rep-based set. Fires the tone, like a countdown ending. */
export function completeSet(state: PlayerState, now: number): PlayerState {
  if (state.phase !== "set") return state;
  return advance({ ...state, chimeAt: now }, now, false);
}

/** Skip: moves on without crediting the set. */
export function skip(state: PlayerState, now: number): PlayerState {
  return advance(state, now, state.phase === "set");
}

/** The design's "+20s" during rest. */
export function addRest(state: PlayerState, seconds: number): PlayerState {
  if (state.phase !== "rest") return state;
  return { ...state, bonusRestSec: state.bonusRestSec + seconds };
}

export function abandon(state: PlayerState, now: number): PlayerState {
  return enterPhase(state, "complete", now);
}

/** Total wall-clock seconds the session has taken, paused time included. */
export function sessionSeconds(state: PlayerState, now: number): number {
  return Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

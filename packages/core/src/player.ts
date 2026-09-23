import { assertNever, type ExerciseId, type SetRecord } from "./types.ts";

/**
 * The workout state machine, ported from the interaction in the design.
 *
 *   ready -> set -> (switch) -> (rest | transition) -> ... -> complete
 *
 * Pure, and the clock is injected: every function takes `now`. Nothing here
 * calls Date.now or setInterval. That is what makes the timer testable without
 * fake timers, and -- more importantly -- what makes drift correction possible.
 * Elapsed time is always derived from timestamps, never from counting ticks,
 * because a backgrounded phone silently drops interval callbacks and would
 * otherwise shorten every set.
 */

export const READY_SEC = 3;

/**
 * The floor on the changeover between two movements.
 *
 * A changeover is not dead time -- it is walking to the next station and
 * setting up -- so it is at least this long, and longer when the movement you
 * just finished prescribed a real rest. Capped, because a 90s prescribed rest
 * belongs *between sets*; making people stand still for 90s before the next
 * exercise would inflate every session well past its budget.
 */
export const TRANSITION_SEC = 6;
export const MAX_TRANSITION_SEC = 30;

/** Long enough to get off one side and set up on the other. */
export const SWITCH_SEC = 5;

/**
 * Below this, halving a timed set leaves too little per side to be worth
 * doing, so the set runs as one piece and the screen just says "each side".
 */
export const MIN_SIDE_SPLIT_SEC = 16;

export const CHIME_MS = 1300;

export type Phase = "ready" | "set" | "switch" | "rest" | "transition" | "complete";

/** Which side of the body the current set is working, or null when it is both. */
export type Side = "left" | "right" | null;

/**
 * Why the player just sounded.
 *
 * Derived here rather than guessed from the phase it landed in: "set ended"
 * and "exercise ended" both arrive at a screen that is not the set screen, and
 * they are not the same event to anyone listening for them.
 */
export type ChimeKind =
  | "set-end"
  | "rest-end"
  | "exercise-end"
  | "switch"
  | "next"
  | "finish";

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
  /** The full how-to, in order. Empty for entries the source never described. */
  steps: readonly string[];
  images: readonly string[];
  /**
   * One side at a time, rather than both at once.
   *
   * A timed set of one of these runs each side in turn with a switch in
   * between, so the clock cannot run out on the left leg and move the session
   * on before the right one has been trained. Alternating movements -- walking
   * lunges, marches -- are not unilateral in this sense: they work both sides
   * within the set already.
   */
  unilateral: boolean;
  /** Whether this movement takes external load, so the screen offers a weight. */
  loadable: boolean;
  /** What the plan asks for, in kilograms. Null until someone has logged one. */
  targetWeightKg: number | null;
  /**
   * What was last logged for this movement, in kilograms.
   *
   * The fallback when the plan has no target: rebuilding a plan -- new kit, a
   * new limitation -- drops its targets, and nobody wants to be asked what
   * they curl from scratch because they bought a bench. Optional because
   * sessions checkpointed before it existed carry items without it.
   */
  lastWeightKg?: number | null;
}

export interface PlayerState {
  items: readonly PlayerItem[];
  exIndex: number;
  setIndex: number;
  phase: Phase;

  /** Which side is being worked, for unilateral movements. Null for the rest. */
  side: Side;

  /** Wall-clock start of the current phase. All elapsed time derives from this. */
  phaseStartedAt: number;
  /** Total time spent paused within the current phase. */
  pausedMs: number;
  /** Set while paused, so elapsed freezes without losing the phase start. */
  pausedAt: number | null;

  /** Extra seconds the person added to the current rest. */
  bonusRestSec: number;

  /**
   * Weight on the bar for the current exercise, in kilograms.
   *
   * Carried across that exercise's sets -- nobody changes the load between set
   * two and set three without meaning to -- and re-seeded from the plan's
   * target when the session moves on to the next movement.
   */
  weightKg: number | null;

  startedAt: number;
  endedAt: number | null;
  records: readonly SetRecord[];
  /** When the end-of-phase tone last fired, for the chime animation. */
  chimeAt: number | null;
  /** What that tone was for. Absent on sessions checkpointed before this existed. */
  chimeKind: ChimeKind | null;
  autoAdvance: boolean;
}

export interface StartOptions {
  autoAdvance?: boolean;
  /** Overrides every prescribed rest, from the user's settings. */
  restOverrideSec?: number | null;
}

/** The side a set of this item opens on: the left, or neither. */
function openingSide(item: PlayerItem | undefined): Side {
  return item?.unilateral ? "left" : null;
}

/**
 * What the weight control starts on for a movement.
 *
 * The plan's target first, then whatever was last lifted: starting from blank
 * every session means re-entering the same number every session, and a number
 * nobody enters is a plan that can never progress the load.
 */
function openingWeight(item: PlayerItem | undefined): number | null {
  if (!item) return null;
  return item.targetWeightKg ?? item.lastWeightKg ?? null;
}

/**
 * Whether a set of this item is run one side at a time on the clock.
 *
 * Only timed sets: a rep set ends when the person says it does, so there is no
 * clock to run out on them, and the screen tells them the reps are per side.
 */
export function splitsSides(item: PlayerItem | undefined): boolean {
  if (!item || !item.unilateral || item.kind !== "time") return false;
  return (item.durationSec ?? 0) >= MIN_SIDE_SPLIT_SEC;
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
    side: openingSide(resolved[0]),
    phaseStartedAt: now,
    pausedMs: 0,
    pausedAt: null,
    bonusRestSec: 0,
    weightKg: openingWeight(resolved[0]),
    startedAt: now,
    endedAt: resolved.length === 0 ? now : null,
    records: [],
    chimeAt: null,
    chimeKind: null,
    autoAdvance: options.autoAdvance ?? true,
  };
}

export function currentItem(state: PlayerState): PlayerItem | undefined {
  return state.items[state.exIndex];
}

export function nextItem(state: PlayerState): PlayerItem | undefined {
  return state.items[state.exIndex + 1];
}

/** How long one side of the current set runs, or the whole set when it is not split. */
export function setSeconds(item: PlayerItem | undefined): number {
  if (!item || item.kind !== "time") return 0;
  const total = item.durationSec ?? 0;
  return splitsSides(item) ? Math.round(total / 2) : total;
}

/**
 * The changeover to the next movement.
 *
 * Long enough to actually walk over and set up, and longer for a movement that
 * prescribed a real rest -- a warm-up drill needs a breath before the next one
 * just as much as a heavy set does, which is what "no rest" used to deny it.
 */
export function transitionSeconds(item: PlayerItem | undefined): number {
  const rest = item?.restSec ?? 0;
  return Math.min(MAX_TRANSITION_SEC, Math.max(TRANSITION_SEC, rest));
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
      return item.kind === "time" ? setSeconds(item) : null;
    case "switch":
      return SWITCH_SEC;
    case "rest":
      return (item?.restSec ?? 0) + state.bonusRestSec;
    case "transition":
      return state.autoAdvance ? transitionSeconds(item) : null;
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

interface PhaseOptions {
  side?: Side;
  chime?: ChimeKind;
}

function enterPhase(
  state: PlayerState,
  phase: Phase,
  now: number,
  options: PhaseOptions = {}
): PlayerState {
  return {
    ...state,
    phase,
    side: options.side === undefined ? state.side : options.side,
    phaseStartedAt: now,
    pausedMs: 0,
    pausedAt: null,
    bonusRestSec: 0,
    chimeKind: options.chime ?? state.chimeKind,
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
      weightKg: item.loadable ? state.weightKg : null,
      skipped,
      completedAt: now,
    },
  ];
}

/** Banks the set and moves to whatever comes after it. */
function finishSet(state: PlayerState, now: number, skipped: boolean): PlayerState {
  const item = currentItem(state);
  if (!item) return state;

  const records = recordSet(state, now, skipped);
  const moreSets = state.setIndex + 1 < item.sets;
  const moreExercises = state.exIndex + 1 < state.items.length;

  if (moreSets) {
    // A zero-second rest is a rest the person did not ask for.
    return enterPhase(
      { ...state, records, setIndex: state.setIndex + 1 },
      item.restSec > 0 ? "rest" : "set",
      now,
      { side: openingSide(item), chime: "set-end" }
    );
  }
  if (moreExercises) {
    return enterPhase({ ...state, records }, "transition", now, { chime: "exercise-end" });
  }
  return enterPhase({ ...state, records }, "complete", now, { chime: "finish" });
}

/**
 * Moves to the next phase.
 *
 * `skipped` distinguishes a set the person chose to skip from one they
 * finished, so history stays truthful rather than flattering. Skipping also
 * abandons the whole set rather than only the side being worked: someone who
 * taps skip on the left side is done with the movement, not asking to be sent
 * to the right one.
 */
export function advance(state: PlayerState, now: number, skipped = false): PlayerState {
  const item = currentItem(state);
  if (!item || state.phase === "complete") return state;

  switch (state.phase) {
    case "ready":
      return enterPhase(state, "set", now, { side: openingSide(item), chime: "rest-end" });

    case "set": {
      // Half the clock is the left side; the switch beat sends it to the right.
      if (!skipped && splitsSides(item) && state.side === "left") {
        return enterPhase(state, "switch", now, { chime: "switch" });
      }
      return finishSet(state, now, skipped);
    }

    case "switch":
      return enterPhase(state, "set", now, { side: "right", chime: "rest-end" });

    case "rest":
      return enterPhase(state, "set", now, { side: openingSide(item), chime: "rest-end" });

    case "transition": {
      const next = state.exIndex + 1;
      return enterPhase(
        {
          ...state,
          exIndex: next,
          setIndex: 0,
          // A new movement means a new load, so the previous exercise's weight
          // must not follow it across.
          weightKg: openingWeight(state.items[next]),
        },
        "ready",
        now,
        { side: openingSide(state.items[next]), chime: "next" }
      );
    }

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

/**
 * Records what is actually on the bar.
 *
 * Kept out of the set record until the set is banked, so changing it mid-set
 * corrects the set you are doing rather than rewriting one you have finished.
 */
export function setWeight(state: PlayerState, kg: number | null): PlayerState {
  if (kg === null) return { ...state, weightKg: null };
  return { ...state, weightKg: Math.max(0, Math.min(500, kg)) };
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

/**
 * How the dose reads on screen.
 *
 * "each side" is not decoration: a set of ten one-arm rows means ten each way,
 * and someone who reads it as ten total trains half the movement.
 */
export function doseText(item: PlayerItem | undefined): string {
  if (!item) return "";
  const perSide = item.unilateral ? " each side" : "";
  if (item.kind === "time") {
    return splitsSides(item)
      ? `${setSeconds(item)}s each side`
      : `${item.durationSec}s${perSide}`;
  }
  return `${item.reps} reps${perSide}`;
}

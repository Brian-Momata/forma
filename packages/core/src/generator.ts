import { resolveArchetype, type Archetype, type DayTemplate, type Slot } from "./archetypes.ts";
import { resolveTier } from "./equipment.ts";
import type { Library } from "./library/index.ts";
import { eligibleForPattern, type SelectionContext } from "./selection.ts";
import type {
  Exercise,
  Pattern,
  Plan,
  PlanDay,
  PlanExercise,
  PlanId,
  Prescription,
  Profile,
  Setup,
} from "./types.ts";

/* -------------------------------------------------------------------------
 * Deterministic randomness. Same inputs must always give the same plan --
 * regenerating after a reload should not silently reshuffle someone's week.
 * ----------------------------------------------------------------------- */

function hashSeed(parts: readonly string[]): number {
  let h = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------
 * Timing
 * ----------------------------------------------------------------------- */

/** Seconds a single rep takes, averaged across tempos. Used only for budgeting. */
const SECONDS_PER_REP = 3;
const READY_SEC = 3;
const TRANSITION_SEC = 6;

export function estimateExerciseSeconds(p: Prescription): number {
  const work = p.durationSec ?? (p.reps ?? 0) * SECONDS_PER_REP;
  // The last set of an exercise flows into the transition, not another rest.
  return p.sets * work + Math.max(0, p.sets - 1) * p.restSec;
}

export function estimateDaySeconds(day: PlanDay): number {
  let total = 0;
  for (const item of day.exercises) {
    total += estimateExerciseSeconds(item.prescription) + READY_SEC + TRANSITION_SEC;
  }
  return total;
}

/* -------------------------------------------------------------------------
 * Slot filling
 * ----------------------------------------------------------------------- */

interface FillState {
  used: Set<string>;
  /** How often each exercise has appeared across the whole plan, for variety. */
  seen: Map<string, number>;
  rand: () => number;
}

/**
 * Picks an exercise for a slot, trying the declared fallbacks when the primary
 * pattern cannot be filled at all in this situation.
 */
function fillSlot(
  library: Library,
  slot: Slot,
  ctx: SelectionContext,
  state: FillState,
  arch: Archetype
): { exercise: Exercise; pattern: Pattern; viaFallback: boolean } | undefined {
  const patterns: Pattern[] = [slot.pattern, ...slot.fallbacks];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    if (!pattern) continue;

    const pool = eligibleForPattern(library, pattern, ctx).filter(
      (e) => !state.used.has(e.id)
    );
    if (pool.length === 0) continue;

    // Prefer compounds in primary slots, then the least-used option, then a
    // deterministic tiebreak. Variety without randomness people can't reproduce.
    const scored = pool.map((e) => {
      let s = 0;
      if (slot.role === "primary" && e.mechanic === "compound") s += 6;
      if (slot.role === "accessory" && e.mechanic === "isolation") s += 2;
      // A rep-based archetype wants a rep-based primary. Without this an
      // isometric can win a tiebreak and put a wall sit where a loaded squat
      // belongs.
      if (slot.role === "primary" && arch.reps !== null && e.kind === "time") s -= 12;
      // Use the equipment the person actually owns. Someone who told us they
      // have bands and is handed an all-bodyweight plan has been ignored --
      // this applies to every tier, not just the barbell ones. On a bodyweight
      // setup nothing has requirements, so it is a no-op there.
      if (slot.role === "primary" && e.requires.length > 0) s += 8;
      s -= (state.seen.get(e.id) ?? 0) * 4;
      s += state.rand() * 2;
      return { e, s };
    });
    scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));

    const chosen = scored[0]?.e;
    if (chosen) {
      return { exercise: chosen, pattern, viaFallback: i > 0 };
    }
  }
  return undefined;
}

function prescribe(exercise: Exercise, arch: Archetype, slot: Slot): Prescription {
  const isAccessory = slot.role === "accessory";
  const sets = Math.max(1, isAccessory ? arch.sets - 1 : arch.sets);

  if (exercise.kind === "time") {
    const base = exercise.defaults.durationSec ?? 40;
    return {
      sets,
      durationSec: base,
      restSec: exercise.pattern === "mobility" ? 0 : Math.round(arch.restSec * 0.7),
    };
  }

  const window = arch.reps ?? [10, 12];
  // Unilateral work is per side, so halve the count to keep the set honest.
  const mid = Math.round((window[0] + window[1]) / 2);
  const reps = exercise.unilateral ? Math.max(3, Math.round(mid / 2)) : mid;

  return {
    sets,
    reps,
    restSec: isAccessory ? Math.round(arch.restSec * 0.75) : arch.restSec,
  };
}

/**
 * Safety rule 3: every session gets a warm-up matched to its patterns.
 *
 * Built after the working set is chosen, and scored by muscle overlap with it,
 * so a leg day does not open with shoulder rolls.
 */
function buildWarmup(
  library: Library,
  count: number,
  ctx: SelectionContext,
  state: FillState,
  working: readonly Exercise[]
): PlanExercise[] {
  const pool = eligibleForPattern(library, "mobility", ctx);
  if (pool.length === 0) return [];

  const target = new Set<string>();
  for (const e of working) {
    for (const m of e.primaryMuscles) target.add(m);
    for (const m of e.secondaryMuscles) target.add(m);
  }

  const scored = pool
    .map((e) => {
      let s = -(state.seen.get(e.id) ?? 0) * 3 + state.rand();
      for (const m of e.primaryMuscles) if (target.has(m)) s += 6;
      for (const m of e.secondaryMuscles) if (target.has(m)) s += 2;
      return { e, s };
    })
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));

  return scored.slice(0, count).map(({ e }) => {
    state.seen.set(e.id, (state.seen.get(e.id) ?? 0) + 1);
    return {
      exerciseId: e.id,
      warmup: true,
      prescription: {
        sets: 1,
        durationSec: e.defaults.durationSec ?? 30,
        restSec: 0,
      },
    };
  });
}

/**
 * Reconciles a day with its time budget, in both directions.
 *
 * Set counts move before exercises are removed. Deleting an exercise deletes a
 * whole movement pattern, and a session that lost its only pull is a worse
 * session than one that did three sets instead of four. The warm-up is never
 * touched: a rushed session should be shorter, not less safe.
 */
function fitDay(
  day: PlanDay,
  budgetSec: number,
  arch: Archetype,
  roles: ReadonlyMap<string, Slot["role"]>,
  canExpand: boolean
): PlanDay {
  const floorFor = (item: PlanExercise): number =>
    roles.get(item.exerciseId) === "accessory" ? 1 : Math.min(2, arch.sets);
  const ceilingFor = (): number => (canExpand ? arch.sets + 1 : arch.sets);

  let exercises = [...day.exercises];
  const withExercises = (xs: PlanExercise[]): PlanDay => ({ ...day, exercises: xs });
  const cost = (xs: PlanExercise[]): number => estimateDaySeconds(withExercises(xs));

  // 1. Trim sets, most expensive first, down to each item's floor.
  let guard = 64;
  while (cost(exercises) > budgetSec && guard-- > 0) {
    let target = -1;
    let worst = 0;
    exercises.forEach((item, i) => {
      if (item.warmup || item.prescription.sets <= floorFor(item)) return;
      const c = estimateExerciseSeconds(item.prescription);
      if (c > worst) {
        worst = c;
        target = i;
      }
    });
    if (target < 0) break;
    const item = exercises[target];
    if (!item) break;
    exercises[target] = {
      ...item,
      prescription: { ...item.prescription, sets: item.prescription.sets - 1 },
    };
  }

  // 2. Only now start removing work, accessories first and from the end.
  guard = 32;
  while (cost(exercises) > budgetSec && guard-- > 0) {
    const working = exercises.filter((e) => !e.warmup);
    if (working.length <= 2) break;
    let target = -1;
    for (let i = exercises.length - 1; i >= 0; i--) {
      const item = exercises[i];
      if (item && !item.warmup && roles.get(item.exerciseId) === "accessory") {
        target = i;
        break;
      }
    }
    if (target < 0) {
      for (let i = exercises.length - 1; i >= 0; i--) {
        if (!exercises[i]?.warmup) {
          target = i;
          break;
        }
      }
    }
    if (target < 0) break;
    exercises = exercises.filter((_, i) => i !== target);
  }

  // 3. Someone who asked for 30 minutes should not be handed 12. Add sets back
  //    up to the ceiling while the budget allows, cheapest first.
  guard = 64;
  while (guard-- > 0) {
    let target = -1;
    let cheapest = Number.POSITIVE_INFINITY;
    exercises.forEach((item, i) => {
      if (item.warmup || item.prescription.sets >= ceilingFor()) return;
      const c = estimateExerciseSeconds(item.prescription);
      if (c < cheapest) {
        cheapest = c;
        target = i;
      }
    });
    if (target < 0) break;
    const item = exercises[target];
    if (!item) break;
    const bumped = [...exercises];
    bumped[target] = {
      ...item,
      prescription: { ...item.prescription, sets: item.prescription.sets + 1 },
    };
    if (cost(bumped) > budgetSec) break;
    exercises = bumped;
  }

  return withExercises(exercises);
}

/* -------------------------------------------------------------------------
 * Entry point
 * ----------------------------------------------------------------------- */

export interface GenerateOptions {
  now?: number;
  planId?: string;
}

/**
 * Builds a plan for one situation.
 *
 * The situation is the input, not a filter: tier selects the archetype, which
 * decides rep ranges, rest, session shape, and how overload happens, before a
 * single exercise is chosen.
 */
export function generatePlan(
  library: Library,
  profile: Profile,
  setup: Setup,
  options: GenerateOptions = {}
): Plan {
  const now = options.now ?? 0;
  const tier = resolveTier(setup.equipment);
  const arch = resolveArchetype(
    profile.goal,
    tier,
    profile.experience,
    profile.schedule.daysPerWeek
  );

  const ctx: SelectionContext = {
    setup,
    limitations: profile.limitations,
    experience: profile.experience,
  };

  const state: FillState = {
    used: new Set(),
    seen: new Map(),
    rand: mulberry32(
      hashSeed([
        profile.goal,
        tier,
        profile.experience,
        String(profile.schedule.daysPerWeek),
        String(profile.schedule.minutesPerSession),
        [...profile.limitations].sort().join(","),
        [...setup.equipment].sort().join(","),
        setup.id,
      ])
    ),
  };

  const budgetSec = profile.schedule.minutesPerSession * 60;
  const days: PlanDay[] = [];
  let usedFallback = false;

  arch.days.forEach((template: DayTemplate, index) => {
    state.used = new Set();
    const working: PlanExercise[] = [];
    const chosen: Exercise[] = [];
    const roles = new Map<string, Slot["role"]>();

    for (const slot of template.slots) {
      const filled = fillSlot(library, slot, ctx, state, arch);
      if (!filled) continue;
      state.used.add(filled.exercise.id);
      state.seen.set(filled.exercise.id, (state.seen.get(filled.exercise.id) ?? 0) + 1);
      if (filled.viaFallback) usedFallback = true;

      chosen.push(filled.exercise);
      roles.set(filled.exercise.id, slot.role);
      working.push({
        exerciseId: filled.exercise.id,
        warmup: false,
        prescription: prescribe(filled.exercise, arch, slot),
      });
    }

    // Warm-up is chosen against the work that was actually selected.
    const warmup = buildWarmup(library, arch.warmupCount, ctx, state, chosen);

    days.push(
      fitDay(
        { name: template.name, weekday: index < 7 ? index : null, exercises: [...warmup, ...working] },
        budgetSec,
        arch,
        roles,
        profile.experience !== "new"
      )
    );
  });

  return {
    id: (options.planId ?? `plan-${hashSeed([setup.id, profile.goal, String(now)])}`) as PlanId,
    setupId: setup.id,
    name: planName(profile, arch),
    goal: profile.goal,
    tier,
    rationale: rationale(profile, setup, arch, usedFallback),
    tags: tags(profile, setup, arch),
    days,
    week: 1,
    generated: true,
    createdAt: now,
    updatedAt: now,
  };
}

function planName(profile: Profile, arch: Archetype): string {
  const byGoal: Record<Profile["goal"], string> = {
    strength: "Strength Block",
    "fat-loss": "Lean Circuit",
    mobility: "Mobility Flow",
    endurance: "Engine Builder",
    general: "Full Body Reset",
  };
  return arch.days.length >= 4 ? `${byGoal[profile.goal]} · Split` : byGoal[profile.goal];
}

/** A plain sentence explaining why the plan looks the way it does. */
function rationale(
  profile: Profile,
  setup: Setup,
  arch: Archetype,
  usedFallback: boolean
): string {
  const parts: string[] = [
    `Built for ${setup.name.toLowerCase()} with ${arch.tierLabel}`,
    `${profile.schedule.daysPerWeek} days a week at ${profile.schedule.minutesPerSession} minutes`,
  ];

  if (arch.reps) parts.push(`${arch.reps[0]}-${arch.reps[1]} reps with ${arch.restSec}s rest`);

  const how: Record<Archetype["progression"], string> = {
    chain: "you progress by moving to a harder variation",
    "reps-then-load": "you progress by adding reps, then weight",
    load: "you progress by adding weight",
    duration: "you progress by holding longer",
  };
  parts.push(how[arch.progression]);

  if (profile.limitations.length > 0) {
    parts.push(`working around ${profile.limitations.join(" and ").replace(/-/g, " ")}`);
  }
  if (usedFallback) {
    parts.push("with a few slots swapped to what this setup can actually train");
  }

  return `${parts.join(", ")}.`;
}

function tags(profile: Profile, setup: Setup, arch: Archetype): string[] {
  const out = [setup.location === "gym" ? "Gym" : setup.location === "home" ? "Home" : "Outdoors"];
  out.push(arch.tierLabel === "bodyweight only" ? "No equipment" : arch.tierLabel);
  for (const l of profile.limitations) out.push(`${l.replace(/-/g, " ")}-friendly`);
  out.push(`${profile.schedule.minutesPerSession} min`);
  return out;
}

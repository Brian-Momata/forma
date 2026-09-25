import { resolveArchetype, type Archetype, type DayTemplate, type Slot } from "./archetypes.ts";
import { resolveTier } from "./equipment.ts";
import type { Library } from "./library/index.ts";
import { MAX_TRANSITION_SEC, TRANSITION_SEC } from "./player.ts";
import { eligibleForPattern, type SelectionContext } from "./selection.ts";
import type {
  Exercise,
  Goal,
  Limitation,
  Pattern,
  Plan,
  PlanDay,
  PlanExercise,
  PlanId,
  Prescription,
  Profile,
  Schedule,
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

export function estimateExerciseSeconds(p: Prescription): number {
  const work = p.durationSec ?? (p.reps ?? 0) * SECONDS_PER_REP;
  // The last set of an exercise flows into the changeover, not another rest.
  return p.sets * work + Math.max(0, p.sets - 1) * p.restSec;
}

/**
 * Spreads a plan's sessions across the week rather than stacking them.
 *
 * Advisory -- people train when they train -- but the advice has to be sound:
 * three full-body days on Monday, Tuesday and Wednesday is the same movement
 * patterns loaded three days running, which is worse advice than none.
 */
export function weekdayFor(index: number, total: number): number | null {
  if (total < 1 || total > 7) return null;
  return Math.floor((index * 7) / total) % 7;
}

/** Mirrors the player's changeover between two movements, for budgeting. */
function changeoverSeconds(restSec: number): number {
  return Math.min(MAX_TRANSITION_SEC, Math.max(TRANSITION_SEC, restSec));
}

export function estimateDaySeconds(day: PlanDay): number {
  let total = 0;
  for (const item of day.exercises) {
    // The changeover is not a fixed six seconds any more -- it grows with the
    // rest the movement prescribes -- so the budget has to grow with it too,
    // or every generated session would quietly overrun the time asked for.
    total +=
      estimateExerciseSeconds(item.prescription) +
      READY_SEC +
      changeoverSeconds(item.prescription.restSec);
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
 * The breather between two warm-up drills.
 *
 * Short enough that the warm-up still flows, long enough to change position
 * and read what is next.
 */
const WARMUP_REST_SEC = 20;

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
  // Dynamic only, and that rule does not bend. Holding a static stretch before
  // strength work measurably reduces output, so when the pool runs thin the
  // warm-up gets shorter rather than worse.
  const pool = eligibleForPattern(library, "mobility", ctx).filter((e) => e.dynamic);
  if (pool.length === 0) return [];

  const target = new Set<string>();
  for (const e of working) {
    for (const m of e.primaryMuscles) target.add(m);
    for (const m of e.secondaryMuscles) target.add(m);
  }

  // Prefer something the session does not already prescribe -- opening with leg
  // swings and then working leg swings is not a warm-up. But safety rule 3 says
  // there must *be* a warm-up, so a repeat beats nothing when the pool is spent.
  const fresh = pool.filter((e) => !state.used.has(e.id));
  const usable = fresh.length > 0 ? fresh : pool;

  const scored = usable
    .map((e) => {
      let s = -(state.seen.get(e.id) ?? 0) * 3 + state.rand();
      for (const m of e.primaryMuscles) if (target.has(m)) s += 6;
      for (const m of e.secondaryMuscles) if (target.has(m)) s += 2;
      return { e, s };
    })
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));

  return scored.slice(0, count).map(({ e }) => {
    state.used.add(e.id);
    return {
      exerciseId: e.id,
      warmup: true,
      prescription: {
        sets: 1,
        durationSec: e.defaults.durationSec ?? 30,
        // Not zero. A warm-up drill needs a breath and a set-up before the
        // next one, and this is what the player's changeover is sized from --
        // "no rest" used to mean the session moved on six seconds later.
        restSec: WARMUP_REST_SEC,
      },
    };
  });
}

/** Nobody wants a session with thirty movements in it, however long the budget. */
const MAX_WORKING = 12;

/**
 * Reconciles a day with its time budget, in both directions.
 *
 * Set counts move before exercises are removed. Deleting an exercise deletes a
 * whole movement pattern, and a session that lost its only pull is a worse
 * session than one that did three sets instead of four. The warm-up is never
 * touched: a rushed session should be shorter, not less safe.
 *
 * Growing runs the other way round. Someone who asked for 75 minutes wants more
 * training, not the same five movements done four times each, so the spare
 * exercises are spent before the set ceiling is raised.
 */
function fitDay(
  day: PlanDay,
  budgetSec: number,
  arch: Archetype,
  roles: ReadonlyMap<string, Slot["role"]>,
  canExpand: boolean,
  spare: readonly PlanExercise[] = []
): PlanDay {
  const floorFor = (item: PlanExercise): number =>
    roles.get(item.exerciseId) === "accessory" ? 1 : Math.min(2, arch.sets);

  // A rep-based session grows by one set at most -- past that it stops being the
  // programme it was written as. A time-based one is a flow, and repeating the
  // round is how a longer mobility session is actually built, so it may go
  // further. Neither applies to a beginner: safety rule 5 caps them outright.
  const ceilingFor = (): number =>
    canExpand ? arch.sets + (arch.reps === null ? 3 : 1) : arch.sets;

  let exercises = [...day.exercises];
  const withExercises = (xs: PlanExercise[]): PlanDay => ({ ...day, exercises: xs });
  const cost = (xs: PlanExercise[]): number => estimateDaySeconds(withExercises(xs));

  // Trims sets, most expensive first, down to `floor` for each item.
  const trimSets = (floor: (item: PlanExercise) => number): void => {
    let guard = 64;
    while (cost(exercises) > budgetSec && guard-- > 0) {
      let target = -1;
      let worst = 0;
      exercises.forEach((item, i) => {
        if (item.warmup || item.prescription.sets <= floor(item)) return;
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
  };

  // Removes working movements, accessories first and from the end, while at
  // least `keep` would remain.
  const dropExercises = (keep: number): void => {
    let guard = 32;
    while (cost(exercises) > budgetSec && guard-- > 0) {
      const working = exercises.filter((e) => !e.warmup);
      if (working.length <= keep) break;
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
  };

  // 1. Trim sets down to each item's floor.
  trimSets(floorFor);

  // 2. Only now start removing work, down to two movements.
  dropExercises(2);

  // 2b. The budget is a ceiling, not a target (ENGINEERING.md §8), so a session
  //     still over it at two movements gives up sets past the floor rather than
  //     running long: in ten minutes, two movements for one set each beats one
  //     movement for two. Only if that is still too much does it go to one.
  trimSets(() => 1);
  dropExercises(1);

  // 3. Someone who asked for 30 minutes should not be handed 12. Add sets back
  //    while the budget allows, cheapest first, up to a ceiling.
  const grow = (ceiling: number): void => {
    let g = 128;
    while (g-- > 0) {
      // Cheapest *increment*, not cheapest exercise. A short exercise with long
      // rests can cost more to add a set to than a long one with none, so
      // picking by total cost stops early and leaves budget unspent.
      let target = -1;
      let cheapest = Number.POSITIVE_INFINITY;
      exercises.forEach((item, i) => {
        if (item.warmup || item.prescription.sets >= ceiling) return;
        const delta =
          estimateExerciseSeconds({
            ...item.prescription,
            sets: item.prescription.sets + 1,
          }) - estimateExerciseSeconds(item.prescription);
        if (delta < cheapest) {
          cheapest = delta;
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
      // The cheapest increment did not fit, so none of the others will either.
      if (cost(bumped) > budgetSec) break;
      exercises = bumped;
    }
  };

  // 3a. Bring everything up to the volume the archetype actually asked for.
  grow(arch.sets);

  // 3b. Still time left? Spend it on more movement rather than more sets. A
  //     75-minute session that is a 30-minute session with extra sets bolted on
  //     is not what someone who set aside 75 minutes was asking for.
  for (const extra of spare) {
    if (exercises.filter((e) => !e.warmup).length >= MAX_WORKING) break;
    const grown = [...exercises, extra];
    if (cost(grown) > budgetSec) continue;
    exercises = grown;
  }

  // 3c. Only now let the set count run past the archetype, and only for
  //     someone with the training history to absorb it (safety rule 5).
  grow(ceilingFor());

  return withExercises(exercises);
}

/* -------------------------------------------------------------------------
 * Entry point
 * ----------------------------------------------------------------------- */

export interface GenerateOptions {
  now?: number;
  planId?: string;
  /**
   * Overrides the profile's goal and schedule.
   *
   * A person is not one goal. Someone can run a strength plan at the gym and a
   * mobility plan at home in the same week, so the goal belongs to the plan
   * and the profile only supplies the default.
   */
  goal?: Goal;
  schedule?: Schedule;
  name?: string;
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
  const goal = options.goal ?? profile.goal;
  const schedule = options.schedule ?? profile.schedule;
  const tier = resolveTier(setup.equipment);
  const arch = resolveArchetype(goal, tier, profile.experience, schedule.daysPerWeek);

  const ctx: SelectionContext = {
    setup,
    limitations: profile.limitations,
    experience: profile.experience,
  };

  const state: FillState = {
    used: new Set(),
    seen: new Map(),
    // Deliberately not seeded with minutesPerSession. How long someone has
    // decides how much of the session they get, never which movements it is
    // built from -- and a seed that shifts with the budget makes "more time
    // gives you more training" impossible to state, because the two plans are
    // no longer comparable.
    rand: mulberry32(
      hashSeed([
        goal,
        tier,
        profile.experience,
        String(schedule.daysPerWeek),
        [...profile.limitations].sort().join(","),
        [...setup.equipment].sort().join(","),
        setup.id,
      ])
    ),
  };

  const budgetSec = schedule.minutesPerSession * 60;
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
      if (filled.viaFallback) usedFallback = true;

      chosen.push(filled.exercise);
      roles.set(filled.exercise.id, slot.role);
      working.push({
        exerciseId: filled.exercise.id,
        warmup: false,
        prescription: prescribe(filled.exercise, arch, slot),
      });
    }

    // Warm-up is chosen against the work that was actually selected, and takes
    // its pick before the spare pass below. On a mobility day both draw from
    // the same small pool, and a session that spent every dynamic movement on
    // extra work would have nothing left to warm up with.
    const warmup = buildWarmup(library, arch.warmupCount, ctx, state, chosen);

    // A second pass over the same slots, for a session with time to spare. They
    // are accessories: the template's own slots are the session, and these only
    // exist to spend a budget the template alone cannot fill.
    const spare: PlanExercise[] = [];
    for (const slot of template.slots) {
      const extra: Slot = { ...slot, role: "accessory" };
      const filled = fillSlot(library, extra, ctx, state, arch);
      if (!filled) continue;
      state.used.add(filled.exercise.id);
      roles.set(filled.exercise.id, "accessory");
      spare.push({
        exerciseId: filled.exercise.id,
        warmup: false,
        prescription: prescribe(filled.exercise, arch, extra),
      });
    }

    const day = fitDay(
      {
        name: template.name,
        weekday: weekdayFor(index, arch.days.length),
        exercises: [...warmup, ...working],
      },
      budgetSec,
      arch,
      roles,
      profile.experience !== "new",
      spare
    );

    // Variety across the week is counted from what survived, not from what was
    // considered: penalising a later day for an exercise this one dropped would
    // steer the plan away from movements it never actually used.
    for (const item of day.exercises) {
      state.seen.set(item.exerciseId, (state.seen.get(item.exerciseId) ?? 0) + 1);
    }

    days.push(day);
  });

  return {
    id: (options.planId ?? `plan-${hashSeed([setup.id, goal, String(now)])}`) as PlanId,
    setupId: setup.id,
    name: options.name?.trim() || planName(goal, arch),
    goal,
    schedule,
    tier,
    rationale: rationale(goal, schedule, profile.limitations, setup, arch, usedFallback),
    tags: tags(schedule, profile.limitations, setup, arch),
    days,
    week: 1,
    generated: true,
    createdAt: now,
    updatedAt: now,
  };
}

function planName(goal: Goal, arch: Archetype): string {
  const byGoal: Record<Goal, string> = {
    strength: "Strength Block",
    "fat-loss": "Lean Circuit",
    mobility: "Mobility Flow",
    endurance: "Engine Builder",
    general: "Full Body Reset",
  };
  return arch.days.length >= 4 ? `${byGoal[goal]} · Split` : byGoal[goal];
}

/** A plain sentence explaining why the plan looks the way it does. */
function rationale(
  goal: Goal,
  schedule: Schedule,
  limitations: readonly Limitation[],
  setup: Setup,
  arch: Archetype,
  usedFallback: boolean
): string {
  const parts: string[] = [
    `Built for ${setup.name.toLowerCase()} with ${arch.tierLabel}`,
    `${schedule.daysPerWeek} days a week at ${schedule.minutesPerSession} minutes`,
  ];

  if (arch.reps) parts.push(`${arch.reps[0]}-${arch.reps[1]} reps with ${arch.restSec}s rest`);

  const how: Record<Archetype["progression"], string> = {
    chain: "you progress by moving to a harder variation",
    "reps-then-load": "you progress by adding reps, then weight",
    load: "you progress by adding weight",
    duration: "you progress by holding longer",
  };
  parts.push(how[arch.progression]);

  if (limitations.length > 0) {
    parts.push(`working around ${limitations.join(" and ").replace(/-/g, " ")}`);
  }
  if (usedFallback) {
    parts.push("with a few slots swapped to what this setup can actually train");
  }

  return `${parts.join(", ")}.`;
}

function tags(
  schedule: Schedule,
  limitations: readonly Limitation[],
  setup: Setup,
  arch: Archetype
): string[] {
  const out = [setup.location === "gym" ? "Gym" : setup.location === "home" ? "Home" : "Outdoors"];
  out.push(arch.tierLabel === "bodyweight only" ? "No equipment" : arch.tierLabel);
  for (const l of limitations) out.push(`${l.replace(/-/g, " ")}-friendly`);
  out.push(`${schedule.minutesPerSession} min`);
  return out;
}

/**
 * A plan with nothing in it, for someone building their own from scratch.
 *
 * Deliberately not "generated": it carries no rationale we can stand behind,
 * because we did not decide anything about it.
 */
export function emptyPlan(
  setup: Setup,
  options: { planId: string; name: string; goal: Goal; schedule: Schedule; now: number }
): Plan {
  return {
    id: options.planId as PlanId,
    setupId: setup.id,
    name: options.name,
    goal: options.goal,
    schedule: options.schedule,
    tier: resolveTier(setup.equipment),
    rationale: "Built by you.",
    tags: [],
    days: [{ name: "Day 1", weekday: null, exercises: [] }],
    week: 1,
    generated: false,
    createdAt: options.now,
    updatedAt: options.now,
  };
}

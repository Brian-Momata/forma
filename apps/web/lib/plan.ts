import {
  estimateDaySeconds,
  type Library,
  type Plan,
  type PlanDay,
  type PlayerItem,
  type Session,
} from "@form/core";

/** Equipment that a movement is loaded with, so the player can offer a weight. */
const LOADABLE: ReadonlySet<string> = new Set([
  "dumbbells",
  "barbell",
  "kettlebell",
  "ez-bar",
  "cable",
  "machines",
  "medicine-ball",
]);

/**
 * Flattens a plan day into the player's input.
 *
 * Items whose exercise is missing from the library are dropped -- the player
 * cannot run a movement it knows nothing about -- but they are reported rather
 * than swallowed, so the plan screen can show the same session the player will
 * actually run instead of counting work that silently vanishes.
 */
export function resolveDay(
  library: Library,
  day: PlanDay,
  lastWeights: ReadonlyMap<string, number> = new Map()
): { items: PlayerItem[]; unresolved: string[] } {
  const items: PlayerItem[] = [];
  const unresolved: string[] = [];

  for (const item of day.exercises) {
    const exercise = library.byId(item.exerciseId);
    if (!exercise) {
      unresolved.push(item.exerciseId);
      continue;
    }
    items.push({
      exerciseId: exercise.id,
      name: exercise.name,
      kind: exercise.kind,
      sets: item.prescription.sets,
      reps: item.prescription.reps ?? null,
      durationSec: item.prescription.durationSec ?? null,
      restSec: item.prescription.restSec,
      warmup: item.warmup,
      cues: exercise.cues,
      steps: exercise.steps,
      images: exercise.images,
      unilateral: exercise.unilateral,
      loadable: !item.warmup && exercise.requires.some((r) => LOADABLE.has(r)),
      targetWeightKg: item.prescription.targetWeightKg ?? null,
      lastWeightKg: lastWeights.get(exercise.id) ?? null,
    });
  }

  return { items, unresolved };
}

/**
 * The weight most recently logged for each movement.
 *
 * History, not prescription: a plan rebuilt for new equipment loses its target
 * weights, and someone who has been pressing 12kg every week for a month
 * should not be asked what they press as though they had never trained. Newest
 * session wins, so this follows the person rather than averaging their past.
 *
 * Sessions are expected newest-first, as the database returns them.
 */
export function lastLoggedWeights(sessions: readonly Session[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const session of sessions) {
    // Heaviest working set of that session, matching what the Complete screen
    // banks -- but only from the first session that has one, so a deload is
    // followed rather than overruled by a heavier month-old number.
    const inSession = new Map<string, number>();
    for (const record of session.sets) {
      if (record.skipped || record.weightKg === null || record.weightKg <= 0) continue;
      if (out.has(record.exerciseId)) continue;
      const seen = inSession.get(record.exerciseId);
      if (seen === undefined || record.weightKg > seen) {
        inSession.set(record.exerciseId, record.weightKg);
      }
    }
    for (const [id, kg] of inSession) out.set(id, kg);
  }
  return out;
}

/** Whether every movement in a day can still be resolved to a real exercise. */
export function isRunnable(library: Library, day: PlanDay): boolean {
  return day.exercises.every((e) => library.byId(e.exerciseId) !== undefined);
}

export function dayMinutes(day: PlanDay): number {
  return Math.max(1, Math.round(estimateDaySeconds(day) / 60));
}

export interface DaySummary {
  index: number;
  day: PlanDay;
  minutes: number;
  exercises: number;
  sets: number;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** The day's advisory slot in the week, or null when it has none. */
export function weekdayLabel(day: PlanDay): string | null {
  if (day.weekday === null) return null;
  return WEEKDAY_NAMES[day.weekday] ?? null;
}

/**
 * The days after today, in the order they come round.
 *
 * Rotation order, not array order: on day four of a five-day plan the next
 * sessions are day five and day one, not days one and two.
 */
export function upcomingDays(days: DaySummary[], todayIndex: number, count = 2): DaySummary[] {
  if (days.length <= 1) return [];
  return Array.from({ length: Math.min(count, days.length - 1) }, (_, i) => {
    return days[(todayIndex + i + 1) % days.length]!;
  });
}

export function summarise(plan: Plan): DaySummary[] {
  return plan.days.map((day, index) => {
    const working = day.exercises.filter((e) => !e.warmup);
    return {
      index,
      day,
      minutes: dayMinutes(day),
      exercises: working.length,
      sets: working.reduce((n, e) => n + e.prescription.sets, 0),
    };
  });
}

/**
 * Which session is up next.
 *
 * Rotates by how many sessions have been completed rather than by calendar
 * date -- people miss days, and a plan that scolds them for it is a plan they
 * stop opening.
 */
export function nextDayIndex(plan: Plan, sessions: readonly Session[]): number {
  const done = sessions.filter((s) => s.planId === plan.id && s.endedAt !== null).length;
  return plan.days.length === 0 ? 0 : done % plan.days.length;
}

/**
 * A local calendar day, as a number you can do arithmetic on.
 *
 * Counted in days since the epoch by civil date rather than by dividing a
 * timestamp: local midnight is not a whole number of days from UTC midnight,
 * and the offset moves twice a year, so the divide-and-floor version quietly
 * merged or skipped a day at every daylight-saving boundary.
 */
const DAY_MS = 86_400_000;

function dayStamp(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Consecutive days with a finished session, counting back from today. */
export function streakDays(sessions: readonly Session[], now: number): number {
  const days = new Set(
    sessions.filter((s) => s.endedAt !== null).map((s) => dayStamp(s.startedAt))
  );
  if (days.size === 0) return 0;

  const today = dayStamp(now);
  // Training yesterday but not yet today should still read as a live streak.
  let cursor = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/** Monday-first flags for the current week, for the design's seven bars. */
export function weekProgress(sessions: readonly Session[], now: number): boolean[] {
  const today = new Date(now);
  const weekday = (today.getDay() + 6) % 7;
  const monday = dayStamp(now) - weekday;
  const done = new Set(
    sessions.filter((s) => s.endedAt !== null).map((s) => dayStamp(s.startedAt))
  );
  return Array.from({ length: 7 }, (_, i) => done.has(monday + i));
}

export function sessionsThisWeek(sessions: readonly Session[], now: number): number {
  return weekProgress(sessions, now).filter(Boolean).length;
}

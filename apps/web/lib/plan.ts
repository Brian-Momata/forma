import {
  estimateDaySeconds,
  type Library,
  type Plan,
  type PlanDay,
  type PlayerItem,
  type Session,
} from "@form/core";

/** Flattens a plan day into the player's input. */
export function resolveDay(library: Library, day: PlanDay): PlayerItem[] {
  return day.exercises.flatMap((item): PlayerItem[] => {
    const exercise = library.byId(item.exerciseId);
    if (!exercise) return [];
    return [
      {
        exerciseId: exercise.id,
        name: exercise.name,
        kind: exercise.kind,
        sets: item.prescription.sets,
        reps: item.prescription.reps ?? null,
        durationSec: item.prescription.durationSec ?? null,
        restSec: item.prescription.restSec,
        warmup: item.warmup,
        cues: exercise.cues,
        images: exercise.images,
      },
    ];
  });
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

const DAY_MS = 86_400_000;

function dayStamp(ms: number): number {
  const d = new Date(ms);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY_MS);
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

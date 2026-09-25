import { z } from "zod";
import {
  emptyPlan,
  generatePlan,
  Plan,
  Profile,
  Session,
  Setup,
  type Feel,
  type Goal,
  type Schedule,
  type Library,
  type PlanId,
  type SessionId,
  type SetRecord,
  type SetupId,
} from "@form/core";

import { isInstallNudge, type InstallNudge } from "@/lib/install";
import { PROFILE_ID, SCHEMA_VERSION, db } from "./schema.ts";

const now = () => Date.now();

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rand}`;
}

/* ------------------------------------------------------------------ profile */

export async function getProfile(): Promise<Profile | undefined> {
  const row = await db.profile.get(PROFILE_ID);
  if (!row) return undefined;
  const profile = { ...row } as Profile & { id?: string };
  delete profile.id;
  return profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put({ ...profile, id: PROFILE_ID, updatedAt: now() });
}

export function defaultProfile(): Profile {
  const t = now();
  return {
    goal: "general",
    experience: "returning",
    schedule: { daysPerWeek: 3, minutesPerSession: 30 },
    limitations: [],
    units: "kg",
    accent: "#D4FF3F",
    restColor: "#8A7BFF",
    highContrast: false,
    autoAdvance: true,
    restOverrideSec: null,
    disclaimerAcceptedAt: null,
    createdAt: t,
    updatedAt: t,
  };
}

/* ------------------------------------------------------------------- setups */

export async function listSetups(): Promise<Setup[]> {
  return db.setups.orderBy("updatedAt").reverse().toArray();
}

export async function getSetup(id: SetupId): Promise<Setup | undefined> {
  return db.setups.get(id);
}

export async function saveSetup(setup: Setup): Promise<Setup> {
  const next = { ...setup, updatedAt: now() };
  await db.setups.put(next);
  return next;
}

export async function deleteSetup(id: SetupId): Promise<void> {
  // A setup's plans are meaningless without it, but sessions are history and
  // belong to the person, so they survive.
  await db.transaction("rw", db.setups, db.plans, async () => {
    await db.plans.where("setupId").equals(id).delete();
    await db.setups.delete(id);
  });
}

export async function getActiveSetupId(): Promise<SetupId | undefined> {
  const row = await db.meta.get("activeSetupId");
  return row?.value as SetupId | undefined;
}

export async function setActiveSetupId(id: SetupId): Promise<void> {
  await db.meta.put({ key: "activeSetupId", value: id });
}

/** The setup the person is training in right now, falling back to any they have. */
export async function getActiveSetup(): Promise<Setup | undefined> {
  const id = await getActiveSetupId();
  if (id) {
    const found = await db.setups.get(id);
    if (found) return found;
  }
  const all = await listSetups();
  return all[0];
}

/* -------------------------------------------------------------------- plans */

export async function listPlans(): Promise<Plan[]> {
  return db.plans.orderBy("updatedAt").reverse().toArray();
}

export async function getPlan(id: PlanId): Promise<Plan | undefined> {
  return db.plans.get(id);
}

export async function plansForSetup(setupId: SetupId): Promise<Plan[]> {
  return db.plans.where("setupId").equals(setupId).toArray();
}

export async function savePlan(plan: Plan): Promise<Plan> {
  const next = { ...plan, updatedAt: now() };
  await db.plans.put(next);
  return next;
}

export async function deletePlan(id: PlanId): Promise<void> {
  await db.plans.delete(id);
  if ((await getActivePlanId()) === id) {
    await db.meta.delete("activePlanId");
  }
}

export interface PlanRequest {
  goal?: Goal;
  schedule?: Schedule;
  name?: string;
}

/**
 * Rebuilds *every* generated plan for a setup, in place.
 *
 * Used when the situation itself changes -- new equipment, a new limitation --
 * because those plans were derived from the old answers and are now wrong.
 * Each keeps its own id, name, goal and schedule: one person can run a strength
 * block and a mobility plan in the same place, and both need rebuilding.
 *
 * Plans the person has edited are never touched: those are theirs, not ours to
 * overwrite. A setup with no plan at all gets its first one here, which is the
 * onboarding path -- unless `createFirst` is false, for callers that are only
 * rebuilding what exists and must not add a plan or change the active one.
 */
export async function regenerateSetupPlans(
  library: Library,
  profile: Profile,
  setup: Setup,
  { createFirst = true }: { createFirst?: boolean } = {}
): Promise<Plan[]> {
  const existing = await plansForSetup(setup.id);
  const previous = existing.filter((p) => p.generated);

  if (previous.length === 0) {
    // Nothing generated here. Only build a first plan if the person has not
    // already made one by hand -- otherwise we would be adding a plan they
    // never asked for.
    if (existing.length > 0 || !createFirst) return [];
    const plan = generatePlan(library, profile, setup, {
      now: now(),
      planId: newId("plan"),
    });
    await db.plans.put(plan);
    await setActivePlanId(plan.id);
    return [plan];
  }

  const rebuilt = previous.map((prior) => {
    const next = generatePlan(library, profile, setup, {
      now: now(),
      planId: prior.id,
      goal: prior.goal,
      schedule: prior.schedule,
      name: prior.name,
    });
    return {
      ...next,
      // The situation changed, not the person's history with this plan. Someone
      // six weeks into a block who buys a kettlebell is still six weeks in, and
      // the plan was created when it was created.
      week: prior.week,
      createdAt: prior.createdAt,
    };
  });
  await db.plans.bulkPut(rebuilt);
  return rebuilt;
}

/**
 * Adds a new plan alongside whatever already exists.
 *
 * This is what lets one person train for more than one thing: a strength block
 * at the gym and a mobility plan at home are two plans, not a setting someone
 * has to keep flipping.
 */
export async function createGeneratedPlan(
  library: Library,
  profile: Profile,
  setup: Setup,
  request: PlanRequest = {}
): Promise<Plan> {
  const plan = generatePlan(library, profile, setup, {
    now: now(),
    planId: newId("plan"),
    ...request,
  });
  await db.plans.put(plan);
  await setActivePlanId(plan.id);
  return plan;
}

/** An empty plan for someone who would rather build it themselves. */
export async function createCustomPlan(
  setup: Setup,
  request: Required<Pick<PlanRequest, "name" | "goal" | "schedule">>
): Promise<Plan> {
  const plan = emptyPlan(setup, {
    planId: newId("plan"),
    name: request.name,
    goal: request.goal,
    schedule: request.schedule,
    now: now(),
  });
  await db.plans.put(plan);
  await setActivePlanId(plan.id);
  return plan;
}

/** Copying a plan is the easiest way to try a variation without losing the original. */
export async function duplicatePlan(plan: Plan): Promise<Plan> {
  const copy: Plan = {
    ...plan,
    id: newId("plan") as PlanId,
    name: `${plan.name} copy`,
    // A copy is the person's from the moment it exists, so regeneration for
    // the setup will not silently rewrite it.
    generated: false,
    week: 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.plans.put(copy);
  await setActivePlanId(copy.id);
  return copy;
}

export async function getActivePlanId(): Promise<PlanId | undefined> {
  const row = await db.meta.get("activePlanId");
  return row?.value as PlanId | undefined;
}

export async function setActivePlanId(id: PlanId): Promise<void> {
  await db.meta.put({ key: "activePlanId", value: id });
}

/** The plan Today should show, falling back sensibly if it was deleted. */
export async function getActivePlan(): Promise<Plan | undefined> {
  const id = await getActivePlanId();
  if (id) {
    const found = await db.plans.get(id);
    if (found) return found;
  }
  const setup = await getActiveSetup();
  if (setup) {
    const forSetup = await plansForSetup(setup.id);
    if (forSetup[0]) return forSetup[0];
  }
  return (await listPlans())[0];
}

/* ----------------------------------------------------------------- sessions */

export async function listSessions(limit = 100): Promise<Session[]> {
  return db.sessions.orderBy("startedAt").reverse().limit(limit).toArray();
}

/**
 * How many sessions there have ever been.
 *
 * Counted in the database rather than from the loaded page of history, which
 * stops at 100 -- a lifetime total that silently stopped moving at 100 is worse
 * than no total.
 */
export async function countFinishedSessions(): Promise<number> {
  return db.sessions.filter((s) => s.endedAt !== null).count();
}

export async function getSession(id: SessionId): Promise<Session | undefined> {
  return db.sessions.get(id);
}

export async function saveSession(session: Session): Promise<void> {
  await db.sessions.put({ ...session, updatedAt: now() });
}

export function newSession(
  planId: PlanId,
  setupId: SetupId,
  dayIndex: number,
  dayName: string
): Session {
  const t = now();
  return {
    id: newId("session") as SessionId,
    planId,
    setupId,
    dayIndex,
    // Snapshotted, not looked up later: history is a record of what happened,
    // and reading the name back off the live plan meant renaming a day
    // retroactively relabelled every session that ever used it.
    dayName,
    startedAt: t,
    endedAt: null,
    sets: [],
    feel: null,
    createdAt: t,
    updatedAt: t,
  };
}

/**
 * Whether a session has anything in it worth calling a day trained.
 *
 * One ended straight after it was opened, or with every set skipped, is not:
 * keeping it would count it as a session, keep a streak alive on a day nothing
 * was done, and move the plan's rotation past a day that was never trained.
 * Skipped sets on their own are not history anyone is missing.
 */
export function hasTrained(sets: readonly SetRecord[]): boolean {
  return sets.some((s) => !s.skipped);
}

/**
 * Banks what has happened so far, mid-session.
 *
 * Called on every phase change, because the sets someone has already done are
 * not ours to hold in memory: closing the app on the summary screen, or being
 * killed by the OS mid-workout, must not lose an hour of training
 * (ENGINEERING.md §1.5).
 *
 * Read and write happen in one transaction. The store fires these without
 * waiting for them, and a read taken before `finishSession` landed but written
 * after it would put the row back without its feedback.
 */
export async function recordSessionProgress(
  id: SessionId,
  sets: readonly SetRecord[],
  endedAt: number | null
): Promise<void> {
  await db.transaction("rw", db.sessions, async () => {
    const existing = await db.sessions.get(id);
    if (!existing) return;
    const closedAt = endedAt ?? existing.endedAt;
    if (closedAt !== null && !hasTrained(sets)) {
      await db.sessions.delete(id);
      return;
    }
    await db.sessions.put({
      ...existing,
      sets: [...sets],
      endedAt: closedAt,
      updatedAt: now(),
    });
  });
}

/** Closes a session out. The sets are already banked; this adds how it felt. */
export async function finishSession(
  id: SessionId,
  sets: SetRecord[],
  feel: Feel | null
): Promise<void> {
  await db.transaction("rw", db.sessions, async () => {
    const existing = await db.sessions.get(id);
    if (!existing) return;
    if (!hasTrained(sets)) {
      await db.sessions.delete(id);
      return;
    }
    await db.sessions.put({
      ...existing,
      sets,
      feel,
      endedAt: existing.endedAt ?? now(),
      updatedAt: now(),
    });
  });
}

/* -------------------------------------------------------- in-progress resume */

/**
 * The live session is checkpointed here on every tick. Someone forty minutes
 * into a workout who takes a phone call must not lose it (ENGINEERING.md §6).
 */
export async function checkpoint(value: unknown): Promise<void> {
  await db.meta.put({ key: "activeSession", value });
}

export async function readCheckpoint<T>(): Promise<T | undefined> {
  const row = await db.meta.get("activeSession");
  return row?.value as T | undefined;
}

export async function clearCheckpoint(): Promise<void> {
  await db.meta.delete("activeSession");
}

/* ----------------------------------------------------------- install prompt */

/**
 * What this device remembers about being asked to install the app.
 *
 * `meta` rather than the profile, so it stays out of the export bundle: it is a
 * fact about this phone, not about the person (see `lib/install.ts`).
 */
export async function getInstallNudge(): Promise<InstallNudge | null> {
  const row = await db.meta.get("installNudge");
  return isInstallNudge(row?.value) ? row.value : null;
}

export async function saveInstallNudge(nudge: InstallNudge): Promise<void> {
  await db.meta.put({ key: "installNudge", value: nudge });
}

/* ------------------------------------------------------------ export/import */

export interface ExportBundle {
  schemaVersion: number;
  exportedAt: number;
  profile: Profile | undefined;
  setups: Setup[];
  plans: Plan[];
  sessions: Session[];
}

/**
 * The shape of a backup file, parsed rather than trusted.
 *
 * This is the one place a stranger's bytes reach the database, and the database
 * is someone's entire training history. A cast would let a half-valid file
 * overwrite it and leave the app crashing on a plan with no days
 * (ENGINEERING.md §4: boundaries accept `unknown` and Zod-parse).
 */
const ImportBundle = z.object({
  schemaVersion: z.number().int().min(1).optional(),
  exportedAt: z.number().int().optional(),
  profile: Profile.optional().nullable(),
  setups: z.array(Setup),
  plans: z.array(Plan),
  sessions: z.array(Session),
});

export class ImportError extends Error {}

/**
 * Brings a bundle up to the current shape before it is written.
 *
 * A backup taken at v1 has plans with no goal and no schedule. Restoring it
 * into a v2 database never runs the Dexie upgrade -- that only fires when the
 * database version changes -- so the backfill has to happen here too, or the
 * restore reintroduces exactly the bug the migration exists to fix.
 */
function migrateBundle(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) {
    throw new ImportError("That file is not a FORM backup.");
  }
  const bundle = { ...(raw as Record<string, unknown>) };
  const version = typeof bundle["schemaVersion"] === "number" ? bundle["schemaVersion"] : 1;

  if (version > SCHEMA_VERSION) {
    throw new ImportError(
      "That backup was made by a newer version of FORM. Update the app, then import it."
    );
  }

  if (version < 2 && Array.isArray(bundle["plans"])) {
    bundle["plans"] = bundle["plans"].map((p) => {
      if (typeof p !== "object" || p === null) return p;
      const plan = { ...(p as Record<string, unknown>) };
      if (!plan["schedule"]) {
        plan["schedule"] = {
          daysPerWeek: Math.min(7, Math.max(1, (plan["days"] as unknown[])?.length ?? 3)),
          minutesPerSession: 30,
        };
      }
      if (!plan["goal"]) plan["goal"] = "general";
      return plan;
    });
  }

  return bundle;
}

/** Parses a backup file, or explains why it cannot be read. Never writes. */
export function parseBundle(raw: unknown): ExportBundle {
  const parsed = ImportBundle.safeParse(migrateBundle(raw));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".");
    throw new ImportError(
      where
        ? `That backup could not be read: ${where} is not what we expected.`
        : "That backup could not be read."
    );
  }
  return {
    schemaVersion: parsed.data.schemaVersion ?? SCHEMA_VERSION,
    exportedAt: parsed.data.exportedAt ?? now(),
    profile: parsed.data.profile ?? undefined,
    setups: parsed.data.setups,
    plans: parsed.data.plans,
    sessions: parsed.data.sessions,
  };
}

/** A lost phone should not be a lost training history. */
export async function exportAll(): Promise<ExportBundle> {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now(),
    profile: await getProfile(),
    setups: await db.setups.toArray(),
    plans: await db.plans.toArray(),
    sessions: await db.sessions.toArray(),
  };
}

/**
 * Restores a backup. Takes `unknown` on purpose: callers hand us whatever was
 * in the file, and nothing reaches the database until it has been parsed.
 */
export async function importAll(raw: unknown): Promise<ExportBundle> {
  const bundle = parseBundle(raw);
  await db.transaction("rw", db.profile, db.setups, db.plans, db.sessions, async () => {
    if (bundle.profile) await saveProfile(bundle.profile);
    await db.setups.bulkPut(bundle.setups);
    await db.plans.bulkPut(bundle.plans);
    await db.sessions.bulkPut(bundle.sessions);
  });
  return bundle;
}

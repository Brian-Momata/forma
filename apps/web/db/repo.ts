import {
  generatePlan,
  type Feel,
  type Library,
  type Plan,
  type PlanId,
  type Profile,
  type Session,
  type SessionId,
  type SetRecord,
  type Setup,
  type SetupId,
} from "@form/core";

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
}

/**
 * Builds and stores a plan for a situation.
 *
 * Regenerating for a setup replaces that setup's generated plan but leaves
 * anything the person edited by hand alone -- a plan someone has customised is
 * theirs, not ours to overwrite.
 */
export async function generateAndSavePlan(
  library: Library,
  profile: Profile,
  setup: Setup
): Promise<Plan> {
  const existing = await plansForSetup(setup.id);
  const previous = existing.find((p) => p.generated);

  const plan = generatePlan(library, profile, setup, {
    now: now(),
    planId: previous?.id ?? newId("plan"),
  });

  await db.plans.put(plan);
  return plan;
}

/* ----------------------------------------------------------------- sessions */

export async function listSessions(limit = 100): Promise<Session[]> {
  return db.sessions.orderBy("startedAt").reverse().limit(limit).toArray();
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
  dayIndex: number
): Session {
  const t = now();
  return {
    id: newId("session") as SessionId,
    planId,
    setupId,
    dayIndex,
    startedAt: t,
    endedAt: null,
    sets: [],
    feel: null,
    createdAt: t,
    updatedAt: t,
  };
}

export async function finishSession(
  id: SessionId,
  sets: SetRecord[],
  feel: Feel | null
): Promise<void> {
  const existing = await db.sessions.get(id);
  if (!existing) return;
  await db.sessions.put({
    ...existing,
    sets,
    feel,
    endedAt: now(),
    updatedAt: now(),
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

/* ------------------------------------------------------------ export/import */

export interface ExportBundle {
  schemaVersion: number;
  exportedAt: number;
  profile: Profile | undefined;
  setups: Setup[];
  plans: Plan[];
  sessions: Session[];
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

export async function importAll(bundle: ExportBundle): Promise<void> {
  await db.transaction("rw", db.profile, db.setups, db.plans, db.sessions, async () => {
    if (bundle.profile) await saveProfile(bundle.profile);
    await db.setups.bulkPut(bundle.setups);
    await db.plans.bulkPut(bundle.plans);
    await db.sessions.bulkPut(bundle.sessions);
  });
}

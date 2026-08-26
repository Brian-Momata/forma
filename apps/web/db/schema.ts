import Dexie, { type EntityTable } from "dexie";
import type { Plan, Profile, Session, Setup } from "@form/core";

/**
 * Local-first storage. There is no server: everything a person does lives on
 * their device, which is why this file gets more care than most.
 *
 * Every record carries `updatedAt` and a stable id so accounts and sync can be
 * layered on later without a migration. Migrations are additive and each one
 * ships with a test -- losing someone's training history is the worst bug we
 * can ship (ENGINEERING.md §5).
 */
export const SCHEMA_VERSION = 1;

export interface Meta {
  key: string;
  value: unknown;
}

export class FormDatabase extends Dexie {
  profile!: EntityTable<Profile & { id: string }, "id">;
  setups!: EntityTable<Setup, "id">;
  plans!: EntityTable<Plan, "id">;
  sessions!: EntityTable<Session, "id">;
  meta!: EntityTable<Meta, "key">;

  constructor(name = "form") {
    super(name);
    this.version(1).stores({
      profile: "id, updatedAt",
      setups: "id, updatedAt, location",
      plans: "id, setupId, updatedAt",
      sessions: "id, planId, setupId, startedAt",
      meta: "key",
    });
  }
}

export const db = new FormDatabase();

/** The single profile row. One person per device; no accounts to disambiguate. */
export const PROFILE_ID = "me";

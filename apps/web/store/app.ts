"use client";

import { create } from "zustand";
import type { Library, Plan, Profile, Session, Setup, SetupId } from "@form/core";

import { loadLibrary } from "@/lib/library";
import {
  defaultProfile,
  generateAndSavePlan,
  getActiveSetup,
  getProfile,
  listPlans,
  listSessions,
  listSetups,
  saveProfile,
  saveSetup,
  setActiveSetupId,
} from "@/db/repo";

interface AppStore {
  ready: boolean;
  library: Library | null;
  profile: Profile | null;
  setups: Setup[];
  plans: Plan[];
  sessions: Session[];
  activeSetup: Setup | null;

  load(): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  upsertSetup(setup: Setup): Promise<Setup>;
  activateSetup(id: SetupId): Promise<void>;
  regeneratePlan(setup?: Setup): Promise<Plan | null>;
  refresh(): Promise<void>;
}

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  library: null,
  profile: null,
  setups: [],
  plans: [],
  sessions: [],
  activeSetup: null,

  async load() {
    if (get().ready) return;
    const [library, profile, setups, plans, sessions, activeSetup] = await Promise.all([
      loadLibrary(),
      getProfile(),
      listSetups(),
      listPlans(),
      listSessions(),
      getActiveSetup(),
    ]);
    set({
      ready: true,
      library,
      profile: profile ?? null,
      setups,
      plans,
      sessions,
      activeSetup: activeSetup ?? null,
    });
  },

  async refresh() {
    const [profile, setups, plans, sessions, activeSetup] = await Promise.all([
      getProfile(),
      listSetups(),
      listPlans(),
      listSessions(),
      getActiveSetup(),
    ]);
    set({
      profile: profile ?? null,
      setups,
      plans,
      sessions,
      activeSetup: activeSetup ?? null,
    });
  },

  async updateProfile(patch) {
    const current = get().profile ?? defaultProfile();
    const next: Profile = { ...current, ...patch, updatedAt: Date.now() };
    await saveProfile(next);
    set({ profile: next });
  },

  async upsertSetup(setup) {
    const saved = await saveSetup(setup);
    const setups = await listSetups();
    set({ setups });
    if (get().activeSetup?.id === saved.id) set({ activeSetup: saved });
    return saved;
  },

  async activateSetup(id) {
    await setActiveSetupId(id);
    const setups = get().setups;
    set({ activeSetup: setups.find((s) => s.id === id) ?? null });
  },

  /**
   * Rebuilds the plan for a situation. The situation is the input, so changing
   * a setup's equipment is expected to produce a materially different plan.
   */
  async regeneratePlan(setup) {
    const { library, profile } = get();
    const target = setup ?? get().activeSetup;
    if (!library || !profile || !target) return null;

    const plan = await generateAndSavePlan(library, profile, target);
    set({ plans: await listPlans() });
    return plan;
  },
}));

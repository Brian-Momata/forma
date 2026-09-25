"use client";

import { create } from "zustand";
import type { Library, Plan, PlanId, Profile, Session, Setup, SetupId } from "@form/core";

import { loadLibrary } from "@/lib/library";
import {
  createCustomPlan,
  createGeneratedPlan,
  defaultProfile,
  deletePlan,
  duplicatePlan,
  getActivePlan,
  getActiveSetup,
  getProfile,
  listPlans,
  listSessions,
  listSetups,
  regenerateSetupPlans,
  saveProfile,
  savePlan,
  saveSetup,
  setActivePlanId,
  setActiveSetupId,
  type PlanRequest,
} from "@/db/repo";

interface AppStore {
  ready: boolean;
  /** Set when bootstrap failed, so a screen can offer a retry instead of a spinner. */
  error: string | null;
  library: Library | null;
  profile: Profile | null;
  setups: Setup[];
  plans: Plan[];
  sessions: Session[];
  activeSetup: Setup | null;
  activePlan: Plan | null;

  load(): Promise<void>;
  retry(): Promise<void>;
  refresh(): Promise<void>;

  updateProfile(patch: Partial<Profile>): Promise<void>;

  upsertSetup(setup: Setup): Promise<Setup>;
  activateSetup(id: SetupId): Promise<void>;

  /** Rebuilds every generated plan for a setup, because the situation changed. */
  regenerateForSetup(setup?: Setup): Promise<Plan | null>;
  /** Rebuilds every generated plan, for changes that affect them all. */
  regenerateAll(): Promise<void>;

  addGeneratedPlan(setup: Setup, request: PlanRequest): Promise<Plan | null>;
  addCustomPlan(setup: Setup, request: Required<PlanRequest>): Promise<Plan>;
  copyPlan(plan: Plan): Promise<Plan>;
  removePlan(id: PlanId): Promise<void>;
  activatePlan(id: PlanId): Promise<void>;
  updatePlan(plan: Plan): Promise<void>;
}

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  error: null,
  library: null,
  profile: null,
  setups: [],
  plans: [],
  sessions: [],
  activeSetup: null,
  activePlan: null,

  /**
   * Brings the app up.
   *
   * Wrapped, because it can genuinely fail: the exercise library is a separate
   * chunk, and a first run that goes offline before it has ever been fetched
   * used to reject inside Promise.all, leave `ready` false forever, and strand
   * every screen on "Loading…" with an unhandled rejection behind it.
   */
  async load() {
    if (get().ready) return;
    try {
      const [library, profile, setups, plans, sessions, activeSetup, activePlan] =
        await Promise.all([
          loadLibrary(),
          getProfile(),
          listSetups(),
          listPlans(),
          listSessions(),
          getActiveSetup(),
          getActivePlan(),
        ]);
      set({
        ready: true,
        error: null,
        library,
        profile: profile ?? null,
        setups,
        plans,
        sessions,
        activeSetup: activeSetup ?? null,
        activePlan: activePlan ?? null,
      });
    } catch {
      set({
        ready: false,
        error:
          "We could not load your exercises. Check your connection once, and they are yours offline from then on.",
      });
    }
  },

  async retry() {
    set({ error: null });
    await get().load();
  },

  async refresh() {
    const [profile, setups, plans, sessions, activeSetup, activePlan] = await Promise.all([
      getProfile(),
      listSetups(),
      listPlans(),
      listSessions(),
      getActiveSetup(),
      getActivePlan(),
    ]);
    set({
      profile: profile ?? null,
      setups,
      plans,
      sessions,
      activeSetup: activeSetup ?? null,
      activePlan: activePlan ?? null,
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
    set({ setups: await listSetups() });
    if (get().activeSetup?.id === saved.id) set({ activeSetup: saved });
    return saved;
  },

  async activateSetup(id) {
    await setActiveSetupId(id);
    set({ activeSetup: get().setups.find((s) => s.id === id) ?? null });
  },

  async regenerateForSetup(setup) {
    const { library, profile } = get();
    const target = setup ?? get().activeSetup;
    if (!library || !profile || !target) return null;

    const [plan] = await regenerateSetupPlans(library, profile, target);
    await get().refresh();
    return plan ?? null;
  },

  /**
   * Used for changes that invalidate every generated plan at once -- a new
   * injury to work around, say. Hand-edited plans are left alone.
   */
  async regenerateAll() {
    const { library, profile, setups } = get();
    if (!library || !profile) return;
    for (const setup of setups) {
      // Rebuild only: a setup with no plans left is not asking for a new one.
      await regenerateSetupPlans(library, profile, setup, { createFirst: false });
    }
    await get().refresh();
  },

  async addGeneratedPlan(setup, request) {
    const { library, profile } = get();
    if (!library || !profile) return null;
    const plan = await createGeneratedPlan(library, profile, setup, request);
    await get().refresh();
    return plan;
  },

  async addCustomPlan(setup, request) {
    const plan = await createCustomPlan(setup, request);
    await get().refresh();
    return plan;
  },

  async copyPlan(plan) {
    const copy = await duplicatePlan(plan);
    await get().refresh();
    return copy;
  },

  async removePlan(id) {
    await deletePlan(id);
    await get().refresh();
  },

  async activatePlan(id) {
    await setActivePlanId(id);
    await get().refresh();
  },

  /**
   * Patches one plan in place rather than re-reading the whole database.
   *
   * Editing is the highest-frequency write in the app -- a stepper tap, a
   * character typed -- and a full refresh per edit meant every keystroke read
   * back the profile, every setup, every plan and every session.
   */
  async updatePlan(plan) {
    const saved = await savePlan(plan);
    set((s) => ({
      plans: s.plans.map((p) => (p.id === saved.id ? saved : p)),
      activePlan: s.activePlan?.id === saved.id ? saved : s.activePlan,
    }));
  },
}));

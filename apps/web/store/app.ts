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
  library: Library | null;
  profile: Profile | null;
  setups: Setup[];
  plans: Plan[];
  sessions: Session[];
  activeSetup: Setup | null;
  activePlan: Plan | null;

  load(): Promise<void>;
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
  library: null,
  profile: null,
  setups: [],
  plans: [],
  sessions: [],
  activeSetup: null,
  activePlan: null,

  async load() {
    if (get().ready) return;
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
      library,
      profile: profile ?? null,
      setups,
      plans,
      sessions,
      activeSetup: activeSetup ?? null,
      activePlan: activePlan ?? null,
    });
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
      await regenerateSetupPlans(library, profile, setup);
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

  async updatePlan(plan) {
    await savePlan(plan);
    await get().refresh();
  },
}));

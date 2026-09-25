"use client";

import { create } from "zustand";
import {
  abandon as abandonPlayer,
  addRest as addRestPlayer,
  completeSet as completeSetPlayer,
  completedSets,
  setWeight as setWeightPlayer,
  skip as skipPlayer,
  start as startPlayer,
  tick as tickPlayer,
  togglePause,
  type PlayerItem,
  type PlayerState,
} from "@form/core";
import type { Feel, PlanId, SessionId, SetupId } from "@form/core";

import {
  checkpoint,
  clearCheckpoint,
  finishSession,
  readCheckpoint,
  recordSessionProgress,
} from "@/db/repo";

export interface SessionMeta {
  sessionId: SessionId;
  planId: PlanId;
  setupId: SetupId;
  dayIndex: number;
  planName: string;
  dayName: string;
}

interface SessionStore {
  player: PlayerState | null;
  meta: SessionMeta | null;
  /**
   * Current wall-clock time, republished on every tick.
   *
   * Kept in the store so leaf components can select a derived integer (the
   * seconds remaining) and re-render only when that integer changes, instead
   * of re-rendering the tree once a second (ENGINEERING.md §11).
   */
  now: number;

  begin(items: readonly PlayerItem[], meta: SessionMeta, options: { autoAdvance: boolean; restOverrideSec: number | null }): void;
  tick(now: number): void;
  toggle(): void;
  skip(): void;
  completeSet(): void;
  addRest(seconds: number): void;
  setWeight(kg: number | null): void;
  /** Ends the session early. False when nothing was done, so there is nothing to rate. */
  abandon(): boolean;
  finish(feel: Feel | null): Promise<void>;
  restore(player: PlayerState, meta: SessionMeta): void;
  clear(): void;
}

/** Snapshot written to storage so a reload or a phone call cannot lose a session. */
export interface SessionCheckpoint {
  player: PlayerState;
  meta: SessionMeta;
}

/**
 * Writes the session through to storage.
 *
 * Two records, deliberately: the checkpoint is how an interrupted session is
 * resumed, and the session row is the person's history. Keeping only the
 * checkpoint would mean a workout that was never formally finished had never
 * happened, which is how an hour of training used to disappear.
 */
function persist(player: PlayerState, meta: SessionMeta): void {
  void checkpoint({ player, meta } satisfies SessionCheckpoint);
  void recordSessionProgress(meta.sessionId, player.records, player.endedAt);
}

export const useSession = create<SessionStore>((set, get) => ({
  player: null,
  meta: null,
  now: 0,

  begin(items, meta, options) {
    const now = Date.now();
    const player = startPlayer(items, now, options);
    set({ player, meta, now });
    persist(player, meta);
  },

  tick(now) {
    const { player, meta } = get();
    if (!player) return;
    const next = tickPlayer(player, now);
    // Timestamps make state recomputable, so a checkpoint is only needed when
    // the phase actually changes -- not on every one of these.
    if (next !== player && meta) persist(next, meta);
    set({ player: next, now });
  },

  toggle() {
    const { player, meta } = get();
    if (!player) return;
    const next = togglePause(player, Date.now());
    set({ player: next });
    if (meta) persist(next, meta);
  },

  skip() {
    const { player, meta } = get();
    if (!player) return;
    const next = skipPlayer(player, Date.now());
    set({ player: next });
    if (meta) persist(next, meta);
  },

  completeSet() {
    const { player, meta } = get();
    if (!player) return;
    const next = completeSetPlayer(player, Date.now());
    set({ player: next });
    if (meta) persist(next, meta);
  },

  addRest(seconds) {
    const { player, meta } = get();
    if (!player) return;
    const next = addRestPlayer(player, seconds);
    set({ player: next });
    if (meta) persist(next, meta);
  },

  abandon() {
    const { player, meta } = get();
    if (!player) return false;
    const next = abandonPlayer(player, Date.now());

    // Nothing done: there is no session to keep and nothing to rate. Closing it
    // drops the row (see `hasTrained`), so it neither counts nor moves the
    // plan on to the next day.
    if (completedSets(next) === 0) {
      if (meta) void recordSessionProgress(meta.sessionId, next.records, next.endedAt);
      set({ player: null, meta: null });
      void clearCheckpoint();
      return false;
    }

    set({ player: next });
    // "End and save" has to actually save. The sets are already banked by the
    // ticks that got here; this is what closes the session so it counts as
    // trained rather than sitting half-open forever. The checkpoint is kept,
    // finished, so the Complete screen survives a reload until it is rated.
    if (meta) persist(next, meta);
    return true;
  },

  async finish(feel) {
    const { player, meta } = get();
    if (!player || !meta) return;
    await finishSession(meta.sessionId, [...player.records], feel);
    await clearCheckpoint();
  },

  setWeight(kg) {
    const { player, meta } = get();
    if (!player) return;
    const next = setWeightPlayer(player, kg);
    set({ player: next });
    if (meta) persist(next, meta);
  },

  restore(player, meta) {
    set({ player, meta, now: Date.now() });
  },

  clear() {
    set({ player: null, meta: null, now: 0 });
    void clearCheckpoint();
  },
}));

/**
 * A session that finished but was never rated, if there is one.
 *
 * Its feedback is what progresses the plan and writes the weights lifted back
 * onto it, and the only place that happens is the Complete screen. Closing the
 * app there, or reloading it, used to lose both: the session was already
 * closed, so nothing ever asked again.
 */
export async function readUnratedSession(): Promise<SessionCheckpoint | undefined> {
  const saved = await readCheckpoint<SessionCheckpoint>();
  return saved?.player.phase === "complete" ? saved : undefined;
}

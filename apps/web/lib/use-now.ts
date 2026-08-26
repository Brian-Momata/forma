"use client";

import { useSyncExternalStore } from "react";

/**
 * Current time, as an external store.
 *
 * Reading the clock during render is impure and, worse, a hydration hazard:
 * the server and the client can disagree about what day it is. The clock is a
 * genuine external system, so it is subscribed to rather than polled in an
 * effect. The server snapshot is 0, so the first paint is deterministic.
 *
 * One shared interval serves every subscriber, and it stops when the last one
 * unmounts.
 */
const REFRESH_MS = 60_000;

let snapshot = 0;
let timer: number | null = null;
const listeners = new Set<() => void>();

function broadcast(): void {
  snapshot = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    snapshot = Date.now();
    timer = window.setInterval(broadcast, REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => 0
  );
}

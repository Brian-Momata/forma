"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on during a workout.
 *
 * Nobody wants to poke their phone between reps, and a locked screen also
 * stops the timer being visible mid-set. The lock is released the moment the
 * session ends -- a leaked wake lock flattens a battery in a pocket.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Denied or unsupported. The workout still works, the screen just dims.
      }
    };

    // The system drops the lock whenever the tab is hidden, so take it again.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

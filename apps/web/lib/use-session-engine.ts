"use client";

import { useEffect, useRef } from "react";

import { playTone, vibrate } from "./audio";
import { useWakeLock } from "./wake-lock";
import { useSession } from "@/store/session";

const TICK_MS = 200;

/**
 * Drives the workout.
 *
 * This is the only place in the app that reads the clock or owns an interval;
 * the state machine itself is pure (ENGINEERING.md §3). Ticking faster than
 * once a second keeps the progress bar smooth and, more importantly, means a
 * countdown reaching zero fires its tone promptly rather than up to a second
 * late.
 */
export function useSessionEngine(): void {
  const tick = useSession((s) => s.tick);
  const active = useSession((s) => s.player !== null && s.player.phase !== "complete");
  const phase = useSession((s) => s.player?.phase);
  const chimeAt = useSession((s) => s.player?.chimeAt ?? null);

  useWakeLock(active);

  useEffect(() => {
    if (!active) return;
    tick(Date.now());
    const id = window.setInterval(() => tick(Date.now()), TICK_MS);

    // A backgrounded tab throttles timers, so recompute the moment we return.
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick(Date.now());
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, tick]);

  // The tone is a side effect of the machine reaching zero, not a caller's job.
  const lastChime = useRef<number | null>(null);
  useEffect(() => {
    if (chimeAt === null || chimeAt === lastChime.current) return;
    lastChime.current = chimeAt;

    if (phase === "complete") {
      playTone("finish");
      vibrate([90, 60, 90, 60, 160]);
    } else if (phase === "rest") {
      playTone("set-end");
      vibrate([70, 50, 70]);
    } else {
      playTone("rest-end");
      vibrate(90);
    }
  }, [chimeAt, phase]);
}

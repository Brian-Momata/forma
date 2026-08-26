"use client";

import { useEffect, useRef } from "react";
import { phaseDuration, remainingSec, type ChimeKind, type PlayerState } from "@form/core";

import { playTone, vibrate, type Tone } from "./audio";
import { useWakeLock } from "./wake-lock";
import { useSession } from "@/store/session";

const TICK_MS = 200;

/** The last seconds of any countdown, so a phase never ends without warning. */
const COUNT_IN_FROM = 3;
/**
 * Below this a count-in is noise on top of the tone that follows it.
 *
 * Five, so the switch beat gets counted in -- that is the one where being
 * ready a second early actually matters -- but the three-second get-ready,
 * which is a count-in already, does not get a second one.
 */
const MIN_COUNT_IN_PHASE_SEC = 5;

/**
 * What each thing the machine can do sounds and feels like.
 *
 * Every phase change gets one. Warm-up drills used to pass in silence purely
 * because they are all on timers -- the tones were wired to the phase they
 * landed in rather than to the event, and nothing was listening for a
 * changeover at all.
 */
const CHIMES: Record<ChimeKind, { tone: Tone; buzz: number | number[] }> = {
  "set-end": { tone: "set-end", buzz: [70, 50, 70] },
  "rest-end": { tone: "rest-end", buzz: 90 },
  "exercise-end": { tone: "exercise-end", buzz: [90, 60, 140] },
  switch: { tone: "switch", buzz: [60, 40, 60, 40, 60] },
  next: { tone: "next", buzz: 40 },
  finish: { tone: "finish", buzz: [90, 60, 90, 60, 160] },
};

/** Sessions checkpointed before chime kinds existed carry none. */
function chimeFor(state: PlayerState): ChimeKind {
  if (state.chimeKind) return state.chimeKind;
  return state.phase === "complete" ? "finish" : "set-end";
}

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

  // The sound is a side effect of the machine, not a caller's job.
  //
  // Subscribed to the store rather than selected from it: the count-in has to
  // see every second tick, and a selector that changes every second would
  // re-render the whole player screen -- exactly what §11 forbids.
  const lastChime = useRef<number | null>(null);
  const lastCountIn = useRef<number | null>(null);

  useEffect(() => {
    // A resumed session arrives carrying the chime that was ringing when it
    // was put down. Adopt it rather than sounding it again on mount.
    lastChime.current = useSession.getState().player?.chimeAt ?? null;

    return useSession.subscribe((s) => {
      const player = s.player;
      if (!player) return;

      if (player.chimeAt !== null && player.chimeAt !== lastChime.current) {
        lastChime.current = player.chimeAt;
        lastCountIn.current = null;
        const { tone, buzz } = CHIMES[chimeFor(player)];
        playTone(tone);
        vibrate(buzz);
        return;
      }

      // The count-in: three beeps before a countdown runs out, so nobody is
      // caught mid-rep by a phase they did not see coming.
      if (player.pausedAt !== null) return;

      const total = phaseDuration(player);
      if (total === null || total < MIN_COUNT_IN_PHASE_SEC) return;

      const left = remainingSec(player, s.now);
      if (left === null || left > COUNT_IN_FROM || left <= 0) return;
      if (lastCountIn.current === left) return;

      lastCountIn.current = left;
      playTone("countdown");
    });
  }, []);
}

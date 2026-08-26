"use client";

import { useEffect } from "react";

import { listenForUnlock } from "@/lib/audio";

/**
 * Unlocks the workout tones on the first tap anywhere in the app.
 *
 * Mounted at the root rather than on the player, because the unlock has to
 * happen *inside* a user gesture and the player is reached by a navigation --
 * by the time its effects run, the tap that got there is over. Every timed
 * phase used to pass in silence for exactly this reason.
 */
export function AudioUnlock() {
  useEffect(() => listenForUnlock(), []);
  return null;
}

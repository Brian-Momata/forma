"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { getInstallNudge, saveInstallNudge } from "@/db/repo";
import {
  addsByHand,
  afterDismissal,
  canInstall,
  shouldAskToInstall,
  type InstallNudge,
} from "./install";

/**
 * Installability, as an external store.
 *
 * Like the clock (`use-now.ts`) this is a genuine external system rather than
 * React state, and for the same reason: the server cannot know any of it, so
 * the server snapshot says "nothing to offer" and the first paint stays
 * deterministic. One shared store serves every subscriber.
 */

/** Chromium's install event. Not in lib.dom, and only ever fires once. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** iOS Safari's own flag predates `display-mode` and is still the only signal there. */
type IOSNavigator = Navigator & { standalone?: boolean };

interface InstallState {
  /** False until this device's record has been read; nothing is offered before then. */
  known: boolean;
  /**
   * When that read happened.
   *
   * A snooze is measured against this rather than against `Date.now()` at
   * render: reading the clock while rendering is impure and a hydration hazard
   * (`use-now.ts`), and a month-long snooze does not care about the difference.
   */
  checkedAt: number;
  installed: boolean;
  canPrompt: boolean;
  byHand: boolean;
  nudge: InstallNudge | null;
}

const SERVER: InstallState = {
  known: false,
  checkedAt: 0,
  installed: false,
  canPrompt: false,
  byHand: false,
  nudge: null,
};

let snapshot: InstallState = SERVER;
let pending: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<InstallState>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** An app opened from a home screen runs in one of these. */
const INSTALLED_MODES = ["standalone", "fullscreen", "minimal-ui"] as const;

function runningInstalled(): boolean {
  if ((navigator as IOSNavigator).standalone === true) return true;
  return INSTALLED_MODES.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
}

let watching = false;

/**
 * Starts listening when this module is imported rather than when a component
 * mounts.
 *
 * `beforeinstallprompt` fires once, shortly after load, and a listener added in
 * an effect is easily late -- the event is then gone for the whole session and
 * the card can never appear. Import is the earliest hook we have.
 */
function watch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Without this, Chrome shows its own bar at a moment of its choosing. We
    // would rather ask on the Today screen, in the app's own words.
    event.preventDefault();
    pending = event as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });

  window.addEventListener("appinstalled", () => {
    pending = null;
    set({ installed: true, canPrompt: false });
  });

  // Installing from an open tab flips display-mode underneath us.
  for (const mode of INSTALLED_MODES) {
    window
      .matchMedia(`(display-mode: ${mode})`)
      .addEventListener("change", () => set({ installed: runningInstalled() }));
  }

  set({
    installed: runningInstalled(),
    byHand: addsByHand(navigator.userAgent, navigator.maxTouchPoints),
  });
}

watch();

/** Read once per page load, however many components ask for it. */
let reading: Promise<void> | null = null;

function readNudge(): Promise<void> {
  reading ??= getInstallNudge()
    .then((nudge) => set({ known: true, checkedAt: Date.now(), nudge }))
    .catch(() => {
      // A card shown once too often is a smaller failure than a screen that
      // never finishes rendering because storage was unavailable.
      set({ known: true, checkedAt: Date.now() });
    });
  return reading;
}

async function remember(): Promise<void> {
  const next = afterDismissal(snapshot.nudge, Date.now());
  set({ nudge: next });
  try {
    await saveInstallNudge(next);
  } catch {
    // Forgetting a dismissal costs one more ask, which is not worth a crash.
  }
}

export interface Install {
  /** The card may appear: installable, and we have not been told to stop asking. */
  offer: boolean;
  /** Installing is possible at all, snoozes ignored. */
  possible: boolean;
  /** There is no prompt to fire; the person adds it from the Share menu. */
  byHand: boolean;
  installed: boolean;
  /** Raises the browser's install sheet. Only meaningful when `byHand` is false. */
  install(): Promise<void>;
  /** Not now. */
  dismiss(): Promise<void>;
}

export function useInstall(): Install {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER
  );

  useEffect(() => {
    void readNudge();
  }, []);

  const install = useCallback(async () => {
    const event = pending;
    if (!event) return;
    // The event can only be fired once, whatever the answer, so it is spent
    // here rather than left around to fail silently on a second tap.
    pending = null;
    set({ canPrompt: false });
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      // Declining the browser's own sheet is still a no. Recorded, or the card
      // returns on the next launch as though nothing had been asked.
      if (outcome !== "accepted") await remember();
    } catch {
      // A prompt that will not open (already used, no longer a valid gesture)
      // leaves the You screen as the way in.
    }
  }, []);

  const dismiss = useCallback(() => remember(), []);

  return {
    offer: state.known && shouldAskToInstall({ ...state, now: state.checkedAt }),
    possible: canInstall(state),
    byHand: state.byHand,
    installed: state.installed,
    install,
    dismiss,
  };
}

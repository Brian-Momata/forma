/**
 * Whether to ask someone to put the app on their home screen, and whether we
 * have already asked.
 *
 * Pure and DOM-free on purpose. "Can this be installed, and is it too soon to
 * ask again?" is real logic with dates in it, and the alternative is only
 * testable by installing a PWA by hand on three platforms (ENGINEERING.md §8).
 */

/**
 * What a device remembers about being asked.
 *
 * It lives in `meta` rather than the profile, which means it never travels in a
 * backup -- correctly. Being installed is a fact about *this phone*: a history
 * restored onto a new one must ask again, and one restored onto a phone that
 * already has the app should not arrive pre-dismissed.
 */
export interface InstallNudge {
  /** How many times the card has been waved away. */
  dismissals: number;
  /** When it may come back, or `null` once we have stopped asking. */
  returnsAt: number | null;
}

/** A "not now" buys a month of quiet. */
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How many times we are willing to ask.
 *
 * Two, because the first no is often reflex and the second is an answer.
 * After that the offer only exists where someone would go looking for it (the
 * You screen) -- an app that nags is an app that gets deleted.
 */
const ASKS = 2;

/** The record to store after someone waves the card away. */
export function afterDismissal(nudge: InstallNudge | null, now: number): InstallNudge {
  const dismissals = (nudge?.dismissals ?? 0) + 1;
  return {
    dismissals,
    returnsAt: dismissals >= ASKS ? null : now + SNOOZE_MS,
  };
}

/** Parsed rather than cast: it is old data from storage, and shapes drift. */
export function isInstallNudge(value: unknown): value is InstallNudge {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["dismissals"] === "number" &&
    (record["returnsAt"] === null || typeof record["returnsAt"] === "number")
  );
}

export interface InstallSituation {
  /** Already running from a home screen, so there is nothing to ask for. */
  installed: boolean;
  /** The browser handed us an install prompt we can fire. */
  canPrompt: boolean;
  /** No prompt to fire, but it can still be added from a menu by hand (iOS). */
  byHand: boolean;
}

/** Whether installing is possible at all -- what the You screen keys off. */
export function canInstall(situation: InstallSituation): boolean {
  return !situation.installed && (situation.canPrompt || situation.byHand);
}

/** Whether the unprompted card may appear. */
export function shouldAskToInstall(
  situation: InstallSituation & { nudge: InstallNudge | null; now: number }
): boolean {
  if (!canInstall(situation)) return false;
  const { nudge } = situation;
  if (!nudge) return true;
  if (nudge.returnsAt === null) return false;
  return situation.now >= nudge.returnsAt;
}

/**
 * Whether this browser installs by hand rather than by event.
 *
 * iOS never fires `beforeinstallprompt` -- there is no API, and every browser
 * on the platform installs through the Share menu. So the only honest thing to
 * offer there is the two taps, which is why this is a UA sniff: nothing else
 * distinguishes "cannot install" from "installs differently", and showing an
 * Install button that does nothing is worse than showing no card at all.
 */
export function addsByHand(userAgent: string, touchPoints: number): boolean {
  if (/iphone|ipod|ipad/i.test(userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac; the touch screen is what tells them apart.
  return /macintosh/i.test(userAgent) && touchPoints > 1;
}

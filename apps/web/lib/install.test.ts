import { describe, expect, it } from "vitest";

import {
  addsByHand,
  afterDismissal,
  canInstall,
  isInstallNudge,
  shouldAskToInstall,
  SNOOZE_MS,
  type InstallNudge,
} from "./install";

const NOW = Date.UTC(2026, 0, 12);

/** A phone that can install, has never been asked, and is not installed. */
const fresh = {
  installed: false,
  canPrompt: true,
  byHand: false,
  nudge: null as InstallNudge | null,
  now: NOW,
};

describe("who gets asked to install", () => {
  it("asks a device that can install and has never been asked", () => {
    expect(shouldAskToInstall(fresh)).toBe(true);
  });

  it("never asks someone already running from a home screen", () => {
    // The whole point of the card is the thing they have already done.
    expect(shouldAskToInstall({ ...fresh, installed: true })).toBe(false);
    expect(canInstall({ installed: true, canPrompt: true, byHand: true })).toBe(false);
  });

  it("stays silent where there is no way to install", () => {
    // A desktop browser with no install support: an Install button there does
    // nothing, and instructions would name a menu that is not present.
    expect(shouldAskToInstall({ ...fresh, canPrompt: false })).toBe(false);
  });

  it("asks on iOS, which has instructions instead of a prompt", () => {
    expect(shouldAskToInstall({ ...fresh, canPrompt: false, byHand: true })).toBe(true);
  });
});

describe("taking no for an answer", () => {
  it("goes quiet for a month after the first dismissal, then comes back once", () => {
    const nudge = afterDismissal(null, NOW);

    expect(shouldAskToInstall({ ...fresh, nudge, now: NOW + SNOOZE_MS - 1 })).toBe(false);
    expect(shouldAskToInstall({ ...fresh, nudge, now: NOW + SNOOZE_MS })).toBe(true);
  });

  it("stops asking after the second", () => {
    const second = afterDismissal(afterDismissal(null, NOW), NOW + SNOOZE_MS);

    expect(second.returnsAt).toBeNull();
    // Not "in a very long time" -- never. A year later is still never.
    expect(shouldAskToInstall({ ...fresh, nudge: second, now: NOW + SNOOZE_MS * 12 })).toBe(
      false
    );
  });

  it("keeps installing possible after it has stopped asking", () => {
    // Which is what the You screen offers: dismissing the card must not put the
    // app permanently out of reach.
    expect(canInstall({ installed: false, canPrompt: true, byHand: false })).toBe(true);
  });

  it("counts dismissals across a reload rather than restarting", () => {
    const stored: InstallNudge = { dismissals: 1, returnsAt: NOW };
    expect(afterDismissal(stored, NOW).returnsAt).toBeNull();
  });
});

describe("reading the stored record", () => {
  it("accepts what we wrote, including a retired one", () => {
    expect(isInstallNudge({ dismissals: 1, returnsAt: NOW })).toBe(true);
    expect(isInstallNudge({ dismissals: 2, returnsAt: null })).toBe(true);
  });

  it("rejects anything else, so a bad row asks again instead of throwing", () => {
    expect(isInstallNudge(null)).toBe(false);
    expect(isInstallNudge("2")).toBe(false);
    expect(isInstallNudge({})).toBe(false);
    expect(isInstallNudge({ dismissals: "1", returnsAt: null })).toBe(false);
    expect(isInstallNudge({ dismissals: 1, returnsAt: "soon" })).toBe(false);
  });
});

describe("which browsers install by hand", () => {
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const IPAD_AS_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const ANDROID =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

  it("knows an iPhone", () => {
    expect(addsByHand(IPHONE, 5)).toBe(true);
  });

  it("knows an iPad, which claims to be a Mac", () => {
    // The touch screen is the only thing separating these two strings.
    expect(addsByHand(IPAD_AS_MAC, 5)).toBe(true);
    expect(addsByHand(IPAD_AS_MAC, 0)).toBe(false);
  });

  it("leaves Android to its own install event", () => {
    // Chrome fires `beforeinstallprompt` there; showing Share instructions as
    // well would describe a menu item that does not exist.
    expect(addsByHand(ANDROID, 5)).toBe(false);
  });
});

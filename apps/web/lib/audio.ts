"use client";

/**
 * The workout's tones.
 *
 * Synthesised rather than shipped as files so they work offline with no asset
 * to fetch, and so they can be short and sharp enough to hear over music. The
 * design always pairs a tone with a visible burst, because plenty of people
 * train with the sound off (ENGINEERING.md §10).
 */

let ctx: AudioContext | null = null;
let unlocked = false;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * Unlocks audio from a real user gesture.
 *
 * This is the fix for the tones that never played during a warm-up. iOS will
 * not let an AudioContext leave `suspended` unless `resume()` is called from
 * inside a gesture handler -- and an effect that runs *after* a tap has already
 * left that handler, so the context stayed suspended for the whole session.
 * A rep set hid the bug, because its tone fires from the "Set complete" click
 * and so ran inside a gesture; every warm-up drill is on a timer, and every one
 * of those tones was silent.
 *
 * Called once from the first pointer or key event anywhere in the app, and
 * again from the button that starts a workout. A muted buffer is played
 * because on some builds `resume()` alone leaves the context unusable until
 * something has actually been rendered through it.
 */
export function primeAudio(): void {
  const c = context();
  if (!c) return;

  void c.resume();

  if (!unlocked) {
    try {
      const source = c.createBufferSource();
      source.buffer = c.createBuffer(1, 1, c.sampleRate);
      source.connect(c.destination);
      source.start(0);
      unlocked = true;
    } catch {
      // An unlock that fails is a quiet workout, never a broken one.
    }
  }
}

/** Installs the app-wide unlock. Returns a teardown for React's effect. */
export function listenForUnlock(): () => void {
  if (typeof window === "undefined") return () => {};
  const events = ["pointerdown", "touchend", "keydown"] as const;
  const onGesture = () => primeAudio();
  for (const e of events) window.addEventListener(e, onGesture, { passive: true });
  return () => {
    for (const e of events) window.removeEventListener(e, onGesture);
  };
}

function beep(at: number, frequency: number, duration: number, gain: number): void {
  const c = context();
  if (!c) return;

  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, at);

  // A raw square edge clicks; ramp the envelope instead.
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(amp).connect(c.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/**
 * One per thing that can happen, because they mean different things.
 *
 * A set ending, an exercise ending and "change sides" are three different
 * instructions, and someone with the phone in a pocket has only the sound to
 * tell them apart.
 */
export type Tone =
  | "countdown"
  | "set-end"
  | "rest-end"
  | "exercise-end"
  | "switch"
  | "next"
  | "finish";

function render(tone: Tone, t: number): void {
  switch (tone) {
    case "countdown":
      beep(t, 660, 0.09, 0.16);
      break;
    case "set-end":
      beep(t, 880, 0.16, 0.28);
      beep(t + 0.14, 1170, 0.2, 0.24);
      break;
    case "rest-end":
      beep(t, 740, 0.14, 0.26);
      beep(t + 0.12, 988, 0.18, 0.22);
      break;
    // Falling, and longer: a movement is done, not just a set of it.
    case "exercise-end":
      beep(t, 1170, 0.16, 0.26);
      beep(t + 0.15, 880, 0.16, 0.26);
      beep(t + 0.3, 660, 0.3, 0.26);
      break;
    // Three flat, urgent beeps. Deliberately unlike anything else, because
    // acting on it late means training one side and not the other.
    case "switch":
      beep(t, 1320, 0.1, 0.3);
      beep(t + 0.14, 1320, 0.1, 0.3);
      beep(t + 0.28, 1320, 0.16, 0.3);
      break;
    // Quiet: it marks a changeover starting, and the ready countdown is about
    // to speak for itself.
    case "next":
      beep(t, 587, 0.12, 0.16);
      break;
    case "finish":
      beep(t, 660, 0.16, 0.26);
      beep(t + 0.14, 880, 0.16, 0.26);
      beep(t + 0.28, 1320, 0.32, 0.28);
      break;
  }
}

export function playTone(tone: Tone): void {
  const c = context();
  if (!c) return;

  if (c.state === "suspended") {
    // Scheduling against a suspended clock puts every beep in the past, which
    // is the other half of the silent-warm-up bug: by the time the context
    // wakes, the tone it was told to play has already been and gone.
    void c
      .resume()
      .then(() => render(tone, c.currentTime))
      .catch(() => {});
    return;
  }

  render(tone, c.currentTime);
}

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Vibration is a nicety; never let it break a workout.
    }
  }
}

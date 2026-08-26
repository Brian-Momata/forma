"use client";

/**
 * The end-of-set tone.
 *
 * Synthesised rather than shipped as a file so it works offline with no asset
 * to fetch, and so it can be short and sharp enough to hear over music. The
 * design always pairs it with a visible burst, because plenty of people train
 * with the sound off (ENGINEERING.md §10).
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * iOS will not play audio until a user gesture has unlocked the context, so
 * this is called from the button that starts the workout. Without it the first
 * chime of every session is silent.
 */
export function primeAudio(): void {
  const c = context();
  if (c && c.state === "suspended") void c.resume();
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

export type Tone = "set-end" | "rest-end" | "finish" | "countdown";

export function playTone(tone: Tone): void {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const t = c.currentTime;
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
    case "finish":
      beep(t, 660, 0.16, 0.26);
      beep(t + 0.14, 880, 0.16, 0.26);
      beep(t + 0.28, 1320, 0.32, 0.28);
      break;
  }
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

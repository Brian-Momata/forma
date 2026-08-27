"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { InstallPill } from "@/components/install-prompt";
import { Display, Kicker, Loading, NumberedRows, PillButton, Screen } from "@/components/ui";
import { ImportError, importAll } from "@/db/repo";
import { useBootstrap, useBootstrapError } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

/** The three promises from the artboard, in the artboard's order. */
const POINTS = [
  "Six questions, then a week that fits your schedule",
  "Countdown timers for holds, tap-to-log for reps",
  "Every exercise swapped around your injuries",
];

/**
 * The first screen anyone sees — the artboard's `Welcome` state.
 *
 * It exists because the app used to drop a stranger straight into question one
 * of onboarding, which asks what they are training for before saying what it is
 * going to do with the answer. Six questions is a reasonable price for a plan;
 * it is not a reasonable price for finding out what the app is.
 *
 * Only reachable without a profile. Anyone who has one is on their way to Today
 * and does not need the pitch again.
 */
export default function WelcomePage() {
  const ready = useBootstrap();
  const { error, retry } = useBootstrapError();
  const router = useRouter();
  const profile = useApp((s) => s.profile);
  const refresh = useApp((s) => s.refresh);

  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && profile) router.replace("/");
  }, [ready, profile, router]);

  /**
   * The artboard's second action is "I already have an account". There are no
   * accounts — everything lives in this browser (ENGINEERING.md §5) — so the
   * honest reading of that slot is the one case it actually covers: a person
   * arriving on a new phone with the backup they exported from the old one.
   */
  const restore = async (file: File) => {
    setRestoreError(null);
    try {
      // Parsed, never cast: this is a stranger's bytes reaching the database,
      // and the database is someone's whole training history.
      await importAll(JSON.parse(await file.text()));
      await refresh();
      router.replace("/");
    } catch (err) {
      setRestoreError(
        err instanceof ImportError
          ? err.message
          : "That file is not valid JSON, so it could not be read."
      );
    }
  };

  if (!ready || profile) return <Loading error={error} onRetry={retry} />;

  return (
    <Screen>
      <WelcomeHero />

      <header className="relative flex shrink-0 items-center justify-between px-[22px] pt-[58px]">
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wdth" 118',
            fontSize: 19,
            fontWeight: 900,
            letterSpacing: "-.02em",
          }}
        >
          FORM<span className="text-acc">.</span>
        </div>
        <InstallPill />
      </header>

      {/* mt-auto rather than justify-end: both pin the block to the bottom, but
          an auto margin collapses to zero when the copy is taller than the space
          — justify-end would push the top of it out of reach on a short phone. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-[22px]">
        <div className="mt-auto">
          <Kicker tone="accent">Home, gym, or anywhere</Kicker>
          {/* The artboard forces the break after "properly," but its own 402px
              frame leaves 358px for a line that wants 425 — so the break it
              draws cannot happen at the size it draws it at. Balance instead:
              even lines with no orphan here, and the design's two lines as soon
              as the column is wide enough for them. */}
          <Display size="welcome" className="mt-[14px]" style={{ textWrap: "balance" }}>
            Train properly, wherever you are.
          </Display>
          <p className="mt-[14px] max-w-[300px] text-[14.5px] leading-[1.55] text-t3">
            A plan built around your goal, the space and equipment you have, and the
            joints you need to protect. Timed sets, honest rest, form cues on every move.
          </p>

          <NumberedRows items={POINTS} className="mt-[26px]" />
        </div>
      </div>

      <div
        className="relative shrink-0 px-[22px] pt-[22px]"
        style={{ paddingBottom: "max(34px, env(safe-area-inset-bottom))" }}
      >
        <PillButton className="w-full" onClick={() => router.push("/onboarding")}>
          Build my plan
        </PillButton>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so picking the same file twice still fires a change.
            e.target.value = "";
            if (file) void restore(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-4 block w-full py-1 text-center text-[13px] font-semibold text-t4 transition-colors hover:text-t1"
        >
          I already have a backup
        </button>

        {restoreError && (
          <p role="alert" className="mt-3 text-center text-[12.5px] leading-[1.5] text-warn">
            {restoreError}
          </p>
        )}
      </div>
    </Screen>
  );
}

/**
 * The top 62% of the artboard is a photograph behind a four-stop scrim. There
 * is no photograph yet — the canvas slot is still empty — so this draws the
 * same shape in the app's own language, the way `MediaWell` does for exercises
 * that ship no images. Swap the panel for an `<img>` when the art lands; the
 * scrim above it is already the design's, verbatim.
 */
function WelcomeHero() {
  return (
    <div aria-hidden className="absolute inset-x-0 top-0 h-[62%] overflow-hidden bg-media">
      <div
        className="absolute -right-24 -top-20 h-[420px] w-[420px] rounded-full"
        style={{
          background: "color-mix(in srgb, var(--acc) 22%, transparent)",
          filter: "blur(90px)",
          animation: "drift 9s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />
      <div
        className="absolute left-1/2 top-[46%] h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ border: "1px solid var(--acc)", opacity: 0.28 }}
      />
      <div
        className="absolute left-1/2 top-[46%] h-[196px] w-[196px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ border: "1px solid var(--acc)", opacity: 0.16 }}
      />

      {/* The design's scrim, stop for stop. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--color-screen) 72%, transparent) 0%, color-mix(in srgb, var(--color-screen) 10%, transparent) 32%, color-mix(in srgb, var(--color-screen) 86%, transparent) 78%, var(--color-screen) 100%)",
        }}
      />
    </div>
  );
}

"use client";

import {
  currentItem,
  elapsedSec,
  formatClock,
  isChiming,
  nextItem,
  phaseProgress,
  remainingSec,
  totalSets,
  type PlayerState,
} from "@form/core";

import { Display, Kicker, PillButton, ProgressBar, Screen, Segments, Sheet } from "@/components/ui";
import { MediaWell } from "@/components/ui/media";
import { useSession } from "@/store/session";

/* ---------------------------------------------------------------------------
 * Timer leaves.
 *
 * These subscribe to a derived integer, so they re-render when the displayed
 * second changes and the rest of the screen does not re-render at all. That is
 * the single most important performance rule in the app (ENGINEERING.md §11).
 * ------------------------------------------------------------------------- */

function useRemaining(): number | null {
  return useSession((s) => (s.player ? remainingSec(s.player, s.now) : null));
}

function useElapsed(): number {
  return useSession((s) => (s.player ? elapsedSec(s.player, s.now) : 0));
}

function useProgress(): number {
  return useSession((s) =>
    // Rounded so the bar updates in visible steps rather than on every tick.
    s.player ? Math.round(phaseProgress(s.player, s.now) * 200) / 200 : 0
  );
}

function useChiming(): boolean {
  return useSession((s) => (s.player ? isChiming(s.player, s.now) : false));
}

/* ------------------------------------------------------------------- shared */

/**
 * The expanding ring that marks the tone.
 *
 * Sized and placed per phase, following the design: it sits above the timer on
 * an active set and higher on the rest screen, where placing it low would put
 * it straight through the body copy.
 */
function ChimeRings({ tone }: { tone: "accent" | "rest" }) {
  const rest = tone === "rest";
  const size = rest ? 220 : 180;
  return (
    <>
      {[0, 0.16].map((delay) => (
        <div
          key={delay}
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full border-2"
          style={{
            width: size,
            height: size,
            ...(rest ? { top: "40%" } : { bottom: 64 }),
            borderColor: rest ? "var(--rest)" : "var(--acc)",
            animation: `chimeRing 1.1s ${delay}s ease-out forwards`,
          }}
        />
      ))}
    </>
  );
}

function setLabel(state: PlayerState): string {
  const item = currentItem(state);
  if (!item) return "";
  return `Set ${state.setIndex + 1} of ${item.sets}`;
}

function doseLabel(state: PlayerState): string {
  const item = currentItem(state);
  if (!item) return "";
  const dose = item.kind === "time" ? `${item.durationSec}s` : `${item.reps} reps`;
  return `${item.sets} × ${dose} · ${item.restSec > 0 ? `${item.restSec}s rest` : "no rest"}`;
}

/* -------------------------------------------------------------------- ready */

export function ReadyPhase({ state }: { state: PlayerState }) {
  const remaining = useRemaining();
  const item = currentItem(state);

  return (
    <Screen>
      <div className="relative flex flex-1 flex-col justify-center overflow-hidden px-[22px]">
        <div
          aria-hidden
          className="pointer-events-none absolute h-[420px] w-[420px] rounded-full"
          style={{
            background: "color-mix(in srgb, var(--acc) 12%, transparent)",
            filter: "blur(70px)",
            top: 120,
            left: -90,
            animation: "drift 7s ease-in-out infinite",
          }}
        />
        <div className="relative">
          <Kicker tone="accent">Get ready</Kicker>
          <Display
            size="ready"
            tabular
            className="-ml-3 mt-2"
            style={{ animation: "chimePop .45s ease-out" }}
          >
            {remaining ?? 0}
          </Display>
          <div className="my-[18px] mt-[22px] h-px bg-white/12" />
          <Display size="exercise" weight={800}>
            {item?.name ?? ""}
          </Display>
          <div className="mt-2 text-[13px] font-medium text-t3">{doseLabel(state)}</div>
        </div>
      </div>
    </Screen>
  );
}

/* ---------------------------------------------------------------------- set */

export function SetPhase({ state, onExit }: { state: PlayerState; onExit: () => void }) {
  const remaining = useRemaining();
  const elapsed = useElapsed();
  const progress = useProgress();
  const chiming = useChiming();

  const toggle = useSession((s) => s.toggle);
  const skip = useSession((s) => s.skip);
  const completeSet = useSession((s) => s.completeSet);

  const item = currentItem(state);
  if (!item) return null;

  const timed = item.kind === "time";
  const paused = state.pausedAt !== null;
  const done = state.records.filter((r) => !r.skipped).length;

  return (
    <Screen>
      <div className="flex items-center gap-3 px-5 pb-[14px] pt-[58px]">
        <button
          type="button"
          onClick={onExit}
          aria-label="End workout"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-hair-16 text-[14px] text-t2 transition-colors hover:border-t1 hover:text-t1"
        >
          ×
        </button>
        <Segments className="flex-1" total={totalSets(state)} filled={done} />
        <div
          className="shrink-0 text-t4"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wdth" 112',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: ".04em",
          }}
        >
          {String(state.exIndex + 1).padStart(2, "0")} /{" "}
          {String(state.items.length).padStart(2, "0")}
        </div>
      </div>

      <div className="relative h-[272px] shrink-0">
        <MediaWell
          images={item.images}
          name={item.name}
          paused={paused}
          className="h-full w-full"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg,rgba(8,9,11,.08) 0%,rgba(8,9,11,.42) 46%,rgba(8,9,11,.88) 78%,#08090B 100%)",
          }}
        />
        <div className="pointer-events-none absolute bottom-[14px] left-5 right-5 flex items-end justify-between gap-3">
          <Display size="exercise">{item.name}</Display>
          <div className="shrink-0 pb-1 text-[10.5px] font-bold uppercase tracking-[.14em] text-t2">
            {setLabel(state)}
          </div>
        </div>
      </div>

      <div className="px-5 pt-[14px]">
        {item.cues.slice(0, 2).map((cue, i) => (
          <div key={i} className="flex items-baseline gap-[11px] py-[7px]">
            <div
              className="shrink-0 text-acc"
              style={{
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"wdth" 112',
                fontSize: 10.5,
                fontWeight: 800,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="text-[13.5px] font-medium leading-[1.4] text-t2">{cue}</div>
          </div>
        ))}
      </div>

      <div className="relative flex flex-1 flex-col justify-end px-5 pb-[18px]">
        {chiming && <ChimeRings tone="accent" />}
        {chiming && (
          <div
            className="absolute right-5 px-[10px] py-[5px] text-[9.5px] font-extrabold uppercase tracking-[.16em]"
            style={{ bottom: 150, background: "var(--acc)", color: "var(--color-screen)" }}
          >
            Tone
          </div>
        )}

        <Kicker>{timed ? "Remaining" : `Target · ${formatClock(elapsed)} elapsed`}</Kicker>

        {timed ? (
          <Display size="timer" tabular className="-ml-[6px] mt-[6px]">
            {formatClock(remaining ?? 0)}
          </Display>
        ) : (
          <div className="-ml-[6px] mt-[6px] flex items-baseline gap-3">
            <Display size="timer" tabular>
              {item.reps}
            </Display>
            <div
              className="uppercase text-t5"
              style={{
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"wdth" 108',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-.02em",
              }}
            >
              reps
            </div>
          </div>
        )}

        {/* Announced sparingly: a screen reader reading every second is unusable. */}
        <div aria-live="polite" className="sr-only">
          {timed && remaining !== null && (remaining === 10 || remaining === 0)
            ? `${remaining} seconds remaining`
            : ""}
        </div>

        <ProgressBar value={progress} />
      </div>

      <div
        className="flex gap-[10px] border-t border-hair-08 bg-screen/85 px-5 pt-[14px] backdrop-blur-[18px]"
        style={{ paddingBottom: "max(30px, env(safe-area-inset-bottom))" }}
      >
        {timed ? (
          <PillButton className="h-[60px] flex-1" variant="outline" onClick={toggle}>
            {paused ? "Resume" : "Pause"}
          </PillButton>
        ) : (
          <PillButton className="h-[60px] flex-1" onClick={completeSet}>
            Set complete
          </PillButton>
        )}
        <PillButton className="h-[60px] w-[74px] shrink-0" variant="muted" onClick={skip}>
          Skip
        </PillButton>
      </div>
    </Screen>
  );
}

/* --------------------------------------------------------------------- rest */

export function RestPhase({ state, onExit }: { state: PlayerState; onExit: () => void }) {
  const remaining = useRemaining();
  const progress = useProgress();
  const chiming = useChiming();
  const skip = useSession((s) => s.skip);
  const addRest = useSession((s) => s.addRest);

  const item = currentItem(state);

  return (
    <Screen background="var(--color-rest-screen)">
      <div
        aria-hidden
        className="pointer-events-none absolute h-[520px] w-[520px] rounded-full"
        style={{
          background: "color-mix(in srgb, var(--rest) 20%, transparent)",
          filter: "blur(80px)",
          top: -120,
          left: -120,
          animation: "drift 9s ease-in-out infinite",
        }}
      />

      <div className="relative flex items-center justify-between px-5 pt-[58px]">
        <button
          type="button"
          onClick={onExit}
          aria-label="End workout"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/18 text-[14px] text-r1 transition-colors hover:text-white"
        >
          ×
        </button>
        <div
          className="text-r3"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wdth" 112',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: ".04em",
          }}
        >
          {String(state.exIndex + 1).padStart(2, "0")} /{" "}
          {String(state.items.length).padStart(2, "0")}
        </div>
      </div>

      <div className="relative flex flex-1 flex-col justify-center px-[22px]">
        {chiming && <ChimeRings tone="rest" />}
        <Kicker tone="rest">Rest</Kicker>
        <Display size="rest" tabular className="-ml-[10px] mt-[10px]">
          {formatClock(remaining ?? 0)}
        </Display>
        <div className="mt-[22px]">
          <ProgressBar value={progress} tone="rest" />
        </div>
        <p className="mt-5 max-w-[270px] text-[13.5px] font-medium leading-[1.55] text-r2">
          Breathe out slowly. Shake the legs loose and set up before the timer runs out.
        </p>
      </div>

      <Sheet background="rgba(9,8,26,.82)" grabber className="relative backdrop-blur-[20px]">
        <Kicker tone="rest">Next up</Kicker>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <Display size="upNext" weight={800}>
            {item?.name ?? ""}
          </Display>
          <div className="shrink-0 text-[12.5px] font-semibold text-r2">
            Set {state.setIndex + 1} of {item?.sets ?? 0}
          </div>
        </div>
        <div className="mt-[18px] flex gap-[10px]">
          <PillButton
            className="h-[56px] w-[96px] shrink-0"
            variant="outline"
            onClick={() => addRest(20)}
          >
            +20s
          </PillButton>
          <PillButton className="h-[56px] flex-1" variant="rest" onClick={skip}>
            Skip rest
          </PillButton>
        </div>
      </Sheet>
    </Screen>
  );
}

/* --------------------------------------------------------------- transition */

export function TransitionPhase({ state }: { state: PlayerState }) {
  const skip = useSession((s) => s.skip);
  const next = nextItem(state);
  const done = state.records.filter((r) => !r.skipped).length;

  return (
    <Screen>
      <div className="pt-[46px]" />
      <div
        className="flex flex-1 flex-col justify-between rounded-t-[22px] px-[22px] pb-[30px] pt-[26px]"
        style={{ background: "var(--acc)", color: "var(--color-screen)" }}
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[.24em] opacity-60">
              Exercise clear
            </div>
            <div
              className="opacity-60"
              style={{
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"wdth" 112',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {done} / {totalSets(state)} sets
            </div>
          </div>
          <div className="my-[22px] h-px" style={{ background: "rgba(8,9,11,.22)" }} />
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.24em] opacity-60">
            Next
          </div>
          <Display size="next" className="mt-[10px]">
            {next?.name ?? ""}
          </Display>
          <div
            className="mt-[14px] opacity-70"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wdth" 110',
              fontSize: 17,
              fontWeight: 800,
            }}
          >
            {next
              ? `${next.sets} × ${next.kind === "time" ? `${next.durationSec}s` : `${next.reps} reps`}`
              : ""}
          </div>
          <div className="my-[18px] mt-[22px] h-px" style={{ background: "rgba(8,9,11,.22)" }} />
          {next?.cues.slice(0, 2).map((cue, i) => (
            <div key={i} className="flex items-baseline gap-[11px] py-[6px]">
              <div
                className="shrink-0 opacity-50"
                style={{
                  fontFamily: "var(--font-display)",
                  fontVariationSettings: '"wdth" 112',
                  fontSize: 10.5,
                  fontWeight: 800,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="text-[14.5px] font-semibold leading-[1.45] opacity-85">{cue}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-[14px]">
          <PillButton className="h-[60px] flex-1" variant="dark" onClick={skip}>
            Start now
          </PillButton>
          <div
            aria-hidden
            className="h-[52px] w-[52px] shrink-0 rounded-full border-[3px]"
            style={{
              borderColor: "rgba(8,9,11,.22)",
              borderTopColor: "var(--color-screen)",
              animation: "sweep 1.4s linear infinite",
            }}
          />
        </div>
      </div>
    </Screen>
  );
}

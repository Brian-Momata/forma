"use client";

import { useEffect, useRef, useState } from "react";
import {
  currentItem,
  doseText,
  elapsedSec,
  formatClock,
  isChiming,
  nextItem,
  phaseDuration,
  phaseProgress,
  remainingSec,
  setSeconds,
  splitsSides,
  totalSets,
  type PlayerItem,
  type PlayerState,
  type Side,
} from "@form/core";

import { Display, Kicker, PillButton, ProgressBar, Screen, Segments, Sheet } from "@/components/ui";
import { MediaWell } from "@/components/ui/media";
import { useSession } from "@/store/session";

/* ---------------------------------------------------------------------------
 * Timer leaves.
 *
 * Each of these subscribes to one derived value and renders only itself, so the
 * ticking clock never re-renders the screen around it -- the media well, the
 * cues and the buttons render once per phase. This is the single most important
 * performance rule in the app (ENGINEERING.md §11), and it only works if the
 * hooks stay *inside* these leaves: calling them from a phase component makes
 * the whole phase re-render five times a second, which is what they are here to
 * prevent.
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

/** The big countdown. Re-renders once a second; nothing around it does. */
function CountdownDisplay({ size, className = "" }: { size: "timer" | "rest"; className?: string }) {
  const remaining = useRemaining();
  return (
    <Display size={size} tabular className={className}>
      {formatClock(remaining ?? 0)}
    </Display>
  );
}

function ReadyCountdown() {
  const remaining = useRemaining();
  return (
    <Display
      size="ready"
      tabular
      className="-ml-3 mt-2"
      style={{ animation: "chimePop .45s ease-out" }}
    >
      {remaining ?? 0}
    </Display>
  );
}

function ElapsedLabel({ tone }: { tone?: "accent" | "rest" }) {
  const elapsed = useElapsed();
  return <Kicker tone={tone}>{`Target · ${formatClock(elapsed)} elapsed`}</Kicker>;
}

function PhaseBar({ tone }: { tone?: "accent" | "rest" }) {
  const progress = useProgress();
  return <ProgressBar value={progress} tone={tone} label="Time in this phase" />;
}

/**
 * Spoken timer cues.
 *
 * Halfway, ten seconds, and the phase ending -- §10 asks for exactly these, and
 * announcing every second is unusable with a screen reader. The end is
 * announced as the *next* phase starting rather than at zero: the machine
 * advances within 200ms of a countdown hitting zero, so a message rendered at
 * zero unmounts before it can be read.
 */
function TimerAnnouncer({ phase, label }: { phase: string; label: string }) {
  const remaining = useRemaining();
  const total = useSession((s) => (s.player ? phaseDuration(s.player) : null));

  let message = "";
  if (remaining !== null && total !== null && total > 0) {
    const half = Math.round(total / 2);
    if (remaining === 10 && total > 25) message = "Ten seconds left";
    else if (remaining === half && total > 40) message = "Halfway";
  }

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {message}
      </div>
      {/* Announced once when the phase changes, which is when it matters. */}
      <div key={phase} aria-live="polite" className="sr-only">
        {label}
      </div>
    </>
  );
}

/**
 * What is on the bar.
 *
 * Only shown for movements that take external load. Logging it is what makes
 * load progression possible at all -- without a number, "add weight next week"
 * is advice the app has no way to act on.
 */
function WeightControl({ item, unit }: { item: PlayerItem; unit: "kg" | "lb" }) {
  const weightKg = useSession((s) => s.player?.weightKg ?? null);
  const setWeight = useSession((s) => s.setWeight);

  const toDisplay = (kg: number) => (unit === "lb" ? kg * 2.2046226 : kg);
  const step = unit === "lb" ? 1.1023113 : 0.5;

  const shown = weightKg === null ? null : Math.round(toDisplay(weightKg) * 2) / 2;

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="text-[10.5px] font-bold uppercase tracking-[.14em] text-t5">Weight</div>
      <div className="flex items-center gap-1 rounded-full border border-hair-12 px-1">
        <button
          type="button"
          aria-label="Less weight"
          onClick={() => setWeight(Math.max(0, (weightKg ?? 0) - step * 2))}
          className="h-8 w-8 text-[15px] text-t3 hover:text-acc"
        >
          −
        </button>
        <div className="min-w-[70px] text-center text-[13px] font-semibold tabular-nums text-t1">
          {shown === null ? `— ${unit}` : `${shown} ${unit}`}
        </div>
        <button
          type="button"
          aria-label="More weight"
          onClick={() => setWeight((weightKg ?? 0) + step * 2)}
          className="h-8 w-8 text-[15px] text-t3 hover:text-acc"
        >
          +
        </button>
      </div>
      {item.targetWeightKg !== null && weightKg !== item.targetWeightKg && (
        <button
          type="button"
          onClick={() => setWeight(item.targetWeightKg)}
          className="text-[11.5px] font-semibold text-t4 underline underline-offset-4 hover:text-acc"
        >
          Plan says {Math.round(toDisplay(item.targetWeightKg) * 2) / 2} {unit}
        </button>
      )}
    </div>
  );
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

/**
 * The visual half of the end-of-phase tone.
 *
 * §10: the tone always has a visual equivalent, because plenty of people train
 * with the sound off. The rings are animation and collapse to nothing under
 * `prefers-reduced-motion`, so the mark -- which is static -- is what actually
 * carries the guarantee, and both phases get one.
 *
 * It used to say "TONE". Nobody needs to be told a sound is playing while it is
 * playing; the mark is here for the people who cannot hear it, and a word they
 * have to read and discard is worse than a shape they can catch side-on.
 */
function ChimeBurst({ tone }: { tone: "accent" | "rest" }) {
  const chiming = useChiming();
  if (!chiming) return null;

  const rest = tone === "rest";
  return (
    <>
      <ChimeRings tone={tone} />
      <div
        aria-hidden
        className="absolute right-5 flex items-center gap-[5px]"
        style={{ bottom: rest ? undefined : 150, top: rest ? "22%" : undefined }}
      >
        {[10, 16, 22].map((h) => (
          <div
            key={h}
            style={{
              width: 4,
              height: h,
              background: rest ? "var(--rest)" : "var(--acc)",
            }}
          />
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- form guides */

/**
 * The step-by-step how-to.
 *
 * Two cues are a reminder, not a lesson, and the demo is two stills of a range
 * of motion -- it cannot show tempo, or breathing, or which part of the shape
 * is the part that protects you. So the steps carry the form and the cues stay
 * what they were: the two things to hold in your head mid-set.
 */
function StepList({
  steps,
  limit,
  tone = "default",
  className = "",
}: {
  steps: readonly string[];
  limit?: number;
  tone?: "default" | "invert";
  className?: string;
}) {
  if (steps.length === 0) return null;
  const shown = limit === undefined ? steps : steps.slice(0, limit);
  const invert = tone === "invert";

  return (
    <ol className={className}>
      {shown.map((step, i) => (
        <li key={i} className="flex items-baseline gap-[11px] py-[6px]">
          <div
            className={`shrink-0 ${invert ? "opacity-50" : "text-acc"}`}
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wdth" 112',
              fontSize: 10.5,
              fontWeight: 800,
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </div>
          <div
            className={
              invert
                ? "text-[14px] font-semibold leading-[1.45] opacity-85"
                : "text-[13.5px] font-medium leading-[1.45] text-t2"
            }
          >
            {step}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The full guide, on demand, without leaving the set.
 *
 * A real `<dialog>` for the same reason the exercise picker is one (§10): a
 * panel that covers the screen has to trap focus and close on Escape.
 */
function FormGuide({ item, onClose }: { item: PlayerItem; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialogRef.current;
    if (node && !node.open) node.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={`How to do ${item.name}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none bg-black/60 p-0 backdrop-blur-[2px] backdrop:bg-transparent"
    >
      {/* Tracks the phone column, not the viewport -- Screen uses the same width. */}
      <div className="mx-auto flex h-full w-full max-w-[520px] flex-col justify-end">
        <button type="button" aria-label="Close" className="flex-1 cursor-default" onClick={onClose} />

        <div
          className="flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[26px] border-t border-hair-12 bg-screen text-t1"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto mb-4 mt-[18px] h-[3px] w-[38px] shrink-0 rounded-full bg-white/22" />

          <div className="shrink-0 px-[22px] pb-3">
            <Kicker>How to do it</Kicker>
            <Display size="upNext" weight={800} className="mt-2">
              {item.name}
            </Display>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-4">
            {item.unilateral && (
              <p className="mb-3 text-[13px] font-semibold leading-[1.5] text-acc">
                One side at a time. Train the left and the right equally.
              </p>
            )}

            {item.images.length > 0 && (
              <MediaWell
                images={item.images}
                name={item.name}
                className="mb-4 h-[190px] w-full rounded-[14px]"
              />
            )}

            {item.steps.length > 0 ? (
              <StepList steps={item.steps} />
            ) : (
              <StepList steps={item.cues} />
            )}

            {item.steps.length > 0 && item.cues.length > 0 && (
              <>
                <div className="my-4 h-px bg-white/9" />
                <Kicker>Remember</Kicker>
                <div className="mt-2">
                  {item.cues.map((cue, i) => (
                    <div key={i} className="py-[5px] text-[13.5px] font-medium leading-[1.4] text-t2">
                      {cue}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="shrink-0 px-[22px] pt-2">
            <PillButton variant="outline" className="w-full" onClick={onClose}>
              Close
            </PillButton>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Which side is being trained, said plainly.
 *
 * The whole reason the switch phase exists: without this, a timed one-sided
 * movement ends whenever its clock does, and half of it never happened.
 */
function SideBadge({ side, className = "" }: { side: Side; className?: string }) {
  if (side === null) return null;
  return (
    <div
      className={`inline-flex items-center px-[10px] py-[5px] text-[10.5px] font-extrabold uppercase tracking-[.16em] ${className}`}
      style={{ background: "var(--acc)", color: "var(--color-screen)" }}
    >
      {side} side
    </div>
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
  return `${item.sets} × ${doseText(item)} · ${item.restSec > 0 ? `${item.restSec}s rest` : "no rest"}`;
}

/* -------------------------------------------------------------------- ready */

export function ReadyPhase({ state }: { state: PlayerState }) {
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
          <ReadyCountdown />
          <div className="my-[18px] mt-[22px] h-px bg-white/12" />
          <Display size="exercise" weight={800}>
            {item?.name ?? ""}
          </Display>
          <div className="mt-2 text-[13px] font-medium text-t3">{doseLabel(state)}</div>
          {item?.unilateral && (
            <div className="mt-3 text-[13px] font-semibold text-acc">
              One side at a time — starting on the left.
            </div>
          )}
          {/* Two, not more: the get-ready is three seconds and the numeral above
              it is 210px. The first movement of a session has no changeover
              screen before it, so this is its only chance at a how-to. */}
          <StepList steps={item?.steps ?? []} limit={2} className="mt-4" />
        </div>
      </div>
    </Screen>
  );
}

/* ---------------------------------------------------------------------- set */

export function SetPhase({
  state,
  onExit,
  units,
}: {
  state: PlayerState;
  onExit: () => void;
  units: "kg" | "lb";
}) {
  const toggle = useSession((s) => s.toggle);
  const skip = useSession((s) => s.skip);
  const completeSet = useSession((s) => s.completeSet);
  const [guideOpen, setGuideOpen] = useState(false);

  const item = currentItem(state);
  if (!item) return null;

  const timed = item.kind === "time";
  const paused = state.pausedAt !== null;
  const done = state.records.filter((r) => !r.skipped).length;
  const split = splitsSides(item);

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
        <Segments
          className="flex-1"
          total={totalSets(state)}
          filled={done}
          label={`${done} of ${totalSets(state)} sets done`}
        />
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
          <div className="min-w-0">
            <SideBadge side={state.side} className="mb-[6px]" />
            <Display size="exercise">{item.name}</Display>
          </div>
          <div className="shrink-0 pb-1 text-right text-[10.5px] font-bold uppercase tracking-[.14em] text-t2">
            {setLabel(state)}
            {/* A rep set is not split by the clock, so the count has to say so
                itself -- ten one-arm rows means ten each way. */}
            {item.unilateral && !split && <div className="mt-1 text-acc">Each side</div>}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 px-5 pt-[14px]">
        <div className="min-w-0 flex-1">
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
        {(item.steps.length > 0 || item.cues.length > 2) && (
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="mt-1 shrink-0 rounded-full border border-hair-16 px-[13px] py-[9px] text-[11.5px] font-semibold text-t3 transition-colors hover:border-acc hover:text-acc"
          >
            Form guide
          </button>
        )}
      </div>

      {guideOpen && <FormGuide item={item} onClose={() => setGuideOpen(false)} />}

      <div className="relative flex flex-1 flex-col justify-end px-5 pb-[18px]">
        <ChimeBurst tone="accent" />

        <TimerAnnouncer
          phase={`${state.exIndex}-${state.setIndex}-set-${state.side ?? "both"}`}
          label={
            `${item.name}, set ${state.setIndex + 1} of ${item.sets}` +
            (state.side ? `, ${state.side} side` : item.unilateral ? ", each side" : "")
          }
        />

        {timed ? <Kicker>Remaining</Kicker> : <ElapsedLabel />}

        {timed ? (
          <CountdownDisplay size="timer" className="-ml-[6px] mt-[6px]" />
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
              {item.unilateral ? "reps each side" : "reps"}
            </div>
          </div>
        )}

        {item.loadable && <WeightControl item={item} unit={units} />}

        <PhaseBar />
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
          <>
            <PillButton className="h-[60px] flex-1" onClick={completeSet}>
              Set complete
            </PillButton>
            {/* A rep set can be interrupted just as easily as a timed one, and
                the clock keeps running either way. */}
            <PillButton
              className="h-[60px] w-[64px] shrink-0"
              variant="outline"
              aria-label={paused ? "Resume" : "Pause"}
              onClick={toggle}
            >
              {paused ? "▶" : "❚❚"}
            </PillButton>
          </>
        )}
        <PillButton className="h-[60px] w-[74px] shrink-0" variant="muted" onClick={skip}>
          Skip
        </PillButton>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------------- switch */

/**
 * Change sides.
 *
 * The screen the whole `unilateral` flag exists for. A timed one-sided
 * movement used to run its clock once and move the session on, so whichever
 * side you did not start on never got trained. Now the clock runs once per
 * side with this in between, and it is deliberately the loudest screen in the
 * app: a five second beat, a full-bleed colour change, and the only tone that
 * sounds like nothing else.
 */
export function SwitchPhase({ state }: { state: PlayerState }) {
  const skip = useSession((s) => s.skip);
  const item = currentItem(state);

  return (
    <Screen>
      <div className="pt-[46px]" />
      <div
        className="flex flex-1 flex-col rounded-t-[22px] px-[22px] pb-[30px] pt-[26px]"
        style={{ background: "var(--acc)", color: "var(--color-screen)" }}
      >
        <div className="flex flex-1 flex-col justify-center">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.24em] opacity-60">
            Left side clear
          </div>
          <Display size="next" className="mt-[10px]">
            Switch sides
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
            {item?.name ?? ""} — {setSeconds(item)}s on the right
          </div>
          <div className="my-[22px] h-px" style={{ background: "rgba(8,9,11,.22)" }} />
          <SwitchCountdown />
          {item && item.cues.length > 0 && (
            <div className="mt-[22px] max-w-[300px] text-[14px] font-semibold leading-[1.5] opacity-75">
              {item.cues[0]}
            </div>
          )}
          <TimerAnnouncer
            phase={`${state.exIndex}-${state.setIndex}-switch`}
            label={`Switch sides. Now the right side of ${item?.name ?? "this movement"}.`}
          />
        </div>

        <PillButton className="h-[60px] w-full shrink-0" variant="dark" onClick={skip}>
          Start the right side
        </PillButton>
      </div>
    </Screen>
  );
}

function ChangeoverCountdown() {
  const remaining = useRemaining();
  if (remaining === null) {
    return (
      <div
        aria-hidden
        className="h-[52px] w-[52px] shrink-0 rounded-full border-[3px]"
        style={{
          borderColor: "rgba(8,9,11,.22)",
          borderTopColor: "var(--color-screen)",
          animation: "sweep 1.4s linear infinite",
        }}
      />
    );
  }
  return (
    <div
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[3px] tabular-nums"
      style={{ borderColor: "rgba(8,9,11,.22)", fontSize: 17, fontWeight: 800 }}
    >
      {remaining}
    </div>
  );
}

function SwitchCountdown() {
  const remaining = useRemaining();
  return (
    <div className="flex items-baseline gap-3">
      <Display size="timer" tabular>
        {remaining ?? 0}
      </Display>
      <div
        className="uppercase opacity-60"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wdth" 108',
          fontSize: 20,
          fontWeight: 800,
        }}
      >
        seconds
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- rest */

export function RestPhase({ state, onExit }: { state: PlayerState; onExit: () => void }) {
  const skip = useSession((s) => s.skip);
  const addRest = useSession((s) => s.addRest);
  const toggle = useSession((s) => s.toggle);

  const item = currentItem(state);
  const paused = state.pausedAt !== null;

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
        <ChimeBurst tone="rest" />
        <TimerAnnouncer
          phase={`${state.exIndex}-${state.setIndex}-rest`}
          label={`Rest. Next up ${item?.name ?? ""}, set ${state.setIndex + 1} of ${item?.sets ?? 0}`}
        />
        <Kicker tone="rest">Rest</Kicker>
        <CountdownDisplay size="rest" className="-ml-[10px] mt-[10px]" />
        <div className="mt-[22px]">
          <PhaseBar tone="rest" />
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
            className="h-[56px] w-[86px] shrink-0"
            variant="outline"
            onClick={() => addRest(20)}
          >
            +20s
          </PillButton>
          {/* Rest is exactly when a phone call arrives. */}
          <PillButton
            className="h-[56px] w-[64px] shrink-0"
            variant="outline"
            aria-label={paused ? "Resume" : "Pause"}
            onClick={toggle}
          >
            {paused ? "▶" : "❚❚"}
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
              Exercise clear · changeover
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
            {next ? `${next.sets} × ${doseText(next)}` : ""}
          </div>
          {next?.unilateral && (
            <div className="mt-[10px] text-[13px] font-bold uppercase tracking-[.14em] opacity-70">
              One side at a time
            </div>
          )}
          <div className="my-[18px] mt-[22px] h-px" style={{ background: "rgba(8,9,11,.22)" }} />
          {/* The changeover is the one moment in a session with nothing to do
              and a whole screen free, so it is where the how-to belongs. */}
          {next && next.steps.length > 0 ? (
            <StepList steps={next.steps} limit={4} tone="invert" />
          ) : (
            next?.cues.slice(0, 2).map((cue, i) => (
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
            ))
          )}
        </div>

        <div className="flex items-center gap-[14px]">
          <PillButton className="h-[60px] flex-1" variant="dark" onClick={skip}>
            Start now
          </PillButton>
          {/* A changeover can now be half a minute, so it counts down rather
              than spinning: a spinner cannot tell you whether to sit down. */}
          <ChangeoverCountdown />
        </div>
      </div>
    </Screen>
  );
}

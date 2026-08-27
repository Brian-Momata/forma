"use client";

import { useEffect, useRef, useState } from "react";

import { Display, Kicker, NumberedRows, PillButton } from "@/components/ui";
import { useInstall } from "@/lib/use-install";

/**
 * Putting FORM on the home screen: the sheet that makes the case, and the two
 * places that open it.
 *
 * The artboard's `Install prompt` state is a bottom sheet raised from the
 * Welcome header, never an interruption -- so the sheet here is only ever
 * opened by a tap. The snooze logic that decides whether to *offer* it at all
 * lives in `lib/install.ts` and is unchanged: one dismissal buys a month, a
 * second retires the card, and the You screen keeps the offer reachable after
 * that.
 */

/* ------------------------------------------------------------------- sheet */

/**
 * The design's install sheet, adapted to what each platform can actually do.
 *
 * Chromium hands us a prompt to fire, so the accent pill fires it and the rows
 * say why it is worth a tap. iOS has no such API -- every browser there installs
 * through the Share menu (`addsByHand`) -- so the rows become the two taps and
 * the pill only acknowledges them. An "Add to home screen" button that cannot
 * add anything is the one thing this sheet must not be.
 */
export function InstallSheet({ onClose }: { onClose(): void }) {
  const { byHand, install, dismiss } = useInstall();

  // A2: a sheet that looks modal has to behave modally. `<dialog>` brings the
  // focus trap, Escape and an inert background with it -- see ExerciseSheet.
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialogRef.current;
    if (node && !node.open) node.showModal();
  }, []);

  const rows = byHand
    ? [
        <>
          Tap the <ShareGlyph /> Share button in the browser toolbar
        </>,
        <>
          Choose <strong className="font-semibold">Add to Home Screen</strong>, then Add
        </>,
      ]
    : [
        "Opens full screen, with no browser bar",
        "Timers keep running with no signal",
        "Starts on the screen you left",
      ];

  return (
    <dialog
      ref={dialogRef}
      aria-label="Put FORM on your home screen"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none bg-app/62 p-0 backdrop-blur-[10px] backdrop:bg-transparent"
    >
      {/* The sheet tracks the phone column, not the viewport: on a wide screen
          the app is a centred 520px column. Screen uses the same max width. */}
      <div className="mx-auto flex h-full w-full max-w-[520px] flex-col justify-end">
        <button type="button" aria-label="Close" className="flex-1 cursor-default" onClick={onClose} />

        <div
          className="rounded-t-[22px] border-t border-hair-12 bg-bar px-[22px] pt-[10px] text-t1"
          style={{
            paddingBottom: "max(34px, env(safe-area-inset-bottom))",
            animation: "riseIn .28s cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <div className="mx-auto mb-[22px] h-1 w-[38px] rounded-full bg-white/16" />

          <div className="flex items-center gap-[14px]">
            <AppMark />
            <Display size="upNext" className="min-w-0 flex-1">
              Put FORM on your home screen
            </Display>
          </div>

          <p className="mt-[14px] text-[13.5px] leading-[1.55] text-t3">
            {byHand
              ? "Full screen, no browser bar, and your timers keep running offline. Takes about five seconds."
              : "Takes about five seconds, and it comes off again like any other app."}
          </p>

          <NumberedRows items={rows} className="mt-5" />

          {byHand ? (
            <PillButton
              className="mt-[22px] w-full"
              onClick={() => {
                // They have been shown the two taps. Asking again next launch
                // is the nag `lib/install.ts` exists to prevent -- and iOS
                // never tells us whether they went through with it.
                void dismiss();
                onClose();
              }}
            >
              Got it
            </PillButton>
          ) : (
            <>
              <PillButton
                className="mt-[22px] w-full"
                onClick={() => {
                  void install();
                  onClose();
                }}
              >
                Add to home screen
              </PillButton>
              <button
                type="button"
                onClick={() => {
                  void dismiss();
                  onClose();
                }}
                className="mt-[15px] block w-full py-1 text-center text-[13px] font-semibold text-t4 transition-colors hover:text-t1"
              >
                Not now
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** The lime app tile from the artboard — the icon, before there is an icon. */
function AppMark() {
  return (
    <div
      aria-hidden
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-acc text-screen"
      style={{
        fontFamily: "var(--font-display)",
        fontVariationSettings: '"wdth" 118',
        fontSize: 19,
        fontWeight: 900,
        letterSpacing: "-.03em",
      }}
    >
      F<span className="opacity-45">.</span>
    </div>
  );
}

/* ------------------------------------------------------------- entry points */

/**
 * The unprompted offer on the Today screen.
 *
 * Not on the artboard: the design raises the sheet from the Welcome header, and
 * someone who is already using the app never passes through Welcome again. So
 * this is the quiet way back to it — placed below the primary action, where it
 * can never come between someone and starting a workout.
 */
export function InstallPrompt() {
  const { offer, dismiss } = useInstall();
  const [open, setOpen] = useState(false);

  if (!offer) return null;

  return (
    <>
      <section
        aria-labelledby="install-title"
        className="mx-[22px] mt-7 border border-hair-12 px-[18px] pb-[18px] pt-[14px]"
      >
        <div className="flex items-start justify-between gap-3">
          <Kicker tone="accent" className="pt-[10px]">
            Install
          </Kicker>
          <button
            type="button"
            onClick={() => void dismiss()}
            aria-label="Not now"
            className="-mr-[10px] -mt-[6px] flex h-11 w-11 shrink-0 items-center justify-center text-[18px] leading-none text-t5 transition-colors hover:text-t1"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>

        <h2 id="install-title" className="mt-[6px] text-[16px] font-semibold tracking-[-.012em]">
          Keep FORM on your home screen
        </h2>
        <p className="mt-[6px] text-[12.5px] leading-[1.55] text-t4">
          It opens full screen, starts where you left off, and runs with no signal — which
          is what most gyms have.
        </p>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-[14px] flex h-11 w-full items-center justify-center rounded-full bg-acc px-5 text-[12.5px] font-bold text-screen transition-[filter] hover:brightness-110"
        >
          Install
        </button>
      </section>

      {open && <InstallSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The same offer on the You screen, with no snooze in front of it.
 *
 * This is what makes dismissing the card safe: saying "not now" twice puts the
 * app out of reach otherwise, and someone who changes their mind in a car park
 * with no signal has no way back to it.
 */
export function InstallSetting() {
  const { possible } = useInstall();
  const [open, setOpen] = useState(false);

  if (!possible) return null;

  return (
    <>
      <Kicker className="px-[22px] pb-1 pt-8">Home screen</Kicker>
      <p className="px-[22px] pb-3 text-[12px] leading-[1.5] text-t5">
        FORM is not on your home screen yet. Installed, it opens full screen and runs
        with no signal — which is what most gyms have.
      </p>
      <div className="px-[22px]">
        <PillButton variant="outline" className="w-full" onClick={() => setOpen(true)}>
          Install FORM
        </PillButton>
      </div>

      {open && <InstallSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The pill in the Welcome header, straight off the artboard.
 *
 * Renders nothing when there is nothing to offer, which is why Welcome does not
 * need to know anything about installability itself.
 */
export function InstallPill() {
  const { possible } = useInstall();
  const [open, setOpen] = useState(false);

  if (!possible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-[7px] rounded-full border border-hair-18 bg-screen/50 px-3 py-[7px] text-[11px] font-bold uppercase tracking-[.1em] text-t1 backdrop-blur-[14px] transition-colors hover:border-acc hover:text-acc"
      >
        <span
          aria-hidden
          className="h-[5px] w-[5px] rounded-full bg-acc"
          style={{ boxShadow: "0 0 10px var(--acc)" }}
        />
        Install
      </button>

      {open && <InstallSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** iOS's share mark, because "tap Share" is a picture on that platform. */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-[-1px]"
      aria-hidden
    >
      <path d="M12 14V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

"use client";

import { Kicker, PillButton } from "@/components/ui";
import { useInstall } from "@/lib/use-install";

/**
 * Asks the people who have not installed the app to install it.
 *
 * Worth asking at all because the pitch is the product: installed, FORM opens
 * full screen and runs with no signal, which is the state most gyms are in.
 *
 * Two rules keep it from becoming a nag. It never appears for anyone already
 * running from a home screen -- there is nothing to ask them for -- and it
 * takes no for an answer: one dismissal snoozes it for a month, a second
 * retires it, and after that the offer only exists on the You screen where
 * someone would go looking (`lib/install.ts`).
 *
 * Not on the artboard: it is an addition to the Today screen rather than a
 * component of it (ENGINEERING.md §7), deliberately placed below the primary
 * action so it can never come between someone and starting a workout.
 */
export function InstallPrompt() {
  const { offer, byHand, install, dismiss } = useInstall();

  if (!offer) return null;

  return (
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

      {byHand ? (
        <p className="mt-[14px] text-[12.5px] leading-[1.55] text-t2">
          Tap <ShareGlyph /> Share, then <strong className="font-semibold">Add to Home Screen</strong>.
        </p>
      ) : (
        <div className="mt-[14px] flex gap-2">
          <button
            type="button"
            onClick={() => void install()}
            className="flex h-11 flex-1 items-center justify-center rounded-full px-5 text-[12.5px] font-bold transition-[filter] hover:brightness-110"
            style={{ background: "var(--acc)", color: "var(--color-screen)" }}
          >
            Install
          </button>
          <button
            type="button"
            onClick={() => void dismiss()}
            className="flex h-11 items-center justify-center rounded-full border border-hair-14 px-5 text-[12.5px] font-semibold text-t3 transition-colors hover:border-acc hover:text-acc"
          >
            Not now
          </button>
        </div>
      )}
    </section>
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
  const { possible, byHand, install } = useInstall();

  if (!possible) return null;

  return (
    <>
      <Kicker className="px-[22px] pb-1 pt-8">Home screen</Kicker>
      <p className="px-[22px] pb-3 text-[12px] leading-[1.5] text-t5">
        FORM is not on your home screen yet. Installed, it opens full screen and runs
        with no signal — which is what most gyms have.
      </p>
      {byHand ? (
        <p className="px-[22px] text-[12.5px] leading-[1.55] text-t2">
          Tap <ShareGlyph /> Share, then{" "}
          <strong className="font-semibold">Add to Home Screen</strong>.
        </p>
      ) : (
        <div className="px-[22px]">
          <PillButton variant="outline" className="w-full" onClick={() => void install()}>
            Install FORM
          </PillButton>
        </div>
      )}
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

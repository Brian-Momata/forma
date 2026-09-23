"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/**
 * Design-system primitives, built to `Home Workout v2.dc.html`.
 *
 * The design's raw px values live here and nowhere else, so components compose
 * from a named scale rather than sprinkling magic numbers (ENGINEERING.md §7).
 */

/* ------------------------------------------------------------------ display */

/** The Archivo display scale, straight off the artboard. */
const DISPLAY = {
  ready: { fontSize: 210, letterSpacing: "-.08em", lineHeight: 0.82, wdth: 118 },
  rest: { fontSize: 158, letterSpacing: "-.075em", lineHeight: 0.84, wdth: 118 },
  timer: { fontSize: 118, letterSpacing: "-.06em", lineHeight: 0.86, wdth: 118 },
  done: { fontSize: 92, letterSpacing: "-.065em", lineHeight: 0.86, wdth: 110 },
  date: { fontSize: 62, letterSpacing: "-.055em", lineHeight: 0.9, wdth: 118 },
  next: { fontSize: 52, letterSpacing: "-.05em", lineHeight: 0.94, wdth: 104 },
  welcome: { fontSize: 46, letterSpacing: "-.05em", lineHeight: 0.95, wdth: 106 },
  hero: { fontSize: 40, letterSpacing: "-.045em", lineHeight: 0.98, wdth: 108 },
  title: { fontSize: 36, letterSpacing: "-.04em", lineHeight: 1, wdth: 108 },
  step: { fontSize: 34, letterSpacing: "-.035em", lineHeight: 1.05, wdth: 108 },
  exercise: { fontSize: 30, letterSpacing: "-.04em", lineHeight: 1, wdth: 106 },
  stat: { fontSize: 34, letterSpacing: "-.04em", lineHeight: 1, wdth: 114 },
  metric: { fontSize: 26, letterSpacing: "-.03em", lineHeight: 1, wdth: 112 },
  upNext: { fontSize: 24, letterSpacing: "-.035em", lineHeight: 1, wdth: 106 },
} as const;

export type DisplaySize = keyof typeof DISPLAY;

/**
 * How much room a numeral is allowed to take when the screen is smaller than
 * the artboard.
 *
 * `chars` is how many glyphs have to fit side by side; `maxVh` is the share of
 * a short screen the numeral may claim before the controls under it start
 * going over the edge.
 */
export interface DisplayFit {
  chars: number;
  maxVh: number;
}

/**
 * The design's px size, or whatever of it the screen can actually hold.
 *
 * Archivo's tabular figures at these width axes run about 0.6em each, inside
 * the screen's 22px gutters. Capped at the design size, so the phone the
 * artboard was drawn for renders exactly as drawn.
 */
function fitted(px: number, fit: DisplayFit): string {
  return `min(${px}px, calc((100vw - 34px) / ${(fit.chars * 0.6).toFixed(2)}), ${fit.maxVh}vh)`;
}

export function Display({
  size,
  children,
  className = "",
  tabular = false,
  weight = 900,
  fit,
  style,
}: {
  size: DisplaySize;
  children: ReactNode;
  className?: string;
  tabular?: boolean;
  weight?: 800 | 900;
  /**
   * Shrink to fit a screen narrower or shorter than the artboard, rather than
   * running off it. The player's numerals are the only things big enough to
   * need this.
   */
  fit?: DisplayFit;
  style?: CSSProperties;
}) {
  const d = DISPLAY[size];
  return (
    <div
      className={className}
      style={{
        fontFamily: "var(--font-display)",
        fontVariationSettings: `"wdth" ${d.wdth}`,
        fontWeight: weight,
        fontSize: fit ? fitted(d.fontSize, fit) : d.fontSize,
        letterSpacing: d.letterSpacing,
        lineHeight: d.lineHeight,
        fontVariantNumeric: tabular ? "tabular-nums" : undefined,
        textWrap: "pretty",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The small uppercase label used above almost every block in the design. */
export function Kicker({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "rest" | "bright";
  className?: string;
}) {
  const color =
    tone === "accent"
      ? "var(--acc)"
      : tone === "rest"
        ? "var(--rest)"
        : tone === "bright"
          ? "var(--color-t2)"
          : "var(--color-t5)";
  return (
    <div
      className={className}
      style={{
        fontSize: 10.5,
        letterSpacing: ".2em",
        textTransform: "uppercase",
        fontWeight: 600,
        color,
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ buttons */

export function PillButton({
  children,
  onClick,
  variant = "accent",
  disabled = false,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "accent" | "outline" | "rest" | "dark" | "muted";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const base =
    "h-[58px] rounded-full flex items-center justify-center cursor-pointer select-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-6";
  const styles: Record<string, string> = {
    accent: "bg-acc text-screen hover:brightness-110",
    rest: "bg-rest text-[#0A081F] hover:brightness-110",
    outline: "border border-hair-18 text-t1 hover:border-acc hover:text-acc",
    dark: "bg-screen text-acc hover:bg-[#16181D]",
    muted: "bg-white/7 text-t3 hover:bg-white/12 hover:text-t1",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles[variant]} ${className}`}
      style={{
        fontFamily: "var(--font-display)",
        fontVariationSettings: '"wdth" 110',
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: ".02em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- list rows */

/**
 * The design's numbered rows -- accent numeral, hairline between, one line of
 * copy. It appears twice on the artboard, on Welcome and inside the install
 * sheet, with identical treatment, so it lives here rather than in either.
 *
 * An ordered list rather than divs: the numerals are decoration over real
 * sequence, and `01 02 03` read aloud between every label is noise.
 */
export function NumberedRows({
  items,
  className = "",
}: {
  items: readonly ReactNode[];
  className?: string;
}) {
  return (
    <ol className={`border-t border-hair-09 ${className}`}>
      {items.map((label, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-b border-hair-07 py-[13px]"
        >
          <span
            aria-hidden
            className="w-5 shrink-0 text-acc"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wdth" 112',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="flex-1 text-[14px] font-medium leading-[1.45] tracking-[-.005em] text-t2-bright">
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------------------------------------- progress */

/** The segmented bar used for onboarding steps and set progress. */
export function Segments({
  total,
  filled,
  tone = "accent",
  className = "",
  label,
}: {
  total: number;
  filled: number;
  tone?: "accent" | "rest";
  className?: string;
  /** What is being counted, so a screen reader gets more than bare divs. */
  label?: string;
}) {
  return (
    <div
      className={`flex gap-[3px] ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, total)}
      aria-valuenow={Math.max(0, Math.min(total, filled))}
      aria-label={label ?? `${filled} of ${total}`}
    >
      {Array.from({ length: Math.max(0, total) }, (_, i) => (
        <div key={i} className="relative h-[2px] flex-1 bg-white/13">
          {i < filled && (
            <div
              className="absolute inset-0"
              style={{ background: tone === "rest" ? "var(--rest)" : "var(--acc)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "accent",
  label,
}: {
  value: number;
  tone?: "accent" | "rest";
  label?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className="relative mt-[18px] h-[3px] w-full bg-white/12"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label ?? "Progress"}
    >
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-linear"
        style={{ width: `${pct}%`, background: tone === "rest" ? "var(--rest)" : "var(--acc)" }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- shell */

/** A full-height phone screen with the design's safe-area padding. */
export function Screen({
  children,
  background = "var(--color-screen)",
  className = "",
}: {
  children: ReactNode;
  background?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative mx-auto flex h-[100dvh] w-full max-w-[520px] flex-col overflow-hidden ${className}`}
      style={{ background }}
    >
      {children}
    </div>
  );
}

/**
 * Scrollable body between a fixed header and footer.
 *
 * `min-h-0` is load-bearing: a flex child's minimum size is its content, so
 * without it this box grows past the screen instead of scrolling, and its rows
 * end up drawn underneath the footer where they cannot be tapped. That is how
 * the last option on an onboarding step became unclickable in landscape.
 */
export function ScrollArea({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${className}`}>
      {children}
    </div>
  );
}

/** The frosted bar pinned to the bottom of most screens. */
export function FooterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border-t border-hair-08 bg-screen/85 backdrop-blur-[18px] ${className}`}
      style={{ paddingBottom: "max(30px, env(safe-area-inset-bottom))" }}
    >
      {children}
    </div>
  );
}

/** The rounded sheet used on Rest, Transition and Complete. */
export function Sheet({
  children,
  background = "var(--color-screen)",
  className = "",
  grabber = false,
}: {
  children: ReactNode;
  background?: string;
  className?: string;
  grabber?: boolean;
}) {
  return (
    <div
      className={`rounded-t-[26px] border-t border-hair-12 px-[22px] pt-[18px] ${className}`}
      style={{ background, paddingBottom: "max(30px, env(safe-area-inset-bottom))" }}
    >
      {grabber && <div className="mx-auto mb-4 h-[3px] w-[38px] rounded-full bg-white/22" />}
      {children}
    </div>
  );
}

export function Hairline({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-white/9 ${className}`} />;
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <div
      className="border border-hair-14 px-[10px] py-[6px] text-t2"
      style={{
        fontSize: 10.5,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}


/* ------------------------------------------------------------------- states */

/**
 * Data is on its way -- or it failed and is not coming.
 *
 * The failure branch matters: bootstrap can genuinely fail offline, and a
 * spinner that never resolves is the worst way to say so.
 */
export function Loading({
  message = "Loading…",
  error,
  onRetry,
}: {
  message?: string;
  error?: string | null;
  onRetry?: () => void;
}) {
  if (error) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col justify-center px-[22px]">
          <Display size="title">Not loaded</Display>
          <p className="mt-3 text-[14px] leading-relaxed text-t3">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-8 flex h-[58px] items-center justify-center rounded-full text-[15px] font-bold"
              style={{ background: "var(--acc)", color: "var(--color-screen)" }}
            >
              Try again
            </button>
          )}
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="text-[13px] text-t4">{message}</div>
      </div>
    </Screen>
  );
}

/**
 * The thing you asked for is not here.
 *
 * Worth its own component because collapsing it into the loading state is what
 * turned a deleted plan's bookmark into a screen that spins forever with no way
 * out -- the tab bar is not rendered on these routes either.
 */
export function NotFound({
  title,
  body,
  href,
  label,
}: {
  title: string;
  body: string;
  href: string;
  label: string;
}) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center px-[22px]">
        <Display size="title">{title}</Display>
        <p className="mt-3 text-[14px] leading-relaxed text-t3">{body}</p>
        <Link
          href={href}
          className="mt-8 flex h-[58px] items-center justify-center rounded-full text-[15px] font-bold"
          style={{ background: "var(--acc)", color: "var(--color-screen)" }}
        >
          {label}
        </Link>
      </div>
    </Screen>
  );
}

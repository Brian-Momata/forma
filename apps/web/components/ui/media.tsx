"use client";

import { useEffect, useState } from "react";
import { imageUrl } from "@form/core";

/**
 * The demo slot from the design.
 *
 * The source dataset ships two frames per exercise -- the start and end of the
 * movement -- so cross-fading them gives a convincing loop for free, without
 * shipping video. Hand-authored exercises have no photos, and fall back to a
 * cue-forward panel rather than an empty box.
 */
export function MediaWell({
  images,
  name,
  className = "",
  paused = false,
}: {
  images: readonly string[];
  name: string;
  className?: string;
  paused?: boolean;
}) {
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);

  // A failure belongs to one exercise's photos, not to the component. Without
  // this, the first image that times out on gym wifi blanked the demo for every
  // exercise after it, because the well keeps its place in the tree all session.
  //
  // Adjusted during render rather than in an effect: this is state derived from
  // a prop change, and an effect would paint the stale frame first.
  const key = images.join("|");
  const [shownKey, setShownKey] = useState(key);
  if (key !== shownKey) {
    setShownKey(key);
    setFailed(false);
    setFrame(0);
  }

  const usable = failed ? [] : images.slice(0, 2);

  useEffect(() => {
    if (paused || usable.length < 2) return;
    const id = window.setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 1200);
    return () => window.clearInterval(id);
  }, [paused, usable.length]);

  if (usable.length === 0) {
    // Hand-authored exercises ship no photos. Rather than an empty box -- or a
    // duplicate of the cues the screen already renders below -- show a quiet
    // geometric panel in the design's own language.
    return (
      <div
        className={`relative overflow-hidden bg-media ${className}`}
        role="img"
        aria-label={`${name} (no demo image)`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-56 w-56 rounded-full"
          style={{
            background: "color-mix(in srgb, var(--acc) 10%, transparent)",
            filter: "blur(52px)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2"
          style={{ border: "2px solid var(--acc)", opacity: 0.55 }}
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-media ${className}`}>
      {usable.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={imageUrl(src)}
          alt={i === 0 ? `${name} start position` : `${name} end position`}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          style={{ opacity: usable.length < 2 || frame === i ? 1 : 0 }}
        />
      ))}
    </div>
  );
}

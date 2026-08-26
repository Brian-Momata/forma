"use client";

import { useEffect } from "react";
import { useApp } from "@/store/app";

/**
 * Applies the person's theme choices to the document.
 *
 * The design exposes accent and rest colour as design-time props; here they
 * are real settings, which works because everything downstream reads the two
 * CSS variables rather than hard-coded hexes.
 */
export function ThemeSync() {
  const accent = useApp((s) => s.profile?.accent);
  const restColor = useApp((s) => s.profile?.restColor);
  const highContrast = useApp((s) => s.profile?.highContrast ?? false);

  useEffect(() => {
    const root = document.documentElement;
    if (accent) root.style.setProperty("--acc", accent);
    if (restColor) root.style.setProperty("--rest", restColor);
    root.dataset["contrast"] = highContrast ? "high" : "normal";
  }, [accent, restColor, highContrast]);

  return null;
}

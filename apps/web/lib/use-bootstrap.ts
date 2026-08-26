"use client";

import { useEffect } from "react";
import { useApp } from "@/store/app";

/** Loads local data once per mount. Every screen calls this; it is idempotent. */
export function useBootstrap(): boolean {
  const ready = useApp((s) => s.ready);
  const load = useApp((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return ready;
}

/** The bootstrap error, if there is one, plus a way to try again. */
export function useBootstrapError(): { error: string | null; retry: () => void } {
  const error = useApp((s) => s.error);
  const retry = useApp((s) => s.retry);
  return { error, retry: () => void retry() };
}

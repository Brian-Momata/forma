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

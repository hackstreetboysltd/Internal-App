"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Guard an async submit so a second click is ignored until the first finishes.
 */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const runBusy = useCallback(async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, runBusy, isLocked: () => lock.current };
}

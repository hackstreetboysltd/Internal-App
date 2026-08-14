'use client';

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  installActivityFlushHooks,
  trackActivity,
  trackLoginOnce,
} from "@/lib/activityTracker";
import { moduleKeyFromPath } from "@/lib/modules";
import { useSession } from "@/lib/session";

export default function ActivityTrackerBridge() {
  const pathname = usePathname();
  const { session, ready } = useSession();
  const previousModuleRef = useRef(null);
  const previousPathRef = useRef(null);

  useEffect(() => installActivityFlushHooks(), []);

  useEffect(() => {
    if (!ready || !session?.email) return;
    trackLoginOnce(pathname);
  }, [ready, session?.email, pathname]);

  useEffect(() => {
    if (!ready || !session?.email) return;

    const moduleKey = moduleKeyFromPath(pathname);
    const previousModule = previousModuleRef.current;
    const previousPath = previousPathRef.current;

    if (previousPath && previousPath !== pathname && previousModule) {
      trackActivity("module.leave", previousPath, { module: previousModule });
    }

    if (moduleKey) {
      trackActivity("module.visit", pathname, { module: moduleKey });
      previousModuleRef.current = moduleKey;
    } else if (pathname === "/" || pathname === "") {
      previousModuleRef.current = null;
    }

    previousPathRef.current = pathname;
  }, [pathname, ready, session?.email]);

  return null;
}

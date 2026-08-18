'use client';

import { useEffect, useRef } from "react";
import { formatPortalTime, subscribeServerClock } from "@/lib/portalTime";

export default function HeaderClock() {
    const containerRef = useRef(null);
    const timeRef = useRef(null);

    useEffect(() => {
        return subscribeServerClock(({ nowMs, source, timeZone }) => {
            if (timeRef.current) {
                timeRef.current.textContent = nowMs
                    ? formatPortalTime(nowMs, { withMs: false })
                    : "\u00a0";
            }
            if (containerRef.current) {
                const syncLabel = source === "network" ? "synced" : source;
                containerRef.current.title = `Portal time (${timeZone}) · ${syncLabel}`;
            }
        });
    }, []);

    return (
        <div className="header-clock" ref={containerRef} title="Portal time">
            <span className="header-clock-time" ref={timeRef} suppressHydrationWarning>
                {"\u00a0"}
            </span>
        </div>
    );
}

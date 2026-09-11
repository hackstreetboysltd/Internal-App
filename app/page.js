'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import {
    MOBILE_HOME_PATH,
    consumeStayOnDashboard,
    isMobileViewport,
} from "@/lib/viewport";

export default function HomePage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (isMobileViewport() && !consumeStayOnDashboard()) {
            router.replace(MOBILE_HOME_PATH);
            return;
        }
        setReady(true);
    }, [router]);

    if (!ready) return null;

    return <Dashboard />;
}

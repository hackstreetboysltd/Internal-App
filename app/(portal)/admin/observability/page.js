'use client';

import { Suspense } from "react";
import ObservabilityClient from "./ObservabilityClient";
import "./observability.css";

function ObservabilityFallback() {
    return <div className="obs-empty">Loading observability…</div>;
}

export default function ObservabilityPage() {
    return (
        <Suspense fallback={<ObservabilityFallback />}>
            <ObservabilityClient />
        </Suspense>
    );
}

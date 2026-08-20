'use client';

import { Suspense } from "react";
import DocumentViewerClient from "./DocumentViewerClient";

export default function DocumentViewPage() {
    return (
        <Suspense fallback={<div style={{ color: "#e5e7eb", padding: 24 }}>Opening document…</div>}>
            <DocumentViewerClient />
        </Suspense>
    );
}

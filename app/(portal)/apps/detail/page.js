'use client';

import { Suspense } from "react";
import AppDetailClient from "./AppDetailClient";
import "../apps.css";

function DetailFallback() {
    return (
        <div className="apps-module">
            <div className="container">
                <div className="detail-skeleton" aria-busy="true" aria-label="Loading app details">
                    <div className="skel-tabs">
                        <span className="skel-tab"></span>
                        <span className="skel-tab"></span>
                        <span className="skel-tab"></span>
                        <span className="skel-tab"></span>
                    </div>
                    <div className="skel-detail-card">
                        <span className="skel-line w40"></span>
                        <span className="skel-line w100"></span>
                        <span className="skel-line w100"></span>
                        <span className="skel-line w90"></span>
                        <span className="skel-line w80"></span>
                        <span className="skel-line w70"></span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AppDetailPage() {
    return (
        <Suspense fallback={<DetailFallback />}>
            <AppDetailClient />
        </Suspense>
    );
}

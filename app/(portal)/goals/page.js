'use client';

import { Suspense } from "react";
import GoalsClient from "./GoalsClient";
import "./goals.css";

function GoalsFallback() {
    return (
        <div className="goals-module">
            <div className="goals-skeleton" aria-busy="true" aria-label="Loading goals">
                {[0, 1, 2, 3].map((i) => (
                    <div className="goals-skeleton-row" key={i}>
                        <div className="goals-skeleton-check"></div>
                        <div className="goals-skeleton-body">
                            <div className="goals-skeleton-line medium"></div>
                            <div className="goals-skeleton-line short"></div>
                            <div className="goals-skeleton-line meta"></div>
                        </div>
                        <div className="goals-skeleton-stamp"><span></span><span></span></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function GoalsPage() {
    return (
        <Suspense fallback={<GoalsFallback />}>
            <GoalsClient />
        </Suspense>
    );
}

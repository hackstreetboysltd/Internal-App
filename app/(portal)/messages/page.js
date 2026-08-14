'use client';

import { Suspense } from "react";
import MessagesClient from "./MessagesClient";
import "./messages.css";

function MessagesFallback() {
    return (
        <div className="messages-module">
            <div className="module-skeleton-grid" aria-busy="true" aria-label="Loading messages">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div className="skel-compact-card has-accent accent-green" key={i}>
                        <div className="skel-compact-top">
                            <span className="skel-line w55"></span>
                            <div className="skel-btn-pair"><span className="skel-btn"></span><span className="skel-btn"></span></div>
                        </div>
                        <div className="skel-compact-meta"><span className="skel-line sm w40"></span></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function MessagesPage() {
    return (
        <Suspense fallback={<MessagesFallback />}>
            <MessagesClient />
        </Suspense>
    );
}

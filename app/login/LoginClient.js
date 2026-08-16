'use client';

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPath } from "@/lib/apiPath";
import "./login.css";

const GOOGLE_BTN_LABEL = (
    <>
        <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
            <g transform="matrix(1, 0, 0, 1, 0, 0)">
                <path d="M21.35,11.1H12v2.7h5.38C16.88,15.22,14.73,16.5,12,16.5c-2.92,0-5.39-1.95-6.27-4.57c-0.22-0.67-0.35-1.39-0.35-2.13 c0-0.74,0.13-1.46,0.35-2.13C6.61,5.05,9.08,3.1,12,3.1c1.9,0,3.61,0.72,4.9,2.02l2.03-2.03C17.07,1.33,14.68,0.4,12,0.4 C7.35,0.4,3.46,3.06,1.6,6.97c-0.56,1.18-0.87,2.5-0.87,3.9c0,1.4,0.31,2.72,0.87,3.9c1.86,3.91,5.75,6.57,10.4,6.57 c4.8,0,8.74-3.18,9.75-7.53c0.15-0.65,0.25-1.34,0.25-2.04C22,12.18,21.84,11.63,21.35,11.1z" fill="#4285F4"/>
                <path d="M1.6,6.97L5.73,10.2C6.61,7.58,9.08,5.63,12,5.63c1.9,0,3.61,0.72,4.9,2.02l2.03-2.03C17.07,3.86,14.68,2.93,12,2.93 C7.35,2.93,3.46,5.59,1.6,6.97z" fill="#EA4335"/>
                <path d="M12,21.07c-2.92,0-5.39-1.95-6.27-4.57L1.6,19.7c1.86,3.91,5.75,6.57,10.4,6.57c4.8,0,8.74-3.18,9.75-7.53 l-4.37-3.21C16.88,18.72,14.73,21.07,12,21.07z" fill="#34A853"/>
                <path d="M21.35,11.1H12v2.7h5.38C17.07,14.71,17.2,15.65,17.38,16.5l4.37,3.21c0.15-0.65,0.25-1.34,0.25-2.04 C22,14.78,21.84,12.23,21.35,11.1z" fill="#FBBC05"/>
            </g>
        </svg>
        Continue with Google
    </>
);

function getOrCreateTabSessionId() {
    const key = "portalTabSessionId";
    try {
        let id = sessionStorage.getItem(key);
        if (!id) {
            id = crypto.randomUUID();
            sessionStorage.setItem(key, id);
        }
        return id;
    } catch {
        return crypto.randomUUID();
    }
}

export default function LoginPage() {
    const searchParams = useSearchParams();
    const [busyLabel, setBusyLabel] = useState(null);
    const [inApp, setInApp] = useState(false);
    const [dismissedNotAllowed, setDismissedNotAllowed] = useState(false);
    const [pageHref, setPageHref] = useState("#");
    // Tolerate trailing junk (e.g. legacy `?notAllowed=1/` from appUrl bug).
    const notAllowedParam = searchParams.get("notAllowed") || "";
    const notAllowed = /^1/.test(notAllowedParam) && !dismissedNotAllowed;

    useEffect(() => {
        const t = setTimeout(() => {
            setPageHref(window.location.href);
            const ua = navigator.userAgent || "";
            setInApp(/FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|Twitter|TikTok/i.test(ua));
        }, 0);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const authError = searchParams.get("authError");
        if (authError) {
            console.error("Login error:", authError);
        }
    }, [searchParams]);

    const onGoogleClick = () => {
        setBusyLabel("Redirecting…");
        const returnTo = searchParams.get("returnTo") || "/";
        const sessionId = getOrCreateTabSessionId();
        const params = new URLSearchParams({
            returnTo,
            sessionId,
        });
        window.location.href = `${apiPath("/api/auth/google")}?${params.toString()}`;
    };

    return (
        <>
            <div className="glow-bg">
                <div className="blob blob1"></div>
                <div className="blob blob2"></div>
                <div className="blob blob3"></div>
            </div>
            <div className="login-shell">
                <div className="login-card">
                    <div>
                        <div className="logo-text">HACKSTREETBOYS<span className="logo-sub">LTD</span></div>
                        <div style={{ fontSize: "0.8rem", letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", fontWeight: 700, marginTop: 6 }}>Internal Portal</div>
                    </div>
                    <p className="subtitle">Access the secure organization console, dashboards, and internal modules.</p>
                    <button
                        className="google-btn"
                        id="googleLoginBtn"
                        type="button"
                        disabled={!!busyLabel || inApp}
                        onClick={onGoogleClick}
                        style={{ display: inApp ? "none" : "flex" }}
                    >
                        {busyLabel ? <><i className="fa-solid fa-spinner fa-spin"></i>&nbsp; {busyLabel}</> : GOOGLE_BTN_LABEL}
                    </button>
                    <div className="open-browser-banner" id="inAppBrowserBanner" style={{ display: inApp ? "block" : "none" }}>
                        <p>You&apos;re in an in-app browser which blocks Google sign-in.<br />Open this page in Chrome or Safari to continue.</p>
                        <a className="open-browser-btn" id="openInBrowserBtn" href={pageHref} target="_blank" rel="noopener noreferrer">
                            <i className="fa-solid fa-arrow-up-right-from-square"></i>
                            Open in Browser
                        </a>
                    </div>
                    <p className="footer-note">Unauthorized access is strictly prohibited. Activity on this console is logged and audited.</p>
                </div>
            </div>
            <div id="notAllowedModal" className="not-allowed-modal" style={{ display: notAllowed ? "flex" : "none" }}>
                <div className="not-allowed-modal-content">
                    <div className="modal-icon"><i className="fa-solid fa-circle-exclamation"></i></div>
                    <h2>Access Pending</h2>
                    <p>Your e-mail address isnt part of the organization. Your Address has been noted and we will get back to you.</p>
                    <button type="button" onClick={() => setDismissedNotAllowed(true)}>Understand</button>
                </div>
            </div>
        </>
    );
}

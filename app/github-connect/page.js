'use client';

import { useEffect, useState } from "react";
import { FirebaseAuth } from "@/lib/firebase";
import { getGithubPat, setGithubPat } from "@/lib/portalApi";
import { githubMessageOrigin } from "@/lib/githubMessage";
import "./github-connect.css";

export default function GithubConnectPage() {
    const [connected, setConnected] = useState(false);
    const [status, setStatus] = useState({ className: "status-msg", text: "" });

    useEffect(() => {
        const t = setTimeout(() => {
            const has = !!getGithubPat();
            setConnected(has);
            if (has && window.opener) {
                window.opener.postMessage({ type: "GITHUB_CONNECTED", token: getGithubPat() }, githubMessageOrigin());
            }
        }, 0);
        return () => clearTimeout(t);
    }, []);

    const startGithubLogin = async () => {
        if (!FirebaseAuth.auth) {
            setStatus({ className: "status-msg error", text: "Firebase is not initialized yet. Please wait a moment." });
            return;
        }
        try {
            setStatus({ className: "status-msg info", text: "Opening GitHub login..." });
            const provider = new FirebaseAuth.GithubAuthProvider();
            provider.addScope("repo");
            const result = await FirebaseAuth.signInWithPopup(FirebaseAuth.auth, provider);
            const credential = FirebaseAuth.GithubAuthProvider.credentialFromResult(result);
            const token = credential.accessToken;
            if (token) {
                setGithubPat(token);
                setStatus({ className: "status-msg success", text: "Successfully connected!" });
                setTimeout(() => {
                    if (window.opener) {
                        window.opener.postMessage({ type: "GITHUB_CONNECTED", token }, githubMessageOrigin());
                        window.close();
                    } else {
                        setConnected(true);
                    }
                }, 1000);
            } else {
                setStatus({ className: "status-msg error", text: "Failed to retrieve access token from GitHub." });
            }
        } catch (error) {
            console.error("Firebase Auth Error:", error);
            setStatus({ className: "status-msg error", text: error.message || "Authentication failed." });
        }
    };

    const disconnectGithub = async () => {
        if (!confirm("Are you sure you want to disconnect?")) return;
        setGithubPat(null);
        if (FirebaseAuth.auth) {
            await FirebaseAuth.signOut(FirebaseAuth.auth);
        }
        if (window.opener) {
            window.opener.postMessage({ type: "GITHUB_DISCONNECTED" }, githubMessageOrigin());
        }
        setConnected(false);
    };

    return (
        <div className="gh-connect-shell">
            <div className="card">
                <div className="brand">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                    <span style={{ fontSize: 18, fontWeight: 500 }}>GitHub</span>
                </div>

                {connected ? (
                    <div id="sectionAlready">
                        <h1>GitHub Connected</h1>
                        <p className="sub">Your GitHub session is active via Firebase Auth.</p>
                        <div className="session-badge">
                            <i className="fa-brands fa-github"></i>
                            <div>
                                <div>Ready to fetch commits</div>
                            </div>
                        </div>
                        <button className="btn btn-ghost" type="button" onClick={disconnectGithub}>
                            Disconnect Token
                        </button>
                    </div>
                ) : (
                    <div id="sectionSetup">
                        <h1>Connect GitHub</h1>
                        <p className="sub">Sign in with GitHub to allow the app to fetch changelogs from your repositories securely.</p>
                        <div id="setupStatus" className={status.className}>{status.text}</div>
                        <button className="btn btn-dark" type="button" onClick={startGithubLogin}>
                            <i className="fa-brands fa-github"></i> Sign in with GitHub
                        </button>
                    </div>
                )}

                <p className="footer">GitHub access is used to fetch commit history for your linked repos.</p>
            </div>
        </div>
    );
}

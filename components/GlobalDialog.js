'use client';

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
    const [dialog, setDialog] = useState(null);

    const showGlobalDialog = useCallback(({ title, message, type = "info", confirmText = "OK", showCancel = false }) => {
        return new Promise((resolve) => {
            setDialog({ title, message, type, confirmText, showCancel, resolve });
        });
    }, []);

    const close = useCallback((result) => {
        setDialog((current) => {
            if (current?.resolve) current.resolve(result);
            return null;
        });
    }, []);

    const value = useMemo(() => ({ showGlobalDialog }), [showGlobalDialog]);

    let iconHtml = '<i class="fa-solid fa-circle-info" style="color: #6366f1;"></i>';
    let titleColor = "#6366f1";
    let confirmBg = "#6366f1";
    if (dialog?.type === "warning") {
        iconHtml = '<i class="fa-solid fa-triangle-exclamation" style="color: #fb7185;"></i>';
        titleColor = "#fb7185";
        confirmBg = "#fb7185";
    } else if (dialog?.type === "error") {
        iconHtml = '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>';
        titleColor = "#ef4444";
        confirmBg = "#fb7185";
    } else if (dialog?.type === "success") {
        iconHtml = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
        titleColor = "#10b981";
    }

    return (
        <DialogContext.Provider value={value}>
            {children}
            <div id="globalDialogModal" className="session-modal" style={{ display: dialog ? "flex" : "none" }}>
                <div className="session-modal-content" style={{ maxWidth: 400, padding: 32 }}>
                    <div id="globalDialogIcon" style={{ fontSize: "3rem", marginBottom: 16, lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: dialog ? iconHtml : "" }} />
                    <h2 id="globalDialogTitle" style={{ marginBottom: 12, fontFamily: "var(--font-heading)", fontSize: "1.4rem", color: titleColor }}>
                        {dialog?.title || "Confirm Action"}
                    </h2>
                    <p id="globalDialogMessage" style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: 24, whiteSpace: "pre-line" }}>
                        {dialog?.message || ""}
                    </p>
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", width: "100%" }}>
                        <button
                            id="globalDialogCancelBtn"
                            type="button"
                            style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.08)", color: "white", padding: "12px 20px", borderRadius: 12, cursor: "pointer", flex: 1, fontWeight: 600, transition: "background 0.2s", fontFamily: "inherit", display: dialog?.showCancel ? "block" : "none" }}
                            onClick={() => close(false)}
                        >
                            Cancel
                        </button>
                        <button
                            id="globalDialogConfirmBtn"
                            type="button"
                            style={{ background: confirmBg, color: "white", border: "none", padding: "12px 20px", borderRadius: 12, cursor: "pointer", flex: 1, fontWeight: 600, transition: "opacity 0.2s", fontFamily: "inherit" }}
                            onClick={() => close(true)}
                        >
                            {dialog?.confirmText || "OK"}
                        </button>
                    </div>
                </div>
            </div>
        </DialogContext.Provider>
    );
}

export function useGlobalDialog() {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error("useGlobalDialog must be used within DialogProvider");
    return ctx;
}

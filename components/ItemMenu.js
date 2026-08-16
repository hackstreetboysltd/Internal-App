'use client';

import { useEffect, useId, useRef, useState } from "react";
import "./itemMenu.css";

const OPEN_EVENT = "portal-item-menu-open";

export default function ItemMenu({ items, align = "end", title = "Options" }) {
    const [open, setOpen] = useState(false);
    const uid = useId();
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onOpen = (e) => {
            if (e.detail !== uid) setOpen(false);
        };
        const onPointer = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener(OPEN_EVENT, onOpen);
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener(OPEN_EVENT, onOpen);
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open, uid]);

    if (!Array.isArray(items) || !items.length) return null;

    return (
        <span
            ref={wrapRef}
            className={`item-menu${open ? " is-open" : ""}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <button
                type="button"
                className={`item-menu-btn${open ? " is-open" : ""}`}
                title={title}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => {
                    setOpen((wasOpen) => {
                        const next = !wasOpen;
                        if (next) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: uid }));
                        return next;
                    });
                }}
            >
                <i className="fa-solid fa-ellipsis" aria-hidden="true"></i>
            </button>
            {open ? (
                <div className={`item-menu-dropdown align-${align}`} role="menu">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            className={`item-menu-option${item.danger ? " danger" : ""}`}
                            onClick={() => {
                                setOpen(false);
                                item.onClick?.();
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </span>
    );
}

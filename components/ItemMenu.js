'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./itemMenu.css";

const OPEN_EVENT = "portal-item-menu-open";

export default function ItemMenu({ items, align = "end", title = "Options" }) {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState(null);
    const [mounted, setMounted] = useState(false);
    const uid = useId();
    const wrapRef = useRef(null);
    const btnRef = useRef(null);
    const dropdownRef = useRef(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const syncPosition = () => {
        const btn = btnRef.current;
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        setCoords({
            top: rect.bottom + 4,
            left: align === "start" ? rect.left : undefined,
            right: align === "end" ? window.innerWidth - rect.right : undefined,
        });
    };

    useLayoutEffect(() => {
        if (!open) {
            setCoords(null);
            return undefined;
        }
        syncPosition();
        const onMove = () => syncPosition();
        window.addEventListener("resize", onMove);
        window.addEventListener("scroll", onMove, true);
        return () => {
            window.removeEventListener("resize", onMove);
            window.removeEventListener("scroll", onMove, true);
        };
    }, [open, align]);

    useEffect(() => {
        if (!open) return undefined;
        const onOpen = (e) => {
            if (e.detail !== uid) setOpen(false);
        };
        const onPointer = (e) => {
            const target = e.target;
            if (wrapRef.current?.contains(target)) return;
            if (dropdownRef.current?.contains(target)) return;
            setOpen(false);
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

    const dropdown = open && coords && mounted
        ? createPortal(
            <div
                ref={dropdownRef}
                className={`item-menu-dropdown is-portal align-${align}`}
                role="menu"
                style={{
                    position: "fixed",
                    top: coords.top,
                    left: coords.left,
                    right: coords.right,
                    zIndex: 1100,
                }}
            >
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
            </div>,
            document.body,
        )
        : null;

    return (
        <>
            <span
                ref={wrapRef}
                className={`item-menu${open ? " is-open" : ""}`}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >
                <button
                    ref={btnRef}
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
            </span>
            {dropdown}
        </>
    );
}

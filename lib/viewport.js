/** Dock / portal mobile breakpoint (matches `globals.css`). */
export const MOBILE_MAX_WIDTH = 768;

/** Messages rail/thread split (matches `messages.css`). */
export const MESSAGES_NARROW_MAX_WIDTH = 780;

export function isViewportAtMost(maxWidth) {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }
    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
}

export function isMobileViewport() {
    return isViewportAtMost(MOBILE_MAX_WIDTH);
}

export function isMessagesNarrowViewport() {
    return isViewportAtMost(MESSAGES_NARROW_MAX_WIDTH);
}

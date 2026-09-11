/** Dock / portal mobile breakpoint (matches `globals.css`). */
export const MOBILE_MAX_WIDTH = 768;

/** Messages rail/thread split (matches `messages.css`). */
export const MESSAGES_NARROW_MAX_WIDTH = 780;

export const MOBILE_HOME_PATH = "/messages/";

const STAY_ON_DASHBOARD_KEY = "portalStayOnDashboard";

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

/** Next `/` visit on mobile should show the dashboard instead of redirecting home. */
export function markStayOnDashboard() {
    try {
        sessionStorage.setItem(STAY_ON_DASHBOARD_KEY, "1");
    } catch {
        /* private mode / blocked storage */
    }
}

export function consumeStayOnDashboard() {
    try {
        if (sessionStorage.getItem(STAY_ON_DASHBOARD_KEY) !== "1") return false;
        sessionStorage.removeItem(STAY_ON_DASHBOARD_KEY);
        return true;
    } catch {
        return false;
    }
}

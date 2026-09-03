export const GOAL_REVIEW_NOT_DONE = "not_done";
export const GOAL_REVIEW_UNDER = "under_review";
export const GOAL_REVIEW_REVIEWED = "reviewed";

/**
 * @param {{ done?: boolean, reviewStatus?: string } | null | undefined} goal
 */
export function resolveGoalReviewStatus(goal) {
    if (!goal?.done) return GOAL_REVIEW_NOT_DONE;
    if (goal.reviewStatus === GOAL_REVIEW_REVIEWED) return GOAL_REVIEW_REVIEWED;
    if (goal.reviewStatus === GOAL_REVIEW_UNDER) return GOAL_REVIEW_UNDER;
    return GOAL_REVIEW_UNDER;
}

/**
 * @param {string} status
 */
export function goalReviewLabel(status) {
    if (status === GOAL_REVIEW_REVIEWED) return "Reviewed";
    if (status === GOAL_REVIEW_UNDER) return "Under Review";
    return "Not Done";
}

/**
 * @param {{ done?: boolean, reviewStatus?: string } | null | undefined} goal
 */
export function goalNeedsAdminReview(goal) {
    if (!goal?.done) return false;
    if (goal.reviewStatus === GOAL_REVIEW_REVIEWED) return false;
    return true;
}

/**
 * @param {{ reviewSubmittedAt?: string, done?: boolean, reviewStatus?: string, text?: string }} goal
 * @param {{ createdAt?: string, id?: string | number }} record
 */
export function resolveGoalReviewSubmittedMs(goal, record) {
    if (goal?.reviewSubmittedAt) {
        const parsed = Date.parse(goal.reviewSubmittedAt);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    if (record?.createdAt) {
        const parsed = Date.parse(record.createdAt);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    const id = Number(record?.id);
    if (Number.isFinite(id) && id > 0) return id;
    return 0;
}

/**
 * @param {{ done?: boolean, reviewStatus?: string, text?: string, reviewSubmittedAt?: string }} goal
 * @param {boolean} nextDone
 */
export function applyGoalToggleReview(goal, nextDone) {
    goal.done = nextDone;
    if (nextDone) {
        goal.reviewStatus = GOAL_REVIEW_UNDER;
        goal.reviewSubmittedAt = new Date().toISOString();
    } else {
        goal.reviewStatus = GOAL_REVIEW_NOT_DONE;
        delete goal.reviewSubmittedAt;
    }
}

/**
 * Returns true when records differ only in sub-goal done/reviewStatus (text unchanged).
 * @param {Record<string, unknown>} oldItem
 * @param {Record<string, unknown>} newItem
 */
export function isGoalsProgressOnlyChange(oldItem, newItem) {
    const keys = new Set([...Object.keys(oldItem || {}), ...Object.keys(newItem || {})]);
    for (const key of keys) {
        if (key === "goals") continue;
        if (JSON.stringify(oldItem?.[key]) !== JSON.stringify(newItem?.[key])) return false;
    }
    const oldGoals = Array.isArray(oldItem?.goals) ? oldItem.goals : [];
    const newGoals = Array.isArray(newItem?.goals) ? newItem.goals : [];
    if (oldGoals.length !== newGoals.length) return false;
    for (let i = 0; i < oldGoals.length; i += 1) {
        const og = oldGoals[i] || {};
        const ng = newGoals[i] || {};
        if (String(og.text || "") !== String(ng.text || "")) return false;
    }
    for (let i = 0; i < oldGoals.length; i += 1) {
        const og = oldGoals[i] || {};
        const ng = newGoals[i] || {};
        if (!!og.done !== !!ng.done) return true;
        if (String(og.reviewStatus || "") !== String(ng.reviewStatus || "")) return true;
    }
    return false;
}

/**
 * @param {Record<string, unknown>} oldItem
 * @param {Record<string, unknown>} newItem
 */
export function diffGoalReviewTransitions(oldItem, newItem) {
    /** @type {{ goalIndex: number, goal: Record<string, unknown> }[]} */
    const submitted = [];
    /** @type {{ goalIndex: number, goal: Record<string, unknown> }[]} */
    const reviewed = [];
    const oldGoals = Array.isArray(oldItem?.goals) ? oldItem.goals : [];
    const newGoals = Array.isArray(newItem?.goals) ? newItem.goals : [];

    for (let i = 0; i < newGoals.length; i += 1) {
        const og = oldGoals[i] || {};
        const ng = newGoals[i] || {};
        const prev = String(og.reviewStatus || "");
        const next = String(ng.reviewStatus || "");
        const wasDone = !!og.done;
        const isDone = !!ng.done;
        const newlySubmitted = (prev !== GOAL_REVIEW_UNDER && next === GOAL_REVIEW_UNDER)
            || (!wasDone && isDone && next !== GOAL_REVIEW_REVIEWED);
        if (newlySubmitted) {
            submitted.push({ goalIndex: i, goal: ng });
        }
        if (prev !== GOAL_REVIEW_REVIEWED && next === GOAL_REVIEW_REVIEWED) {
            reviewed.push({ goalIndex: i, goal: ng });
        }
    }

    return { submitted, reviewed };
}

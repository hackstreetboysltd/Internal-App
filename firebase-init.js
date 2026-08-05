import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithPopup, signInWithCredential, signInWithRedirect, getRedirectResult, onAuthStateChanged, GithubAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Read env vars injected by env-config.js <script> tag (loaded before this module)
const env = window.ENV || {};

const firebaseConfig = {
    apiKey: env.FIREBASE_API_KEY || "",
    authDomain: env.FIREBASE_AUTH_DOMAIN || "",
    projectId: env.FIREBASE_PROJECT_ID || "",
    storageBucket: env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: env.FIREBASE_APP_ID || ""
};

let db;
let auth;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (e) {
    console.warn("Firebase not properly configured yet.", e);
}

window.FirebaseAuth = {
    auth,
    signInWithPopup,
    signInWithCredential,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    GithubAuthProvider,
    signOut
};

const withTimeout = (promise, ms = 10000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
    ]);
};

function getDefaultGoalsSeed() {
    const getWeekIdentifier = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    };

    const now = new Date();
    const currentWeek = getWeekIdentifier(now);
    const currentMonth = `${now.getFullYear()}-M${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentAnnual = `${now.getFullYear()}`;

    return [
        {
            id: 1720000000001,
            user: "Phil Kakai",
            title: "Unify organizational tooling and portals",
            goals: [
                { text: "Transition all modules to single page suite", done: true },
                { text: "Adopt Firestore as primary datastore", done: true },
                { text: "Reach 1000 satisfied internal portal users", done: false }
            ],
            weekId: null,
            periodId: currentAnnual,
            type: "annual"
        },
        {
            id: 1720000000002,
            user: "Mulei",
            title: "Optimize API Layer Performance",
            goals: [
                { text: "Adopt batched writes for database transactions", done: true },
                { text: "Improve cache invalidation strategies", done: true },
                { text: "Reduce API response latency by 20%", done: false }
            ],
            weekId: null,
            periodId: currentMonth,
            type: "monthly"
        },
        {
            id: 1720000000003,
            user: "Mulei",
            title: "",
            goals: [
                { text: "Profile latency on large profile reads", done: true },
                { text: "Implement defensive type checks on sync functions", done: true },
                { text: "Configure index optimization rules", done: true }
            ],
            weekId: currentWeek,
            periodId: currentWeek,
            type: "weekly"
        },
        {
            id: 1720000000004,
            user: "ryan mwiti",
            title: "",
            goals: [
                { text: "Resolve mobile viewport overflow issues", done: true },
                { text: "Align goals tab-group styling across dashboards", done: false },
                { text: "Clean up redundant local fallback scripts", done: true }
            ],
            weekId: currentWeek,
            periodId: currentWeek,
            type: "weekly"
        },
        {
            id: 1720000000005,
            user: "ryan mwiti",
            title: "",
            goals: [
                { text: "Implement standardized modal notifications", done: true },
                { text: "Refactor goals edit to prevent duplicate creation", done: false }
            ],
            weekId: currentWeek,
            periodId: currentWeek,
            type: "weekly"
        }
    ];
}

function getDefaultRoleAccessSeed() {
    return [
        {
            id: "allowed",
            emails: [
                "kakaiphil@gmail.com"
            ]
        },
        {
            id: "admins",
            emails: [
                "kakaiphil@gmail.com"
            ]
        }
    ];
}



window.FirebaseDB = {
    isOnline: () => {
        return !!db && typeof navigator !== 'undefined' && navigator.onLine;
    },
    getCollection: async (moduleName) => {
        if (!db) {
            throw new Error("Firebase database connection is unavailable or unconfigured.");
        }
        try {
            const docRef = doc(db, "modules", moduleName);
            const docSnap = await withTimeout(getDoc(docRef), 10000);
            let data = [];
            if (docSnap.exists()) {
                data = docSnap.data().data || [];
            }

            let updated = false;

            if (moduleName === 'goals' && (!data || data.length === 0)) {
                data = getDefaultGoalsSeed();
                updated = true;
            }

            if (moduleName === 'role_access') {
                const seed = getDefaultRoleAccessSeed();
                const blocklistedEmails = new Set([
                    "2103334@students.kcau.ac.ke",
                    "kakaiking@gmail.com",
                    "kingkakai@gmail.com",
                    "phil.kakai@gmail.com",
                    "phil@kakai.org",
                    "admin@kakai.org",
                    "mulei@gmail.com",
                    "mulei@kakai.org",
                    "ryanmwiti@gmail.com",
                    "ryan.mwiti@gmail.com",
                    "ryanmwiti@kakai.org"
                ]);
                if (!data || data.length === 0) {
                    data = seed;
                    updated = true;
                } else {
                    let approvedEmailsFromProfiles = [];
                    try {
                        const profRef = doc(db, "modules", "profile");
                        const profSnap = await getDoc(profRef);
                        if (profSnap.exists()) {
                            const profs = profSnap.data().data || [];
                            approvedEmailsFromProfiles = profs
                                .filter(p => p.approvedStatus === 'approved')
                                .map(p => (p.email || '').toLowerCase());
                        }
                    } catch (e) {
                        console.warn("Could not fetch profiles in role_access interceptor", e);
                    }

                    data.forEach(record => {
                        if (record.emails) {
                            const originalLen = record.emails.length;
                            record.emails = record.emails.filter(email => {
                                const norm = email.toLowerCase();
                                return !blocklistedEmails.has(norm) || approvedEmailsFromProfiles.includes(norm);
                            });
                            if (record.emails.length !== originalLen) {
                                updated = true;
                            }
                        }
                    });
                    seed.forEach(s => {
                        let record = data.find(r => r.id === s.id);
                        if (!record) {
                            data.push(s);
                            updated = true;
                        } else {
                            if (!record.emails) {
                                record.emails = [];
                                updated = true;
                            }
                            s.emails.forEach(email => {
                                if (!record.emails.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
                                    record.emails.push(email);
                                    updated = true;
                                }
                            });
                        }
                    });
                }
            }

            if (moduleName === 'profile') {
                const blocklistedEmails = new Set([
                    "2103334@students.kcau.ac.ke",
                    "kakaiking@gmail.com",
                    "phil@kakai.org",
                    "admin@kakai.org",
                    "kingkakai@gmail.com",
                    "phil.kakai@gmail.com",
                    "mulei@kakai.org",
                    "ryanmwiti@kakai.org",
                    "ryan.mwiti@gmail.com"
                ]);
                const originalLength = data.length;
                data = data.filter(r => {
                    if (!r.email) return false;
                    const norm = r.email.toLowerCase();
                    if (blocklistedEmails.has(norm)) {
                        return !!r.approvedStatus;
                    }
                    return true;
                });
                if (data.length !== originalLength) {
                    updated = true;
                }
            }

            if (updated) {
                try {
                    await withTimeout(setDoc(docRef, { data: data }), 10000);
                } catch (e) {
                    console.warn("Could not save initial seed to Firestore:", e);
                }
            }

            return data;
        } catch (e) {
            console.error("Error getting document from Firebase:", e);
            throw e;
        }
    },
    saveCollection: async (moduleName, data) => {
        if (!db) {
            throw new Error("Firebase database connection is unavailable or unconfigured.");
        }
        try {
            let listToSave = data;
            const docRef = doc(db, "modules", moduleName);
            await withTimeout(setDoc(docRef, { data: listToSave }), 10000);
            return true;
        } catch (e) {
            console.error("Error writing document to Firebase:", e);
            throw e;
        }
    }
};

// Intercept fetch API calls to replace the Node.js server
const collections = ['skills', 'procedures', 'goals', 'calendar', 'meetings', 'messages', 'apps', 'profile', 'auth', 'glossary', 'settings', 'pending_skills', 'pending_procedures', 'pending_goals', 'pending_calendar', 'pending_meetings', 'pending_messages', 'pending_apps', 'pending_profile', 'pending_glossary', 'role_access'];
const originalFetch = window.fetch;

function safeEquals(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == b) {
        if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) {
            return String(a) === String(b);
        }
    }
    if (typeof a !== typeof b) return false;
    if (a && typeof a === 'object' && b && typeof b === 'object') {
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!safeEquals(a[i], b[i])) return false;
            }
            return true;
        }
        if (Array.isArray(a) || Array.isArray(b)) return false;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const k of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
            if (!safeEquals(a[k], b[k])) return false;
        }
        return true;
    }
    return false;
}

function goalRecordActorCanModify(oldItem, actor) {
    const actorName = (actor && actor.name ? actor.name : '').trim().toLowerCase();
    if (!actorName) return false;
    const owner = (oldItem.user || oldItem.author || '').trim().toLowerCase();
    const createdBy = (oldItem.createdBy || '').trim().toLowerCase();
    return owner === actorName || createdBy === actorName;
}

window.fetch = async function (...args) {
    const url = args[0];
    const options = args[1];

    let urlString = "";
    if (typeof url === 'string') {
        urlString = url;
    } else if (url && typeof url === 'object' && url.url) {
        urlString = url.url;
    }

    if (urlString) {
        let isApiCall = false;
        let path = "";

        if (urlString.startsWith('/api/')) {
            isApiCall = true;
            path = urlString.split('/api/')[1];
        } else if (urlString.includes('/api/')) {
            isApiCall = true;
            path = urlString.split('/api/')[1];
        }

        if (isApiCall) {
            let queryStr = '';
            if (path.includes('?')) {
                const parts = path.split('?');
                path = parts[0];
                queryStr = parts[1];
            }

            if (path.endsWith('/approve') || path.endsWith('/reject')) {
                const parts = path.split('/');
                const collectionName = parts[0];
                const action = parts[1];

                const body = JSON.parse(options.body);
                const pendingCol = 'pending_' + collectionName;

                const pending = await window.FirebaseDB.getCollection(pendingCol);
                const recordIdx = pending.findIndex(r => String(r.id) === String(body.id));
                if (recordIdx === -1) {
                    return new Response(JSON.stringify({ error: 'Record not found in pending queue' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
                }

                const record = pending[recordIdx];

                if (action === 'approve') {
                    const main = await window.FirebaseDB.getCollection(collectionName);
                    if (record.type === 'create') {
                        main.push(record.data);
                    } else if (record.type === 'edit') {
                        const mainIdx = main.findIndex(m => String(m.id) === String(record.data.id));
                        if (mainIdx !== -1) {
                            main[mainIdx] = record.data;
                        } else {
                            main.push(record.data);
                        }
                    }
                    await window.FirebaseDB.saveCollection(collectionName, main);
                }

                pending.splice(recordIdx, 1);
                await window.FirebaseDB.saveCollection(pendingCol, pending);

                return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (collections.includes(path)) {
                const isAdminModule = window.location.pathname.includes('/admin_modules/');

                if (!options || options.method === 'GET' || !options.method) {
                    if (isAdminModule) {
                        const pending = await window.FirebaseDB.getCollection('pending_' + path);
                        const formatted = pending.map(item => {
                            return {
                                ...item.data,
                                pendingId: item.id,
                                pendingType: item.type,
                                pendingAuthor: item.author
                            };
                        });
                        const active = await window.FirebaseDB.getCollection(path);
                        const pendingIds = new Set(pending.filter(p => p.type !== 'create').map(p => String(p.id)));
                        const filteredActive = active.filter(a => !pendingIds.has(String(a.id)));
                        const combined = [...formatted, ...filteredActive];
                        return new Response(JSON.stringify(combined), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    } else {
                        const data = await window.FirebaseDB.getCollection(path);
                        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }
                }
                if (options && options.method === 'POST') {
                    const body = JSON.parse(options.body);

                    if (['skills', 'procedures', 'goals', 'calendar', 'meetings', 'messages', 'apps', 'glossary'].includes(path)) {
                        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
                        const oldCollection = await window.FirebaseDB.getCollection(path);

                        const isUnauthorized = oldCollection.some(oldItem => {
                            if (path === 'goals') {
                                if (goalRecordActorCanModify(oldItem, actor)) return false;
                                const owner = oldItem.user || oldItem.author;
                                if (!owner && !oldItem.createdBy) return false;
                            }

                            const author = oldItem.author || oldItem.user;
                            if (!author) return false;

                            const isNotOwner = author.toLowerCase() !== actor.name.toLowerCase();
                            if (isNotOwner) {
                                const newItem = body.find(n => String(n.id) === String(oldItem.id));
                                if (!newItem) {
                                    console.warn(`Access Denied: Attempted unauthorized deletion of item ${oldItem.id} by ${actor.name}`);
                                    return true;
                                }
                                const keys = new Set([...Object.keys(oldItem), ...Object.keys(newItem)]);
                                for (const key of keys) {
                                    if (key === 'tickets') {
                                        const oldTickets = oldItem.tickets || [];
                                        const newTickets = newItem.tickets || [];

                                        const ticketDeleted = oldTickets.some(ot => !newTickets.some(nt => String(nt.id) === String(ot.id)));
                                        if (ticketDeleted) return true;

                                        const unauthorizedTicketEdit = oldTickets.some(ot => {
                                            const ticketAuthor = ot.author;
                                            if (!ticketAuthor) return false;
                                            if (ticketAuthor.toLowerCase() !== actor.name.toLowerCase()) {
                                                const nt = newTickets.find(x => String(x.id) === String(ot.id));
                                                if (!nt || !safeEquals(nt, ot)) {
                                                    return true;
                                                }
                                            }
                                            return false;
                                        });
                                        if (unauthorizedTicketEdit) return true;
                                    } else {
                                        const oldVal = oldItem[key];
                                        const newVal = newItem[key];
                                        if (!safeEquals(oldVal, newVal)) {
                                            return true;
                                        }
                                    }
                                }
                            }
                            return false;
                        });

                        if (isUnauthorized) {
                            return new Response(JSON.stringify({ error: 'Permission Denied: Unauthorized modification or deletion of records owned by another user.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                        }
                    }

                    const oldCollection = await window.FirebaseDB.getCollection(path);
                    const oldMap = new Map(oldCollection.map(item => [String(item.id), item]));
                    const newMap = new Map(body.map(item => [String(item.id), item]));

                    if (path === 'goals') {
                        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
                        const pending = await window.FirebaseDB.getCollection('pending_goals');
                        
                        const createdGlobals = [];
                        const editedGlobals = [];
                        const listToSave = [];
                        let globalChangesDetected = false;

                        for (const newItem of body) {
                            const oldItem = oldMap.get(String(newItem.id));
                            if (!oldItem) {
                                if (newItem.scope === 'global') {
                                    createdGlobals.push(newItem);
                                    globalChangesDetected = true;
                                } else {
                                    listToSave.push(newItem);
                                }
                            } else {
                                if (!safeEquals(oldItem, newItem)) {
                                    if (newItem.scope === 'global') {
                                        editedGlobals.push(newItem);
                                        globalChangesDetected = true;
                                        // Keep the old version in the active list so it doesn't change yet
                                        listToSave.push(oldItem);
                                    } else {
                                        listToSave.push(newItem);
                                    }
                                } else {
                                    listToSave.push(newItem);
                                }
                            }
                        }

                        if (globalChangesDetected) {
                            for (const item of createdGlobals) {
                                pending.push({
                                    id: item.id || Date.now(),
                                    type: 'create',
                                    author: item.user || actor.name,
                                    data: item
                                });
                            }
                            for (const item of editedGlobals) {
                                const idx = pending.findIndex(p => String(p.id) === String(item.id) && p.type === 'edit');
                                if (idx !== -1) {
                                    pending[idx].data = item;
                                } else {
                                    pending.push({
                                        id: item.id,
                                        type: 'edit',
                                        author: item.user || actor.name,
                                        data: item
                                    });
                                }
                            }
                            await window.FirebaseDB.saveCollection('pending_goals', pending);
                            alert('Your global goal has been submitted to the Admin for approval.');
                        }

                        // Check for completed goals check off
                        let finishedLastGoal = false;
                        for (const newItem of body) {
                            const oldItem = oldMap.get(String(newItem.id));
                            if (oldItem) {
                                const oldCompleted = oldItem.goals.filter(g => g.done).length;
                                const newCompleted = newItem.goals.filter(g => g.done).length;
                                if (oldCompleted < 5 && newCompleted === 5) {
                                    pending.push({
                                        id: newItem.id,
                                        type: 'goals_completed',
                                        author: newItem.user || actor.name,
                                        data: newItem
                                    });
                                    finishedLastGoal = true;
                                }
                            }
                        }
                        if (finishedLastGoal) {
                            await window.FirebaseDB.saveCollection('pending_goals', pending);
                            alert('Congratulations on finishing all 5 goals! A review record has been sent to the Admin.');
                        }

                        await window.FirebaseDB.saveCollection(path, listToSave);
                        return new Response(JSON.stringify({ success: true, pending: globalChangesDetected }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    const created = [];
                    const edited = [];
                    for (const newItem of body) {
                        const oldItem = oldMap.get(String(newItem.id));
                        if (!oldItem) {
                            created.push(newItem);
                        } else if (!safeEquals(oldItem, newItem)) {
                            edited.push(newItem);
                        }
                    }

                    // Specify modules that must undergo admin review
                    // Secure messages publish immediately — no admin approval queue
                    const requiresApproval = ['skills', 'procedures', 'calendar', 'meetings', 'apps', 'glossary'];

                    if (requiresApproval.includes(path) && (created.length > 0 || edited.length > 0)) {
                        const pendingCol = 'pending_' + path;
                        const pending = await window.FirebaseDB.getCollection(pendingCol);
                        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };

                        for (const item of created) {
                            pending.push({
                                id: item.id || Date.now(),
                                type: 'create',
                                author: item.author || item.user || actor.name,
                                data: item
                            });
                        }

                        for (const item of edited) {
                            const idx = pending.findIndex(p => String(p.id) === String(item.id) && p.type === 'edit');
                            if (idx !== -1) {
                                pending[idx].data = item;
                            } else {
                                pending.push({
                                    id: item.id,
                                    type: 'edit',
                                    author: item.author || item.user || actor.name,
                                    data: item
                                });
                            }
                        }

                        await window.FirebaseDB.saveCollection(pendingCol, pending);
                        alert('Your changes have been submitted to the Admin for approval.');

                        const listToSave = [];
                        for (const oldItem of oldCollection) {
                            if (newMap.has(String(oldItem.id))) {
                                listToSave.push(oldItem);
                            }
                        }
                        await window.FirebaseDB.saveCollection(path, listToSave);
                        return new Response(JSON.stringify({ success: true, pending: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    if (path === 'profile') {
                        let existing = [];
                        try {
                            existing = await window.FirebaseDB.getCollection('profile');
                        } catch (e) {
                            console.warn("Could not fetch profiles for merging on POST:", e);
                        }
                        if (!Array.isArray(existing)) {
                            existing = [];
                        }

                        body.forEach(incoming => {
                            if (!incoming || !incoming.email) return;
                            const idx = existing.findIndex(e => e.email && e.email.toLowerCase() === incoming.email.toLowerCase());
                            if (idx === -1) {
                                existing.push(incoming);
                            } else {
                                existing[idx] = { ...existing[idx], ...incoming };
                            }
                        });

                        await window.FirebaseDB.saveCollection(path, existing);
                        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    // Directly save properties that do not require administrative approval (e.g. settings)
                    await window.FirebaseDB.saveCollection(path, body);
                    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }
            }

            if (path === 'github-oauth/status') {
                const hasPat = !!(window.top && window.top.github_pat);
                return new Response(JSON.stringify({
                    configured: hasPat,
                    connected: hasPat,
                    clientId: 'static-pat-mode',
                    expiry: null
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (path === 'github-commits') {
                const repo = new URLSearchParams(queryStr).get('repo');
                const token = window.top ? window.top.github_pat : null;

                if (!token) {
                    return new Response(JSON.stringify({ error: 'GitHub session expired. Please reconnect.', expired: true }), { status: 401, headers: { 'Content-Type': 'application/json' } });
                }

                try {
                    const ghRes = await originalFetch(`https://api.github.com/repos/${repo}/commits?per_page=15`, {
                        headers: {
                            'Accept': 'application/vnd.github+json',
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (!ghRes.ok) {
                        if (ghRes.status === 401 || ghRes.status === 403) {
                            if (window.top) delete window.top.github_pat;
                            return new Response(JSON.stringify({ error: 'GitHub access denied. Please reconnect.', expired: true }), { status: 401, headers: { 'Content-Type': 'application/json' } });
                        }
                        return new Response(JSON.stringify({ error: 'GitHub API error.' }), { status: ghRes.status, headers: { 'Content-Type': 'application/json' } });
                    }

                    const commits = await ghRes.json();
                    const simplified = commits.map(c => ({
                        sha: c.sha.substring(0, 7),
                        message: c.commit.message.split('\n')[0],
                        author: c.commit.author?.name || 'Unknown',
                        date: c.commit.author?.date,
                        url: c.html_url
                    }));

                    return new Response(JSON.stringify(simplified), { status: 200, headers: { 'Content-Type': 'application/json' } });
                } catch (err) {
                    return new Response(JSON.stringify({ error: 'Failed to fetch commits.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
                }
            }
        }
    }

    return originalFetch.apply(this, args);
};
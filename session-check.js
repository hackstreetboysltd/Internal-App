// /session-check.js
(function () {
    function isEmbedded() {
        return window.self !== window.top;
    }

    function isCrossOriginParent() {
        if (!isEmbedded()) return false;
        try {
            void window.parent.location.href;
            return false;
        } catch (e) {
            return true;
        }
    }

    function forwardToParent(level, ...args) {
        if (!isEmbedded() || isCrossOriginParent()) return;
        try {
            window.parent.console[level](...args);
        } catch (e) {
            // Cross-origin parent — cannot forward
        }
    }

    window.addEventListener('error', function (e) {
        const errorMsg = e.error ? (e.error.stack || e.error.message) : e.message;
        console.error("UNHANDLED ERROR IN IFRAME (" + window.location.pathname + "):", errorMsg);
        forwardToParent('error', "IFRAME ERROR (" + window.location.pathname + "):", errorMsg);
    });

    window.addEventListener('unhandledrejection', function (e) {
        const reason = e.reason ? (e.reason.stack || e.reason.message || e.reason) : "Unknown rejection";
        console.error("UNHANDLED PROMISE REJECTION IN IFRAME (" + window.location.pathname + "):", reason);
        forwardToParent('error', "IFRAME PROMISE REJECTION (" + window.location.pathname + "):", reason);
    });

    const originalConsoleError = console.error;
    console.error = function (...args) {
        originalConsoleError.apply(console, args);
        forwardToParent('error', "IFRAME CONSOLE.ERROR (" + window.location.pathname + "):", ...args);
    };

    const originalConsoleWarn = console.warn;
    console.warn = function (...args) {
        originalConsoleWarn.apply(console, args);
        forwardToParent('warn', "IFRAME CONSOLE.WARN (" + window.location.pathname + "):", ...args);
    };

    if (window.location.pathname.includes('login.html')) {
        return;
    }

    function getRootPath() {
        const parts = window.location.pathname.split('/');
        if (parts.length >= 2 && parts[1].toLowerCase() === 'internal-app') {
            return '/' + parts[1];
        }
        return '';
    }

    function clearSession() {
        window.sessionUser = null;
        sessionStorage.removeItem('sessionUser');
        sessionStorage.removeItem('activeModule');
        sessionStorage.removeItem('isAdminView');
    }

    function redirectToLogin() {
        clearSession();
        window.location.href = getRootPath() + '/login.html';
    }

    // Parse session from URL params in any context (top window or iframe)
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam) {
        try {
            window.sessionUser = JSON.parse(decodeURIComponent(sessionParam));
            sessionStorage.setItem('sessionUser', JSON.stringify(window.sessionUser));
            sessionStorage.removeItem('activeModule');
            sessionStorage.removeItem('isAdminView');
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error("Failed to parse session from URL:", e);
        }
    } else {
        const savedSession = sessionStorage.getItem('sessionUser');
        if (savedSession) {
            try {
                window.sessionUser = JSON.parse(savedSession);
            } catch (e) {
                console.error("Failed to parse session from sessionStorage:", e);
            }
        }
    }

    const session = window.sessionUser;
    const now = Date.now();

    if (!session || !session.expiry || now >= session.expiry) {
        redirectToLogin();
        return;
    }

    function verifyWhitelistAsync() {
        // Sessions provisioned by Testicon skip Internal-App email whitelist
        if (session && session.source === 'testicon') return;

        if (!window.FirebaseDB) {
            setTimeout(verifyWhitelistAsync, 100);
            return;
        }
        if (session && session.email) {
            fetch('/api/role_access')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        const allowedRec = data.find(r => r.id === 'allowed');
                        if (allowedRec) {
                            const allowedEmails = allowedRec.emails || [];
                            const normalized = allowedEmails.map(e => e.trim().toLowerCase());
                            if (!normalized.includes(session.email.trim().toLowerCase())) {
                                console.warn("User session is no longer in whitelist. Evicting.");
                                redirectToLogin();
                            }
                        }
                    }
                })
                .catch(err => console.warn("Failed to check whitelist in session check:", err));
        }
    }
    verifyWhitelistAsync();

    window.getSessionActor = function () {
        return {
            name: session ? (session.name || 'A Team Member') : 'A Team Member',
            email: session ? (session.email || '') : ''
        };
    };

    function secureNameFields() {
        const nameFields = [
            'termAuthor', 'editTermAuthor',
            'contribName', 'editSkillAuthor',
            'mAuthor', 'editMAuthor',
            'procAuthor', 'editProcAuthor',
            'editMsgAuthor',
            'userId',
            'evAuthor', 'editEvAuthor'
        ];

        nameFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.setProperty('display', 'none', 'important');
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) {
                    label.style.setProperty('display', 'none', 'important');
                }

                try {
                    Object.defineProperty(el, 'value', {
                        get: function () {
                            return session.name || 'Anonymous';
                        },
                        set: function () {},
                        configurable: true
                    });
                } catch (e) {
                    el.value = session.name || 'Anonymous';
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            secureNameFields();
            observeChanges();
        });
    } else {
        secureNameFields();
        observeChanges();
    }

    function observeChanges() {
        const observer = new MutationObserver(secureNameFields);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
})();

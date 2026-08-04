// /session-check.js
(function () {
    // Forward iframe errors to parent window console for debugging
    window.addEventListener('error', function (e) {
        const errorMsg = e.error ? (e.error.stack || e.error.message) : e.message;
        console.error("UNHANDLED ERROR IN IFRAME (" + window.location.pathname + "):", errorMsg);
        if (window.parent && window.parent !== window) {
            window.parent.console.error("IFRAME ERROR (" + window.location.pathname + "):", errorMsg);
        }
    });

    window.addEventListener('unhandledrejection', function (e) {
        const reason = e.reason ? (e.reason.stack || e.reason.message || e.reason) : "Unknown rejection";
        console.error("UNHANDLED PROMISE REJECTION IN IFRAME (" + window.location.pathname + "):", reason);
        if (window.parent && window.parent !== window) {
            window.parent.console.error("IFRAME PROMISE REJECTION (" + window.location.pathname + "):", reason);
        }
    });

    // Forward iframe console logs to parent window for debugging
    const originalConsoleError = console.error;
    console.error = function (...args) {
        originalConsoleError.apply(console, args);
        if (window.parent && window.parent !== window) {
            window.parent.console.error("IFRAME CONSOLE.ERROR (" + window.location.pathname + "):", ...args);
        }
    };

    const originalConsoleWarn = console.warn;
    console.warn = function (...args) {
        originalConsoleWarn.apply(console, args);
        if (window.parent && window.parent !== window) {
            window.parent.console.warn("IFRAME CONSOLE.WARN (" + window.location.pathname + "):", ...args);
        }
    };

    // If the path contains login.html, do nothing
    if (window.location.pathname.includes('login.html')) {
        return;
    }

    // Parse session from URL parameters if in top window
    if (window === window.top) {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionParam = urlParams.get('session');
        if (sessionParam) {
            try {
                window.sessionUser = JSON.parse(decodeURIComponent(sessionParam));
                sessionStorage.setItem('sessionUser', JSON.stringify(window.sessionUser));
                sessionStorage.removeItem('activeModule');
                sessionStorage.removeItem('isAdminView');
                // Clean URL params immediately
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
            } catch (e) {
                console.error("Failed to parse session from URL:", e);
            }
        } else {
            // Retrieve from sessionStorage on refresh
            const savedSession = sessionStorage.getItem('sessionUser');
            if (savedSession) {
                try {
                    window.sessionUser = JSON.parse(savedSession);
                } catch (e) {
                    console.error("Failed to parse session from sessionStorage:", e);
                }
            }
        }
    }

    const session = window.top.sessionUser;
    const now = Date.now();

    // If not logged in or expired, redirect to login
    if (!session || !session.expiry || now >= session.expiry) {
        window.top.sessionUser = null;
        sessionStorage.removeItem('sessionUser');
        sessionStorage.removeItem('activeModule');
        sessionStorage.removeItem('isAdminView');
        const rootPath = window.location.pathname.toLowerCase().startsWith('/internal-app') ? '/Internal-App' : '';
        if (window.self !== window.top) {
            window.top.location.href = rootPath + '/login.html';
        } else {
            window.location.href = rootPath + '/login.html';
        }
        return;
    }

    // Verify session user against role access whitelist asynchronously once firebase-init is active
    function verifyWhitelistAsync() {
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
                                window.top.sessionUser = null;
                                sessionStorage.removeItem('sessionUser');
                                sessionStorage.removeItem('activeModule');
                                sessionStorage.removeItem('isAdminView');
                                const rootPath = window.location.pathname.toLowerCase().startsWith('/internal-app') ? '/Internal-App' : '';
                                if (window.self !== window.top) {
                                    window.top.location.href = rootPath + '/login.html';
                                } else {
                                    window.location.href = rootPath + '/login.html';
                                }
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

    // Pre-populate and secure author/name fields
    function secureNameFields() {
        const nameFields = [
            'termAuthor', 'editTermAuthor', // glossary
            'contribName', 'editSkillAuthor', // skills
            'mAuthor', 'editMAuthor', // meetings and messages
            'procAuthor', 'editProcAuthor', // procedures
            'editMsgAuthor', // messages edit
            'userId', // goals
            'evAuthor', 'editEvAuthor' // calendar
        ];

        nameFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Hide input and label
                el.style.setProperty('display', 'none', 'important');
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) {
                    label.style.setProperty('display', 'none', 'important');
                }

                // Define immutable value getter for the input element
                try {
                    Object.defineProperty(el, 'value', {
                        get: function () {
                            return session.name || 'Anonymous';
                        },
                        set: function (val) {
                            // Do nothing so it cannot be cleared
                        },
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

// /app.js
const activeModules = new Map();

// Initialize admin view state from sessionStorage if present
window.isAdminView = sessionStorage.getItem('isAdminView') === 'true';

// Helper to set greeting based on local time
function setDynamicGreeting() {
    const greetingEl = document.getElementById('greeting');
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let text = "Welcome Back";
    if (hour < 12) {
        text = "Good Morning";
    } else if (hour < 18) {
        text = "Good Afternoon, Team";
    } else {
        text = "Good Evening";
    }
    greetingEl.innerHTML = `${text}`;
}

// Fetch stats for all modules from their physical json DBs
async function loadDashboardStats() {
    const modules = [
        { key: 'apps', elementId: 'statApps' },
        { key: 'messages', elementId: 'statMessages' },
        { key: 'calendar', elementId: 'statCalendar' },
        { key: 'goals', elementId: 'statGoals' },
        { key: 'skills', elementId: 'statSkills' },
        { key: 'procedures', elementId: 'statProcedures' },
        { key: 'profile', elementId: 'statProfile' }
    ];

    for (const mod of modules) {
        const el = document.getElementById(mod.elementId);
        if (!el) continue;

        try {
            const response = await fetch(`/api/${mod.key}`);
            if (!response.ok) throw new Error('API offline');
            const data = await response.json();

            if (mod.key === 'goals') {
                // For goals, show number of users with active goals in current week
                const uniqueUsers = new Set(data.map(item => item.user));
                el.textContent = uniqueUsers.size;
            } else if (mod.key === 'profile') {
                const session = window.sessionUser;
                if (session) {
                    el.textContent = session.name ? session.name.split(' ')[0] : 'Profile';
                } else {
                    el.textContent = 'View';
                }
            } else if (mod.key === 'messages') {
                const isAdmin = window.isAdminView === true;
                if (isAdmin) {
                    try {
                        const raRes = await fetch('/api/role_access');
                        if (raRes.ok) {
                            const raData = await raRes.json();
                            const allowedRec = raData.find(r => r.id === 'allowed');
                            el.textContent = allowedRec ? (allowedRec.emails || []).length : '0';
                        } else {
                            el.textContent = '0';
                        }
                    } catch (e) {
                        el.textContent = '0';
                    }
                } else {
                    el.textContent = data.length;
                }
            } else if (mod.key === 'calendar') {
                let meetingCount = 0;
                try {
                    const meetingRes = await fetch('/api/meetings');
                    if (meetingRes.ok) {
                        const meetingData = await meetingRes.json();
                        meetingCount = Array.isArray(meetingData) ? meetingData.length : 0;
                    }
                } catch (e) {
                    meetingCount = 0;
                }
                el.textContent = (Array.isArray(data) ? data.length : 0) + meetingCount;
            } else {
                el.textContent = data.length;
            }
        } catch (err) {
            // Fallback if server is not running
            console.warn(`Failed fetching dashboard stats for ${mod.key}:`, err);
            el.textContent = '0';
        }
    }
}

function setModuleChrome(isModuleOpen) {
    document.body.classList.toggle('module-open', !!isModuleOpen);
}

function loadModule(folderName, displayName) {
    if (folderName === 'meetings') {
        folderName = 'calendar';
        displayName = 'Calendar';
    }
    const iframe = document.getElementById('moduleFrame');
    const welcomeScreen = document.getElementById('welcomeScreen');

    welcomeScreen.style.display = 'none';
    iframe.style.display = 'block';
    setModuleChrome(true);

    const isAdmin = window.isAdminView === true;
    const folderPrefix = isAdmin ? 'admin_modules' : 'modules';
    
    const targetFolder = (isAdmin && folderName === 'messages') ? 'role-access' : folderName;
    const targetName = (isAdmin && folderName === 'messages') ? 'Role Access' : displayName;
    
    iframe.src = `${folderPrefix}/${targetFolder}/index.html`;

    activeModules.clear();
    activeModules.set(folderName, targetName);

    updateActiveBar(folderName);
    updateDockSelection(folderName);

    // Save active module to sessionStorage
    sessionStorage.setItem('activeModule', JSON.stringify({ folderName, displayName, isAdminView: window.isAdminView }));

    // Auto scroll content viewport to top when module loads (helpful on mobile)
    const viewport = document.querySelector('.content-viewport');
    if (viewport) viewport.scrollTop = 0;
}

// Function to go back to welcome screen dashboard
function showDashboard() {
    const iframe = document.getElementById('moduleFrame');
    const welcomeScreen = document.getElementById('welcomeScreen');

    iframe.style.display = 'none';
    iframe.src = '';
    welcomeScreen.style.display = 'block';
    setModuleChrome(false);

    activeModules.clear();
    updateActiveBar(null);
    updateDockSelection(null);
    sessionStorage.removeItem('activeModule'); // Clear saved active module
    loadDashboardStats(); // Refresh stats when returning
}

function updateActiveBar(_activeKey) {
    const listContainer = document.getElementById('activeList');
    // Keep the top bar clean — module title lives inside the module header
    listContainer.innerHTML = '';
}

// Expose for iframe close buttons
window.showDashboard = showDashboard;
window.loadModule = loadModule;

function updateDockSelection(folderName) {
    const buttons = document.querySelectorAll('.dock-item');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${folderName}'`)) {
            btn.classList.add('selected');
            // Ensure the active item is visible inside the scrolling mobile dock
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
            btn.classList.remove('selected');
        }
    });
}

// Bind logo click to returning to dashboard
document.querySelector('.logo').addEventListener('click', showDashboard);

// Global custom dialog modal
function showGlobalDialog({ title, message, type = 'info', confirmText = 'OK', showCancel = false }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('globalDialogModal');
        const iconEl = document.getElementById('globalDialogIcon');
        const titleEl = document.getElementById('globalDialogTitle');
        const msgEl = document.getElementById('globalDialogMessage');
        const cancelBtn = document.getElementById('globalDialogCancelBtn');
        const confirmBtn = document.getElementById('globalDialogConfirmBtn');

        if (!modal) return resolve(false);

        // Icon styling
        if (type === 'warning') {
            iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: #fb7185;"></i>';
            titleEl.style.color = '#fb7185';
        } else if (type === 'error') {
            iconEl.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>';
            titleEl.style.color = '#ef4444';
        } else if (type === 'success') {
            iconEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
            titleEl.style.color = '#10b981';
        } else {
            iconEl.innerHTML = '<i class="fa-solid fa-circle-info" style="color: #6366f1;"></i>';
            titleEl.style.color = '#6366f1';
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        confirmBtn.textContent = confirmText;

        if (type === 'warning' || type === 'error') {
            confirmBtn.style.background = '#fb7185';
        } else {
            confirmBtn.style.background = '#6366f1';
        }

        cancelBtn.style.display = showCancel ? 'block' : 'none';

        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);

        modal.style.display = 'flex';
    });
}

// Reset Session / Logout
async function handleLogout() {
    const confirmed = await showGlobalDialog({
        title: 'Confirm Logout',
        message: 'Are you sure you want to log out of your session?',
        type: 'warning',
        confirmText: 'Log Out',
        showCancel: true
    });
    if (confirmed) {
        window.sessionUser = null;
        sessionStorage.removeItem('sessionUser');
        sessionStorage.removeItem('activeModule');
        sessionStorage.removeItem('isAdminView');
        const rootPath = window.location.pathname.toLowerCase().startsWith('/internal-app') ? '/Internal-App' : '';
        window.location.href = rootPath + '/login.html';
    }
}

// Admin visibility and console UI sync
async function checkAdminVisibility() {
    const adminBtn = document.getElementById('adminToggleBtn');
    if (!adminBtn) return false;
    
    // Hide it by default until we check
    adminBtn.style.display = 'none';

    try {
        const session = window.sessionUser;
        if (!session) return false;
        const email = (session.email || '').trim().toLowerCase();

        const fetchAdmins = async () => {
            const res = await fetch('/api/role_access');
            if (!res.ok) throw new Error('API failed');
            const data = await res.json();
            const adminsRecord = data.find(r => r.id === 'admins');
            return adminsRecord ? adminsRecord.emails || [] : [];
        };

        let adminEmails = [];
        if (window.FirebaseDB) {
            adminEmails = await fetchAdmins();
        } else {
            await new Promise((resolve) => {
                const interval = setInterval(async () => {
                    if (window.FirebaseDB) {
                        clearInterval(interval);
                        try {
                            adminEmails = await fetchAdmins();
                            resolve();
                        } catch (e) {
                            resolve();
                        }
                    }
                }, 50);
                setTimeout(() => { clearInterval(interval); resolve(); }, 2000);
            });
        }
        
        const normalizedAdmins = adminEmails.map(e => e.trim().toLowerCase());
        
        if (normalizedAdmins.includes(email)) {
            adminBtn.style.display = 'flex';
            return true;
        } else {
            adminBtn.style.display = 'none';
            if (window.isAdminView === true) {
                window.isAdminView = false;
                sessionStorage.removeItem('isAdminView');
                syncAdminViewUI();
                updateAdminToggleBtnUI();
                showDashboard();
            }
            return false;
        }
    } catch (e) {
        console.warn('Failed to check admin visibility:', e);
        adminBtn.style.display = 'flex'; // fail-open
        return true;
    }
}

function syncAdminViewUI() {
    const isAdmin = window.isAdminView === true;
    
    const dockMessagesBtn = document.getElementById('dockMessagesBtn');
    const dashMessagesCard = document.getElementById('dashMessagesCard');
    
    if (dockMessagesBtn) {
        if (isAdmin) {
            dockMessagesBtn.setAttribute('onclick', "loadModule('messages', 'Role Access')");
            dockMessagesBtn.setAttribute('title', "Role Access Control");
            const icon = dockMessagesBtn.querySelector('i');
            if (icon) icon.className = "fa-solid fa-user-lock";
            const text = dockMessagesBtn.querySelector('.dock-label');
            if (text) text.textContent = "Role Access";
        } else {
            dockMessagesBtn.setAttribute('onclick', "loadModule('messages', 'Messages')");
            dockMessagesBtn.setAttribute('title', "Encrypted Messages");
            const icon = dockMessagesBtn.querySelector('i');
            if (icon) icon.className = "fa-solid fa-shield-halved";
            const text = dockMessagesBtn.querySelector('.dock-label');
            if (text) text.textContent = "Messages";
        }
    }
    
    if (dashMessagesCard) {
        if (isAdmin) {
            dashMessagesCard.setAttribute('onclick', "loadModule('messages', 'Role Access')");
            const iconWrap = dashMessagesCard.querySelector('.card-icon');
            if (iconWrap) {
                iconWrap.className = "card-icon role-access-color";
                iconWrap.innerHTML = '<i class="fa-solid fa-user-lock"></i>';
            }
            const text = dashMessagesCard.querySelector('.card-title');
            if (text) text.textContent = "Role Access";
        } else {
            dashMessagesCard.setAttribute('onclick', "loadModule('messages', 'Messages')");
            const iconWrap = dashMessagesCard.querySelector('.card-icon');
            if (iconWrap) {
                iconWrap.className = "card-icon messages-color";
                iconWrap.innerHTML = '<i class="fa-solid fa-shield-halved"></i>';
            }
            const text = dashMessagesCard.querySelector('.card-title');
            if (text) text.textContent = "Secure Messages";
        }
    }
}

// Admin portal toggle functions
window.toggleAdminPortal = function () {
    const isAdmin = window.isAdminView === true;
    const nextState = !isAdmin;
    window.isAdminView = nextState;
    sessionStorage.setItem('isAdminView', nextState);

    syncAdminViewUI();
    updateAdminToggleBtnUI();

    if (activeModules.size > 0) {
        const activeKey = Array.from(activeModules.keys())[0];
        let activeName = activeModules.get(activeKey);
        if (activeKey === 'messages') {
            activeName = nextState ? 'Role Access' : 'Messages';
        }
        loadModule(activeKey, activeName);
    } else {
        showDashboard();
    }
};

window.updateAdminToggleBtnUI = function () {
    const btn = document.getElementById('adminToggleBtn');
    if (!btn) return;

    const isAdmin = window.isAdminView === true;
    if (isAdmin) {
        btn.style.background = 'rgba(16, 185, 129, 0.15)';
        btn.style.color = '#10b981';
        btn.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        btn.title = 'Switch to User View';
        btn.innerHTML = '<i class="fa-solid fa-user-check"></i> <span id="adminToggleText">Admin Mode</span>';
    } else {
        btn.style.background = 'rgba(99, 102, 241, 0.1)';
        btn.style.color = '#6366f1';
        btn.style.borderColor = 'rgba(99, 102, 241, 0.2)';
        btn.title = 'Switch to Admin Console';
        btn.innerHTML = '<i class="fa-solid fa-user-shield"></i> <span id="adminToggleText">Admin View</span>';
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    setDynamicGreeting();
    const isUserAdmin = await checkAdminVisibility();
    syncAdminViewUI();
    updateAdminToggleBtnUI();
    loadDashboardStats();
    checkFirstTimeProfileSetup();

    // Restore active module if present
    const savedModuleStr = sessionStorage.getItem('activeModule');
    if (savedModuleStr) {
        try {
            const savedModule = JSON.parse(savedModuleStr);
            // If it is an admin module but the user is not an admin, don't load it
            if (savedModule.isAdminView && !isUserAdmin) {
                sessionStorage.removeItem('activeModule');
                showDashboard();
                return;
            }
            if (savedModule.isAdminView !== undefined) {
                window.isAdminView = savedModule.isAdminView;
                syncAdminViewUI();
                updateAdminToggleBtnUI();
            }
            loadModule(savedModule.folderName, savedModule.displayName);
        } catch (e) {
            console.error("Failed to restore active module from sessionStorage:", e);
        }
    }
});

// Check if the user is logging in for the first time after being approved, and force profile customization
async function checkFirstTimeProfileSetup() {
    if (!window.FirebaseDB) {
        setTimeout(checkFirstTimeProfileSetup, 100);
        return;
    }
    
    const session = window.sessionUser;
    if (!session || !session.email) return;
    
    try {
        const res = await fetch('/api/profile');
        if (res.ok) {
            const profiles = await res.json();
            const myProfile = profiles.find(p => p.email && p.email.toLowerCase() === session.email.toLowerCase());
            if (myProfile) {
                // If they are approved but haven't finished setting up their profile, open the setup modal
                if (myProfile.approvedStatus === 'approved' && myProfile.isProfileSetupComplete !== true) {
                    document.getElementById('setupRole').value = '';
                    document.getElementById('setupDept').value = '';
                    document.getElementById('setupBio').value = '';
                    
                    const modal = document.getElementById('firstTimeSetupModal');
                    if (modal) {
                        modal.style.display = 'flex';
                        // Prevent closure by clicking background
                        modal.onclick = (e) => {
                            if (e.target === modal) {
                                e.stopPropagation();
                            }
                        };
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Failed to verify profile setup status:', e);
    }
}

// Save customization inputs from the setup modal
window.saveFirstTimeSetup = async function (e) {
    e.preventDefault();
    const role = document.getElementById('setupRole').value.trim();
    const dept = document.getElementById('setupDept').value.trim();
    const bio = document.getElementById('setupBio').value.trim();
    
    const session = window.sessionUser;
    if (!session || !session.email) return;
    
    try {
        const res = await fetch('/api/profile');
        if (!res.ok) throw new Error('Failed to retrieve profiles');
        let profiles = await res.json();
        if (!Array.isArray(profiles)) profiles = [];
        
        const idx = profiles.findIndex(p => p.email && p.email.toLowerCase() === session.email.toLowerCase());
        if (idx !== -1) {
            profiles[idx].role = role;
            profiles[idx].department = dept;
            profiles[idx].bio = bio;
            profiles[idx].isProfileSetupComplete = true; // Setup finalized
            
            // Save back to db
            await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profiles)
            });
            
            // Update session storage details synchronously
            session.role = role;
            session.department = dept;
            window.sessionUser = session;
            sessionStorage.setItem('sessionUser', JSON.stringify(session));
            
            // Hide Setup overlay
            const modal = document.getElementById('firstTimeSetupModal');
            if (modal) modal.style.display = 'none';
            
            // Refresh counts
            loadDashboardStats();
            
            alert('Your profile has been saved successfully. Welcome to HackstreetBoys!');
        }
    } catch (err) {
        console.error('Failed to finalize first-time setup:', err);
        alert('Could not update profile details. Please try again.');
    }
};
// admin_modules/role-access/app.js

let allowedEmails = [];
let adminEmails = [];
let currentUser = null;

// Initialize — called only after window.FirebaseDB is ready
async function init() {
    // Get session
    currentUser = window.top ? window.top.sessionUser : null;
    if (!currentUser) {
        window.location.href = '../../login.html';
        return;
    }

    await loadRoleAccess();
}

// Fetch lists from Firebase via the intercepted fetch
async function loadRoleAccess() {
    const loader = document.getElementById('roleAccessLoader');
    const content = document.getElementById('roleAccessContent');
    if (loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    try {
        const response = await fetch('/api/role_access');
        if (!response.ok) throw new Error('Failed to load role access configuration');
        const data = await response.json();
        
        if (Array.isArray(data)) {
            const allowedRec = data.find(r => r.id === 'allowed');
            const adminsRec = data.find(r => r.id === 'admins');
            
            allowedEmails = allowedRec ? allowedRec.emails || [] : [];
            adminEmails = adminsRec ? adminsRec.emails || [] : [];
        }
    } catch (err) {
        console.warn('Could not load role access, starting fresh.', err);
        allowedEmails = [];
        adminEmails = [];
    }

    renderLists();

    } finally {
        if (loader && content) {
            loader.style.display = 'none';
            content.style.display = '';
        }
    }
}

// Render the allowed logins and admin visibility lists
function renderLists() {
    // Counters
    document.getElementById('allowedCount').textContent = allowedEmails.length;
    document.getElementById('adminCount').textContent = adminEmails.length;

    // Render Allowed Logins list
    const allowedContainer = document.getElementById('allowedEmailsList');
    allowedContainer.innerHTML = '';
    
    if (allowedEmails.length === 0) {
        allowedContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-envelope"></i>
                <p>No organization emails authorized.</p>
            </div>
        `;
    } else {
        allowedEmails.forEach(email => {
            const div = document.createElement('div');
            div.className = 'email-item';
            div.innerHTML = `
                <span class="email-text">${escapeHtml(email)}</span>
                <button onclick="removeEmail('allowed', '${escapeJs(email)}')" class="action-trash-btn" title="Revoke Login Access">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            allowedContainer.appendChild(div);
        });
    }

    // Render Admin Nav Visibility list
    const adminsContainer = document.getElementById('adminEmailsList');
    adminsContainer.innerHTML = '';
    
    if (adminEmails.length === 0) {
        adminsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-user-shield"></i>
                <p>No admin console emails authorized.</p>
            </div>
        `;
    } else {
        adminEmails.forEach(email => {
            const isMe = email.toLowerCase() === currentUser.email.toLowerCase();
            const meTag = isMe ? ' <span class="badge active" style="font-size: 0.65rem; padding: 1px 4px; border-radius: 4px; margin-left: 4px;">You</span>' : '';
            const div = document.createElement('div');
            div.className = 'email-item';
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <span class="email-text">${escapeHtml(email)}</span>
                    ${meTag}
                </div>
                <button onclick="removeEmail('admins', '${escapeJs(email)}')" class="action-trash-btn" title="Revoke Admin Access">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            adminsContainer.appendChild(div);
        });
    }

    // Notify parent dashboard to update stats if necessary
    if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
        window.parent.loadDashboardStats();
    }
}

// Add an email to allowed or admin lists
async function addEmail(type) {
    const inputEl = document.getElementById(type === 'allowed' ? 'allowedEmailInput' : 'adminEmailInput');
    const email = inputEl.value.trim().toLowerCase();

    if (!email) return;
    
    // Quick regex email check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showCustomDialog({
            title: 'Invalid Email',
            message: 'Please enter a valid email address.',
            type: 'warning'
        });
        return;
    }

    if (type === 'allowed') {
        if (allowedEmails.includes(email)) {
            showCustomDialog({
                title: 'Duplicate Email',
                message: 'This email is already allowed.',
                type: 'info'
            });
            return;
        }
        allowedEmails.push(email);
    } else {
        if (adminEmails.includes(email)) {
            showCustomDialog({
                title: 'Duplicate Email',
                message: 'This email already has admin console access.',
                type: 'info'
            });
            return;
        }
        adminEmails.push(email);
        
        // Auto-add to allowed logins list if not already there, for convenience
        if (!allowedEmails.includes(email)) {
            allowedEmails.push(email);
        }
    }

    inputEl.value = '';
    await saveRoleAccess();
    renderLists();
}

// Remove an email from allowed or admin lists
async function removeEmail(type, email) {
    const isMe = email.toLowerCase() === currentUser.email.toLowerCase();
    let confirmed = false;
    
    if (type === 'admins' && isMe) {
        confirmed = await showCustomDialog({
            title: 'Revoke Self Access',
            message: 'WARNING: You are about to revoke your own admin console access. \n\n' +
                     'If you proceed, you will be redirected to the User View and will not be able to return to this screen without another admin authorizing your email. \n\n' +
                     'Are you absolutely sure you want to do this?',
            type: 'warning',
            confirmText: 'Revoke Access',
            showCancel: true
        });
    } else {
        confirmed = await showCustomDialog({
            title: 'Revoke Access',
            message: `Are you sure you want to revoke access for ${email}?`,
            type: 'warning',
            confirmText: 'Revoke',
            showCancel: true
        });
    }

    if (!confirmed) return;

    if (type === 'allowed') {
        allowedEmails = allowedEmails.filter(e => e.toLowerCase() !== email.toLowerCase());
        // Also remove from admin list if they can no longer log in
        adminEmails = adminEmails.filter(e => e.toLowerCase() !== email.toLowerCase());
    } else {
        adminEmails = adminEmails.filter(e => e.toLowerCase() !== email.toLowerCase());
    }

    await saveRoleAccess();
    renderLists();

    // If I just revoked my own admin access, redirect immediately!
    if (type === 'admins' && isMe) {
        if (window.parent && typeof window.parent.toggleAdminPortal === 'function') {
            window.parent.location.reload(); // reload parent to trigger session and toggle checks
        } else {
            window.location.reload();
        }
    }
}

// Persist the lists to Firebase
async function saveRoleAccess() {
    try {
        const payload = [
            { id: 'allowed', emails: allowedEmails },
            { id: 'admins', emails: adminEmails }
        ];

        const response = await fetch('/api/role_access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Save failed');
    } catch (err) {
        console.error('Error saving role access configuration:', err);
        showCustomDialog({
            title: 'Save Error',
            message: 'Failed to save configuration to database.',
            type: 'error'
        });
    }
}

// Helpers
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\')
              .replace(/'/g, "\\'")
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r');
}

function showCustomDialog({ title, message, type = 'info', confirmText = 'OK', showCancel = false }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customDialogModal');
        const iconEl = document.getElementById('dialogIcon');
        const titleEl = document.getElementById('dialogTitle');
        const msgEl = document.getElementById('dialogMessage');
        const cancelBtn = document.getElementById('dialogCancelBtn');
        const confirmBtn = document.getElementById('dialogConfirmBtn');

        // Set Icon
        if (type === 'warning') {
            iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: #fbbf24;"></i>';
            titleEl.style.color = '#fbbf24';
        } else if (type === 'error') {
            iconEl.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>';
            titleEl.style.color = '#ef4444';
        } else if (type === 'success') {
            iconEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
            titleEl.style.color = '#10b981';
        } else {
            iconEl.innerHTML = '<i class="fa-solid fa-circle-info" style="color: #818cf8;"></i>';
            titleEl.style.color = '#818cf8';
        }

        // Set content
        titleEl.textContent = title;
        msgEl.textContent = message;
        confirmBtn.textContent = confirmText;

        // Custom Confirm Styling
        if (type === 'warning' || type === 'error') {
            confirmBtn.style.background = '#ef4444';
        } else {
            confirmBtn.style.background = 'var(--accent)';
        }

        // Show/Hide Cancel
        cancelBtn.style.display = showCancel ? 'block' : 'none';

        // Event handlers
        const cleanup = () => {
            modal.classList.remove('show');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
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

        // Open Modal
        modal.style.display = 'flex';
        modal.offsetHeight; // trigger reflow
        modal.classList.add('show');
    });
}

// Wait for window.FirebaseDB to override window.fetch
function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        init();
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
waitForFirebaseAndStart();

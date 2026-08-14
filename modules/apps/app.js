// modules/apps/app.js
const API_URL = '/api/apps';

async function getApps() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Network issue');
        return await response.json();
    } catch (e) {
        console.error('Error loading apps:', e);
        return [];
    }
}

async function saveApps(apps) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apps)
        });
        if (!response.ok) throw new Error('Network issue');
        await renderApps();
        // Trigger dashboard stats update in parent window if available
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving apps:', e);
        alert('Failed to save data to physical database server.');
    }
}

// ---- Rich text editor helpers ----

// Very small allow-list sanitizer: strips any tag not in the allow-list
// and strips all attributes except href on <a>. Runs on save, not on every
// keystroke, so it doesn't fight the user while they're typing.
function sanitizeHtml(html) {
    const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'DIV', 'A', 'P', 'SPAN']);
    const template = document.createElement('template');
    template.innerHTML = html;

    const walk = (node) => {
        [...node.childNodes].forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE) {
                if (!allowedTags.has(child.tagName)) {
                    // Unwrap disallowed tags but keep their text/children
                    while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
                    child.parentNode.removeChild(child);
                    return;
                }
                [...child.attributes].forEach(attr => {
                    if (!(child.tagName === 'A' && attr.name === 'href')) {
                        child.removeAttribute(attr.name);
                    }
                });
                walk(child);
            }
        });
    };
    walk(template.content);
    return template.innerHTML.trim();
}

function getEditorHtml(id) {
    const el = document.getElementById(id);
    return sanitizeHtml(el.innerHTML);
}

function setEditorHtml(id, html) {
    document.getElementById(id).innerHTML = html || '';
}

function stripHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return (template.content.textContent || '').trim();
}

// Wire up all toolbars once the DOM is ready
function initRichTextToolbars() {
    document.querySelectorAll('.rte-toolbar').forEach(toolbar => {
        const targetId = toolbar.dataset.target;
        toolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
            btn.addEventListener('click', () => {
                const editor = document.getElementById(targetId);
                editor.focus();
                const cmd = btn.dataset.cmd;
                if (cmd === 'createLink') {
                    const url = prompt('Enter URL:', 'https://');
                    if (!url) return;
                    document.execCommand('createLink', false, url);
                } else {
                    document.execCommand(cmd, false, null);
                }
            });
        });
    });
}

async function addApp() {
    const name = document.getElementById('appName').value.trim();
    const desc = getEditorHtml('appDesc');
    const githubRepo = document.getElementById('appGithubRepo').value.trim();

    if (!name || !desc) return alert('Name and description are required');

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const apps = await getApps();
    const newApp = {
        id: Date.now(),
        name,
        desc,
        tickets: [],
        githubRepo: githubRepo || null,
        author: actor.name
    };

    apps.push(newApp);
    await saveApps(apps);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: name,
        module: 'Apps',
        excludeEmail: actor.email
    });

    document.getElementById('appName').value = '';
    setEditorHtml('appDesc', '');
    document.getElementById('appGithubRepo').value = '';

    closeModal();
}

async function deleteApp(appId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const apps = await getApps();
    const deletedApp = apps.find(a => a.id === appId);
    if (deletedApp && deletedApp.author && deletedApp.author.toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only delete applications you added.");
        return;
    }
    if (!confirm('Are you sure you want to remove this application from the directory?')) return;

    const filteredApps = apps.filter(a => a.id !== appId);
    await saveApps(filteredApps);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedApp ? deletedApp.name : 'an app',
        module: 'Apps',
        excludeEmail: actor.email
    });
}

// Open the edit modal and populate it with the selected app's data
window.editApp = async function (appId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const apps = await getApps();
    const app = apps.find(a => a.id === appId);
    if (!app) return alert('App not found');
    if (app.author && app.author.toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only edit applications you added.");
        return;
    }

    document.getElementById('editAppId').value = app.id;
    document.getElementById('editAppName').value = app.name;
    setEditorHtml('editAppDesc', app.desc);
    document.getElementById('editAppGithubRepo').value = app.githubRepo || '';

    openEditModal();
};

// Persist edits made in the edit modal
window.saveEditApp = async function () {
    const id = Number(document.getElementById('editAppId').value);
    const name = document.getElementById('editAppName').value.trim();
    const desc = getEditorHtml('editAppDesc');
    const githubRepo = document.getElementById('editAppGithubRepo').value.trim();

    if (!name || !desc) return alert('Name and description are required');

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const apps = await getApps();
    const appIndex = apps.findIndex(a => a.id === id);
    if (appIndex === -1) return alert('App not found');
    if (apps[appIndex].author && apps[appIndex].author.toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only edit applications you added.");
        return;
    }

    apps[appIndex].name = name;
    apps[appIndex].desc = desc;
    apps[appIndex].githubRepo = githubRepo || null;

    await saveApps(apps);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'edited',
        actorName: actor.name,
        itemName: name,
        module: 'Apps',
        excludeEmail: actor.email
    });

    closeEditModal();
};

// Refresh function for top right refresh button
window.refreshApps = async function () {
    const icon = document.querySelector('.header-container .refresh-btn i');
    if (icon) {
        icon.classList.add('fa-spin');
    }
    try {
        await renderApps();
    } catch (e) {
        console.error('Error during manual apps refresh:', e);
    } finally {
        if (icon) {
            setTimeout(() => {
                icon.classList.remove('fa-spin');
            }, 500);
        }
    }
};

async function renderApps() {
    const loader = document.getElementById('appsLoader');
    const content = document.getElementById('appsContent');
    if (loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    const container = document.getElementById('appList');
    if (!container) return;

    container.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; padding:30px;"></div>';

    const apps = await getApps();
    const searchQuery = (document.getElementById('searchApps')?.value || '').toLowerCase().trim();

    // Filter apps based on search query (search plain text, not markup)
    const filteredApps = apps.filter(app =>
        app.name.toLowerCase().includes(searchQuery) ||
        stripHtml(app.desc).toLowerCase().includes(searchQuery)
    );

    container.innerHTML = '';

    if (filteredApps.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <p>${searchQuery ? 'No applications match your search query.' : 'No apps registered yet. Click "Add New App" to get started.'}</p>
            </div>
        `;
        return;
    }

    filteredApps.forEach(app => {
        const card = document.createElement('div');
        card.className = 'card clickable-card';
        card.onclick = () => {
            window.location.href = `detail.html?id=${app.id}`;
        };

        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
        const isOwner = !app.author || app.author.toLowerCase() === actor.name.toLowerCase();
        const actionButtons = isOwner ? `
            <div>
              <button class="secondary-btn" style="padding:6px 10px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(68, 239, 68, 0.1); color:#44ef44; border: 1px solid rgba(239, 239, 68, 0.2); transition: all 0.2s;" onclick="event.stopPropagation(); editApp(${app.id})">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="secondary-btn" style="padding:6px 10px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239, 68, 68, 0.1); color:#ef4444; border: 1px solid rgba(239, 68, 68, 0.2); transition: all 0.2s;" onclick="event.stopPropagation(); deleteApp(${app.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
        ` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0;">
                <h4 style="margin:0; display:flex; align-items:center; gap:8px;">
                    ${app.name}
                </h4>
                ${actionButtons}
            </div>
            <p style="margin-bottom:16px; color:#cbd5e1; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; min-height: 4.5em;">${stripHtml(app.desc)}</p>
        `;
        container.appendChild(card);
    });

    } finally {
        if (loader && content) {
            loader.style.display = 'none';
            content.style.display = '';
        }
    }
}

// Register modal functions
window.openModal = function () {
    const modal = document.getElementById('registerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
};

window.closeModal = function () {
    const modal = document.getElementById('registerModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Edit modal functions
window.openEditModal = function () {
    const modal = document.getElementById('editModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
};

window.closeEditModal = function () {
    const modal = document.getElementById('editModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Close modal when clicking outside of it
window.onclick = function (event) {
    const registerModal = document.getElementById('registerModal');
    const editModal = document.getElementById('editModal');
    if (event.target === registerModal) {
        closeModal();
    }
    if (event.target === editModal) {
        closeEditModal();
    }
};

function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        initRichTextToolbars();
        renderApps();
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);
// modules/apps/detail.js
const API_URL = '/api/apps';
const GITHUB_COMMITS_API = '/api/github-commits';
let currentApp = null;
let appId = null;

// Parse appId from query parameter
function parseQueryId() {
    const urlParams = new URLSearchParams(window.location.search);
    appId = parseInt(urlParams.get('id'), 10);
}

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
        // Trigger dashboard stats update in parent window if available
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving apps:', e);
        alert('Failed to save data to physical database server.');
    }
}

async function loadAppDetail() {
    const loader = document.getElementById('detailLoader');
    const content = document.getElementById('detailContent');
    if (loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    const apps = await getApps();
    currentApp = apps.find(a => a.id === appId);

    if (!currentApp) {
        document.querySelector('.container').innerHTML = `
            <a href="index.html" class="back-link">
                 Back to Directory
            </a>
            <div class="empty-state" style="margin-top: 40px;">
                
                <p>Application not found. It may have been deleted.</p>
            </div>
        `;
        return;
    }

    renderAppDetail();

    } finally {
        if (loader && content) {
            loader.style.display = 'none';
            content.style.display = '';
        }
    }
}

function renderAppDetail() {
    // Header
    const nameEl = document.getElementById('appNameHeader');
    if (nameEl) {
        nameEl.innerHTML = `<a href="index.html"></a> <h2 style="margin: 0 auto;">${currentApp.name}</h2>`;
    }

    // Description Tab
    const descEl = document.getElementById('appDescriptionText');
    if (descEl) {
        descEl.innerHTML = currentApp.desc;
    }

    // GitHub Commits Tab Setup
    const commitsCard = document.getElementById('githubCommitsCard');
    if (commitsCard) {
        commitsCard.style.display = 'block';
        if (currentApp.githubRepo) {
            loadGithubCommits();
        } else {
            // Render a clean fallback message if no repo is linked
            const container = document.getElementById('githubCommitsContainer');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state" style="border: none; background: transparent; padding: 20px 0;">
                        
                        <p style="margin: 0; color: #6b7280; font-style: italic;">No GitHub repository linked to this application yet.</p>
                    </div>`;
            }
        }
    }

    // Tickets Tab
    const ticketsContainer = document.getElementById('ticketsContainer');
    if (ticketsContainer) {
        const openTickets = currentApp.tickets.filter(t => t.status === 'Open').length;
        const totalTickets = currentApp.tickets.length;

        if (totalTickets === 0) {
            ticketsContainer.innerHTML = `<p style="font-size:0.95rem; color:#6b7280; font-style:italic; margin:0; padding: 10px 0;">No support tickets filed.</p>`;
        } else {
            const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
            ticketsContainer.innerHTML = `
                <div style="margin-bottom: 12px; font-size: 0.85rem; color: #9ca3af;">
                    <span class="badge ${openTickets > 0 ? 'danger' : 'success'}">
                        ${openTickets} Open / ${totalTickets} Total
                    </span>
                </div>
                <ul style="list-style:none; padding:0; margin:0;">
                    ${currentApp.tickets.map(t => {
                        const isOwner = !t.author || t.author.toLowerCase() === actor.name.toLowerCase();
                        const badgeStyle = isOwner ? 'cursor:pointer;' : 'cursor:not-allowed; opacity: 0.6;';
                        const clickHandler = isOwner ? `onclick="handleToggleTicket(${t.id})"` : '';
                        return `
                            <li style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.15); padding:10px 14px; border-radius:8px; margin-bottom:8px; font-size:0.9rem; border: 1px solid rgba(255, 255, 255, 0.03);">
                                <span style="text-decoration: ${t.status === 'Resolved' ? 'line-through' : 'none'}; color: ${t.status === 'Resolved' ? '#6b7280' : '#d1d5db'}">
                                    ${t.text} <span style="font-size:0.75rem; color:#6b7280;">(${t.author || 'Anonymous'})</span>
                                </span>
                                <span class="badge ${t.status === 'Resolved' ? 'success' : 'danger'}" style="${badgeStyle} user-select: none;" ${clickHandler} title="${isOwner ? 'Click to toggle status' : 'You can only toggle tickets you created'}">
                                    ${t.status}
                                </span>
                            </li>
                        `;
                    }).join('')}
                </ul>
            `;
        }
    }
}


// async function handleAddChangelog() {
//     const text = prompt('Enter new changelog entry:');
//     if (!text || !text.trim()) return;

//     const apps = await getApps();
//     const app = apps.find(a => a.id === appId);
//     if (app) {
//         if (!app.changelogs) app.changelogs = [];
//         app.changelogs.push(text.trim());
//         await saveApps(apps);
//         currentApp = app;
//         renderAppDetail();
//     }
// }

async function handleFileTicket() {
    const text = prompt('Enter support ticket description:');
    if (!text || !text.trim()) return;

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const apps = await getApps();
    const app = apps.find(a => a.id === appId);
    if (app) {
        if (!app.tickets) app.tickets = [];
        app.tickets.push({ id: Date.now(), text: text.trim(), status: 'Open', author: actor.name });
        await saveApps(apps);
        currentApp = app;
        renderAppDetail();
    }
}

async function handleToggleTicket(ticketId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const apps = await getApps();
    const app = apps.find(a => a.id === appId);
    if (app) {
        const ticket = app.tickets.find(t => t.id === ticketId);
        if (ticket) {
            if (ticket.author && ticket.author.toLowerCase() !== actor.name.toLowerCase()) {
                alert("Permission Denied: You can only toggle support tickets you created.");
                return;
            }
            ticket.status = ticket.status === 'Open' ? 'Resolved' : 'Open';
            await saveApps(apps);
            currentApp = app;
            renderAppDetail();
        }
    }
}

async function loadGithubCommits() {
    const container = document.getElementById('githubCommitsContainer');
    if (!container || !currentApp.githubRepo) return;

    container.innerHTML = `<div style="text-align:center; padding:20px;"></div>`;

    // Check GitHub OAuth status before attempting fetch
    let status = { configured: false, connected: false };
    try {
        const sr = await fetch('/api/github-oauth/status');
        if (sr.ok) status = await sr.json();
    } catch(e) {}

    if (!status.connected) {
        const expiredMsg = status.configured
            ? ''
            : '<p style="font-size:0.85rem; color:#9ca3af; margin-bottom:14px;">Connect your GitHub account to view commit history.</p>';

        container.innerHTML = `
            <div style="text-align:center; padding:16px 0;">
                
                ${expiredMsg}
                <button
                    id="githubConnectBtn"
                    onclick="openGithubConnect()"
                    style="
                        width:max-content; display:inline-flex; align-items:center; gap:8px;
                        background:#24292e; color:#fff;
                        border:none; border-radius:100px;
                        padding:10px 20px; font-size:0.9rem; font-weight:500;
                        cursor:pointer; transition:background 0.2s;
                    "
                    onmouseover="this.style.background='#1a1e22'"
                    onmouseout="this.style.background='#24292e'"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                    ${status.configured ? 'Reconnect GitHub' : 'Connect GitHub'}
                </button>
            </div>`;
        return;
    }

    // Token is valid — fetch commits
    try {
        const res = await fetch(`${GITHUB_COMMITS_API}?repo=${encodeURIComponent(currentApp.githubRepo)}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (err.expired) {
                // Token was revoked server-side; re-render connect UI
                loadGithubCommits();
                return;
            }
            container.innerHTML = `<p style="color:#ef4444; font-size:0.9rem; margin:0;"> ${err.error || 'Could not load commits.'}</p>`;
            return;
        }

        const commits = await res.json();
        if (!commits.length) {
            container.innerHTML = `<p style="color:#6b7280; font-style:italic; margin:0;">No commits found.</p>`;
            return;
        }

        container.innerHTML = `
            <ul style="list-style:none; padding:0; margin:0;">
                ${commits.map(c => `
                    <li style="padding:10px 14px; background:rgba(0,0,0,0.15); border-radius:8px; margin-bottom:8px; border: 1px solid rgba(255,255,255,0.03);">
                        <div style="display:flex; justify-content:space-between; gap:12px;">
                            <span style="color:#d1d5db; font-size:0.9rem;">${escapeHtml(c.message)}</span>
                            <a href="${c.url}" target="_blank" rel="noopener noreferrer" style="color:#818cf8; font-size:0.8rem; text-decoration:none; white-space:nowrap;">
                                 ${c.sha}
                            </a>
                        </div>
                        <div style="font-size:0.75rem; color:#6b7280; margin-top:4px;">
                            ${escapeHtml(c.author)} · ${c.date ? new Date(c.date).toLocaleDateString() : ''}
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    } catch (e) {
        console.error('Error loading commits:', e);
        container.innerHTML = `<p style="color:#ef4444; font-size:0.9rem; margin:0;">Failed to load commits.</p>`;
    }
}

function openGithubConnect() {
    const w = 500, h = 640;
    const left = Math.round((screen.width / 2) - (w / 2));
    const top  = Math.round((screen.height / 2) - (h / 2));
    window.open('../../github-connect.html', 'GithubConnect',
        `width=${w},height=${h},top=${top},left=${left},scrollbars=no,resizable=no`);
}

// When the popup completes OAuth, reload commits automatically
window.addEventListener('message', (event) => {
    if (event.data?.type === 'GITHUB_CONNECTED') {
        loadGithubCommits();
    }
});

window.handleRefreshCommits = function () {
    loadGithubCommits();
};

// Basic escaping since commit messages come from an external API (GitHub)
// and are inserted via innerHTML — treat them as untrusted text.
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

window.switchDetailTab = function (tabName) {
    const tabs = ['description', 'changelogs', 'tickets'];
    tabs.forEach(t => {
        const contentEl = document.getElementById(`tab-${t}`);
        if (contentEl) {
            contentEl.style.display = t === tabName ? 'block' : 'none';
        }
    });

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${tabName}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    parseQueryId();
    loadAppDetail();
});
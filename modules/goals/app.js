// modules/goals/app.js
const API_URL = '/api/goals';

// Inject custom dialog styles
if (!document.getElementById('custom-dialog-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'custom-dialog-styles';
    styleEl.textContent = `
        .custom-dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.75);
            backdrop-filter: blur(8px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100000;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .custom-dialog-overlay.show {
            opacity: 1;
        }
        .custom-dialog-box {
            background: #0f172a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            border-radius: 12px;
            width: 90%;
            max-width: 400px;
            padding: 20px;
            box-sizing: border-box;
            transform: scale(0.9);
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .custom-dialog-overlay.show .custom-dialog-box {
            transform: scale(1);
        }
        .custom-dialog-header {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .custom-dialog-icon {
            font-size: 1.3rem;
            color: #fb7185;
        }
        .custom-dialog-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: white;
            margin: 0;
        }
        .custom-dialog-body {
            font-size: 0.9rem;
            color: #cbd5e1;
            line-height: 1.5;
            margin: 0;
        }
        .custom-dialog-footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 10px;
        }
        .custom-dialog-btn {
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid transparent;
            margin-bottom: 0;
            width: auto;
            box-shadow: none;
        }
        .custom-dialog-btn-primary {
            background: #fb7185;
            color: white;
            border-color: #fb7185;
        }
        .custom-dialog-btn-primary:hover {
            background: #f43f5e;
            transform: translateY(-1px);
        }
        .custom-dialog-btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            border-color: rgba(255, 255, 255, 0.1);
            color: #cbd5e1;
        }
        .custom-dialog-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
        }
    `;
    document.head.appendChild(styleEl);
}

window.showAlert = function (title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-dialog-overlay';
        overlay.innerHTML = `
            <div class="custom-dialog-box">
                <div class="custom-dialog-header">
                    <i class="fa-solid fa-triangle-exclamation custom-dialog-icon"></i>
                    <h4 class="custom-dialog-title">${title}</h4>
                </div>
                <div class="custom-dialog-body">${message}</div>
                <div class="custom-dialog-footer">
                    <button class="custom-dialog-btn custom-dialog-btn-primary">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        setTimeout(() => overlay.classList.add('show'), 10);

        const okBtn = overlay.querySelector('.custom-dialog-btn-primary');
        okBtn.focus();
        okBtn.addEventListener('click', () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 200);
        });
    });
};

window.showConfirm = function (title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-dialog-overlay';
        overlay.innerHTML = `
            <div class="custom-dialog-box">
                <div class="custom-dialog-header">
                    <i class="fa-solid fa-circle-question custom-dialog-icon" style="color: #fb7185;"></i>
                    <h4 class="custom-dialog-title">${title}</h4>
                </div>
                <div class="custom-dialog-body">${message}</div>
                <div class="custom-dialog-footer">
                    <button class="custom-dialog-btn custom-dialog-btn-secondary">Cancel</button>
                    <button class="custom-dialog-btn custom-dialog-btn-primary">Yes</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        setTimeout(() => overlay.classList.add('show'), 10);

        const yesBtn = overlay.querySelector('.custom-dialog-btn-primary');
        const cancelBtn = overlay.querySelector('.custom-dialog-btn-secondary');

        yesBtn.addEventListener('click', () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                resolve(true);
            }, 200);
        });

        cancelBtn.addEventListener('click', () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                resolve(false);
            }, 200);
        });
    });
};

// Pagination & State variables
let viewingRecordId = null;
let cachedGoals = null;
let cachedAppsList = []; // stores digital suite app list for mentions tagging
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;

async function getGoals(forceRefresh = false) {
    if (cachedGoals && !forceRefresh) {
        return cachedGoals;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API issue');
        cachedGoals = await response.json();
        return cachedGoals;
    } catch (e) {
        console.error('Error fetching goals:', e);
        return [];
    }
}

// Fetches registered suite application profiles
async function fetchDigitalSuiteApps() {
    try {
        const res = await fetch('/api/apps');
        if (res.ok) {
            cachedAppsList = await res.json();
            cachedAppsList.sort((a, b) => b.name.length - a.name.length);
        }
    } catch (e) {
        console.error('Failed to load apps directory for tagging matching:', e);
    }
}

async function saveGoals(data) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('API issue');
        cachedGoals = null; // Clear local cache
        await render(true); // Force fresh render
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving goals:', e);
        await showAlert('Error', 'Failed to save goals data to the server.');
    }
}

async function saveWeeklyGoals() {
    const user = document.getElementById('userId').value.trim();
    const goalsArray = getGoalsFromList('goalsList');

    if (!user) {
        await showAlert('Validation Error', 'Please enter your name/username.');
        return;
    }
    if (goalsArray.length === 0) {
        await showAlert('Validation Error', 'Please enter at least 1 goal for this week.');
        return;
    }
    if (goalsArray.length > 15) {
        await showAlert('Validation Error', 'A maximum of 15 goals is allowed.');
        return;
    }

    const currentDB = await getGoals();

    // Capture scope selection
    const scopeElement = document.querySelector('input[name="goalScope"]:checked');
    const scope = scopeElement ? scopeElement.value : 'personal';

    const record = {
        id: Date.now(),
        user,
        goals: goalsArray.map(g => ({ text: g, done: false })),
        weekId: getWeekIdentifier(new Date()),
        scope: scope
    };

    currentDB.push(record);
    await saveGoals(currentDB);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `weekly goals for ${user}`,
        module: 'Goals',
        excludeEmail: actor.email
    });

    // Reset inputs
    document.getElementById('userId').value = '';
    document.getElementById('goalsList').innerHTML = '';

    closeGoalModal();
}

async function toggleGoal(recordId, goalIndex) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const data = await getGoals();
    const item = data.find(r => r.id === recordId);
    if (item) {
        const itemUser = (item.user && typeof item.user === 'string') ? item.user.toLowerCase() : '';
        const actorName = (actor.name && typeof actor.name === 'string') ? actor.name.toLowerCase() : '';
        if (itemUser === '' || itemUser !== actorName) {
            await showAlert("Permission Denied", "You can only modify your own goals.");
            return;
        }
        item.goals[goalIndex].done = !item.goals[goalIndex].done;
        await saveGoals(data);
    }
}

async function deleteRecord(recordId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const data = await getGoals(true);
    const deletedRecord = data.find(r => r.id === recordId);
    const deletedUser = (deletedRecord && deletedRecord.user && typeof deletedRecord.user === 'string') ? deletedRecord.user.toLowerCase() : '';
    const actorName = (actor.name && typeof actor.name === 'string') ? actor.name.toLowerCase() : '';
    if (deletedRecord && (deletedUser === '' || deletedUser !== actorName)) {
        await showAlert("Permission Denied", "You can only delete your own goals.");
        return;
    }
    const confirmed = await showConfirm('Confirm Delete', 'Are you sure you want to delete this goals commitment card?');
    if (!confirmed) return;
    const filtered = data.filter(r => r.id !== recordId);
    if (viewingRecordId === recordId) {
        closeGoalsViewModal();
    }
    await saveGoals(filtered);

    // Broadcast email notification to all team members
    const deletedPeriod = deletedRecord ? (deletedRecord.periodId || deletedRecord.weekId || 'Target') : 'Target';
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedRecord ? `${deletedRecord.user || 'User'}'s goals (${deletedPeriod})` : 'a goals record',
        module: 'Goals',
        excludeEmail: actor.email
    });
}

function getWeekIdentifier(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${weekNo}`;
}

// Navigation controllers
window.changeMainPage = function (direction) {
    currentPage += direction;
    render();
};

window.changeLeaderboardPage = function (direction) {
    currentLeaderboardPage += direction;
    render();
};

// Refresh function for the top right refresh button
window.refreshGoals = async function () {
    const icon = document.querySelector('.header-container .refresh-btn i');
    if (icon) {
        icon.classList.add('fa-spin');
    }
    try {
        await render(true);
    } catch (e) {
        console.error('Error during manual refresh:', e);
    } finally {
        if (icon) {
            // Leave spin class on briefly for visual feedback
            setTimeout(() => {
                icon.classList.remove('fa-spin');
            }, 500);
        }
    }
};

async function render(forceRefresh = false) {
    const container = document.getElementById('goalsHistory');
    const leaderboardContainer = document.getElementById('leaderboard');
    const mainPaginationContainer = document.getElementById('mainPagination');
    const lbPaginationContainer = document.getElementById('leaderboardPagination');

    if (!container || !leaderboardContainer) return;

    const loader = document.getElementById('goalsWheelLoader');
    const content = document.getElementById('goalsWheelContent');
    const shouldShowLoader = !cachedGoals || forceRefresh;

    if (shouldShowLoader && loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }



    const data = await getGoals(forceRefresh);
    const searchQuery = (document.getElementById('searchGoals')?.value || '').toLowerCase().trim();

    // Reset pagination to Page 1 if query text changes
    if (searchQuery !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = searchQuery;
    }

    const filterDropdown = document.getElementById('goalFilterDropdown');
    const filterValue = filterDropdown ? filterDropdown.value : 'all';
    const timeDropdown = document.getElementById('goalTimeDropdown');
    const timeValue = timeDropdown ? timeDropdown.value : 'ongoing';

    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const currentUserName = (actor.name || '').toLowerCase().trim();

    // Filter commitments based on search query, ownership, and time/status
    const filteredData = data.filter(record => {
        const recordUser = (record.user && typeof record.user === 'string') ? record.user.toLowerCase().trim() : '';
        const isOwn = recordUser === currentUserName;
        const isGlobal = record.scope === 'global';

        if (filterValue === 'all') {
            if (!isOwn && !isGlobal) {
                return false;
            }
        } else if (filterValue === 'personal') {
            if (!isOwn || isGlobal) {
                return false;
            }
        }

        if (timeValue === 'ongoing') {
            const hasOngoing = record.goals && record.goals.some(g => !g.done);
            if (!hasOngoing) {
                return false;
            }
        }

        let type = record.type;
        if (!type) {
            if (record.weekId) type = 'weekly';
            else type = 'annual';
        } else if (type === 'short-term') {
            type = 'weekly';
        } else if (type === 'long-term') {
            type = 'annual';
        }
        const resolvedPeriod = record.periodId || record.weekId || 'Target';
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

        const userMatch = (record.user && typeof record.user === 'string') ? record.user.toLowerCase().includes(searchQuery) : false;
        const goalMatch = (record.goals && Array.isArray(record.goals)) ? record.goals.some(g => g && g.text && typeof g.text === 'string' && g.text.toLowerCase().includes(searchQuery)) : false;
        const weekMatch = (resolvedPeriod && typeof resolvedPeriod === 'string') ? resolvedPeriod.toLowerCase().includes(searchQuery) : false;
        const typeMatch = (capitalizedType && typeof capitalizedType === 'string') ? capitalizedType.toLowerCase().includes(searchQuery) : false;
        const titleMatch = (record.title && typeof record.title === 'string') ? record.title.toLowerCase().includes(searchQuery) : false;
        return userMatch || goalMatch || weekMatch || typeMatch || titleMatch;
    });

    container.innerHTML = '';
    leaderboardContainer.innerHTML = '';

    // Handle History pagination parameters
    const totalCount = filteredData.length;
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
        currentPage = maxPage;
    }

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const sortedData = [...filteredData].sort((a, b) => b.id - a.id);
    const paginatedData = sortedData.slice(startIdx, endIdx);

    // Render History
    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <p>${searchQuery ? 'No commitments match your search query.' : 'No goals logged yet. Click "New Goals" to get started.'}</p>
            </div>
        `;
        if (mainPaginationContainer) mainPaginationContainer.innerHTML = '';
    } else {
        paginatedData.forEach(record => {
            let type = record.type;
            if (!type) {
                if (record.weekId) type = 'weekly';
                else type = 'annual';
            } else if (type === 'short-term') {
                type = 'weekly';
            } else if (type === 'long-term') {
                type = 'annual';
            }

            const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
            const showTitle = ['annual', 'quarterly', 'monthly'].includes(type);
            const recordEmail = (record.email && typeof record.email === 'string')
                ? record.email.trim().toLowerCase()
                : '';

            const totalGoalsCount = record.goals.length || 1;
            const completedCount = record.goals.filter(g => g.done).length;
            const pct = Math.round((completedCount / totalGoalsCount) * 100);

            const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
            const recordUser = (record.user && typeof record.user === 'string') ? record.user.toLowerCase() : '';
            const actorName = (actor.name && typeof actor.name === 'string') ? actor.name.toLowerCase() : '';
            const isOwner = recordUser !== '' && recordUser === actorName;
            const deleteBtn = isOwner ? `
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteRecord(${record.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : '';

            const card = document.createElement('div');
            card.className = 'card accordion-card';
            card.style.cursor = 'pointer';
            card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
            card.style.transition = 'all 0.2s ease';
            card.setAttribute('onclick', `openGoalsViewModal(${record.id})`);

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding: 2px;">
                    <strong style="font-size: 0.85rem; display: flex; align-items: center; gap: 4px; color:#9ca3af;">
                        <span>${capitalizedType} • ${recordEmail || record.user || 'Unknown'}</span>
                    </strong>
                    ${deleteBtn}
                </div>
                ${showTitle && record.title ? `<div style="padding: 2px; color: white; font-size: 0.9rem; font-weight: 600; margin: 4px 0;">${formatGoalText(record.title)}</div>` : ''}
                <div class="infographics-bar" style="margin: 4px 0; height: 6px;">
                    <div class="infographics-fill" style="width: ${pct}%"></div>
                </div>
                <p style="font-size:0.75rem; color:#9ca3af; margin:0; font-weight:500; padding: 2px;">
                     ${completedCount}/${record.goals.length} completed (${pct}%)
                </p>
            `;
            container.appendChild(card);
        });

        // Render Main History Pagination
        if (mainPaginationContainer) {
            const startRange = startIdx + 1;
            const endRange = Math.min(endIdx, totalCount);
            const prevDisabled = currentPage === 1;
            const nextDisabled = endIdx >= totalCount;

            mainPaginationContainer.innerHTML = `
                <span>${startRange}-${endRange} of ${totalCount}</span>
                <div style="display: flex; gap: 6px;">
                    <button onclick="changeMainPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <button onclick="changeMainPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }
    }

    // Compute Leaderboard
    if (data.length === 0) {
        leaderboardContainer.innerHTML = `<p style="font-size:0.9rem; color:#6b7280; font-style:italic; margin:0; text-align:center;">No data logged</p>`;
        if (lbPaginationContainer) lbPaginationContainer.innerHTML = '';
        if (loader && content) {
            loader.style.display = 'none';
            content.style.display = 'flex';
        }
        return;
    }

    const userStats = {};
    data.forEach(r => {
        if (!userStats[r.user]) userStats[r.user] = { attempted: 0, completed: 0 };
        userStats[r.user].attempted += r.goals.length;
        userStats[r.user].completed += r.goals.filter(g => g.done).length;
    });

    const sortedUsers = Object.entries(userStats).sort((a, b) => b[1].completed - a[1].completed);
    const totalLbCount = sortedUsers.length;

    // Leaderboard page constraint
    const maxLbPage = Math.max(1, Math.ceil(totalLbCount / LEADERBOARD_ITEMS_PER_PAGE));
    if (currentLeaderboardPage > maxLbPage) {
        currentLeaderboardPage = maxLbPage;
    }

    const lbStartIdx = (currentLeaderboardPage - 1) * LEADERBOARD_ITEMS_PER_PAGE;
    const lbEndIdx = lbStartIdx + LEADERBOARD_ITEMS_PER_PAGE;
    const paginatedLbUsers = sortedUsers.slice(lbStartIdx, lbEndIdx);

    paginatedLbUsers.forEach(([username, stats], relativeIdx) => {
        const absoluteIdx = lbStartIdx + relativeIdx;
        const pct = Math.round((stats.completed / stats.attempted) * 100 || 0);
        let rankBadge = '';

        if (absoluteIdx === 0) {
            rankBadge = '';
        } else if (absoluteIdx === 1) {
            rankBadge = '';
        } else if (absoluteIdx === 2) {
            rankBadge = '';
        } else {
            rankBadge = `<span style="color:#6b7280; font-weight:bold; font-size:0.9rem; width:16px; text-align:center; display:inline-block;">${absoluteIdx + 1}</span>`;
        }

        const entry = document.createElement('div');
        entry.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(0,0,0,0.15); border-radius:10px; border:1px solid rgba(255,255,255,0.03);";
        entry.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                ${rankBadge}
                <strong style="color:white; font-size:0.95rem;">${username}</strong>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.9rem; font-weight:600; color:#10b981;">${pct}% Met</div>
                <div style="font-size:0.75rem; color:#6b7280;">${stats.completed}/${stats.attempted} goals</div>
            </div>
        `;
        leaderboardContainer.appendChild(entry);
    });

    // Render Leaderboard Pagination controls
    if (lbPaginationContainer) {
        const startRange = lbStartIdx + 1;
        const endRange = Math.min(lbEndIdx, totalLbCount);
        const prevDisabled = currentLeaderboardPage === 1;
        const nextDisabled = lbEndIdx >= totalLbCount;

        lbPaginationContainer.innerHTML = `
            <span>${startRange}-${endRange} of ${totalLbCount}</span>
            <div style="display: flex; gap: 6px;">
                <button onclick="changeLeaderboardPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button onclick="changeLeaderboardPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    // Render interactive circular goal wheel
    renderGoalWheel(data);

    if (loader && content) {
        loader.style.display = 'none';
        content.style.display = 'flex';
    }
}

// Modal handling functions - Goal Modal
window.openGoalModal = function () {
    const modal = document.getElementById('goalModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeGoalModal = function () {
    const modal = document.getElementById('goalModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Leaderboard Modal
window.openLeaderboardModal = function () {
    const modal = document.getElementById('leaderboardModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeLeaderboardModal = function () {
    const modal = document.getElementById('leaderboardModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Goals View Modal
window.openGoalsViewModal = function (recordId) {
    viewingRecordId = recordId;
    const modal = document.getElementById('goalsViewModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
    renderGoalsViewContent();
};

window.closeGoalsViewModal = function () {
    const modal = document.getElementById('goalsViewModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        viewingRecordId = null;
    }, 300);
};

// Formats user input to colorize tagging text elements in purple
function formatGoalText(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    // Matches tags case-insensitively and replaces them with database-capitalized strings styled in purple
    if (cachedAppsList && cachedAppsList.length > 0) {
        cachedAppsList.forEach(app => {
            const regex = new RegExp(`(<span[^>]*>[^<]*</span>)|@${escapeRegExp(app.name)}\\b`, 'gi');
            escaped = escaped.replace(regex, (match, p1) => {
                if (p1) return p1;
                return `<span style="color: #c084fc; font-weight: 600;">@${app.name}</span>`;
            });
        });
    }
    return escaped;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// Sub-render function to display specific goals of the viewing card inside modal
async function renderGoalsViewContent() {
    if (!viewingRecordId) return;
    const data = await getGoals();
    const record = data.find(r => r.id === viewingRecordId);
    if (!record) {
        closeGoalsViewModal();
        return;
    }

    const titleElem = document.getElementById('goalsViewTitle');
    const metaElem = document.getElementById('goalsViewMeta');
    const listElem = document.getElementById('goalsViewList');

    if (titleElem) {
        titleElem.innerHTML = ` ${record.user}'s Goals`;
    }

    const totalGoalsCount = record.goals.length || 1;
    const completedCount = record.goals.filter(g => g.done).length;
    const pct = Math.round((completedCount / totalGoalsCount) * 100);

    if (metaElem) {
        let type = record.type;
        if (!type) {
            if (record.weekId) type = 'weekly';
            else type = 'annual';
        } else if (type === 'short-term') {
            type = 'weekly';
        } else if (type === 'long-term') {
            type = 'annual';
        }
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
        const recordEmail = (record.email && typeof record.email === 'string')
            ? record.email.trim().toLowerCase()
            : '';

        metaElem.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 6px; align-items: center;">
                <span style="display: flex; align-items: center; gap: 4px;">
                    <span>${capitalizedType} • ${recordEmail || record.user || 'Unknown'}</span>
                </span>
                <span><strong>${completedCount} of ${record.goals.length} completed (${pct}%)</strong></span>
            </div>
            ${record.title ? `<div style="font-size: 0.9rem; color: #cbd5e1; font-weight: 500; margin-bottom: 8px;">${formatGoalText(record.title)}</div>` : ''}
            <div class="infographics-bar" style="margin: 4px 0; height: 8px;">
                <div class="infographics-fill" style="width: ${pct}%"></div>
            </div>
        `;
    }

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const recordUser = (record.user && typeof record.user === 'string') ? record.user.toLowerCase() : '';
    const actorName = (actor.name && typeof actor.name === 'string') ? actor.name.toLowerCase() : '';
    const isOwner = recordUser !== '' && recordUser === actorName;

    if (listElem) {
        const timeDropdown = document.getElementById('goalTimeDropdown');
        const timeValue = timeDropdown ? timeDropdown.value : 'ongoing';

        const filteredGoals = record.goals.map((g, idx) => ({ ...g, originalIndex: idx }))
            .filter(g => {
                if (timeValue === 'ongoing' && g.done) return false;
                return true;
            });

        listElem.innerHTML = filteredGoals.map((g) => `
            <div class="goal-item-row" style="margin-bottom: 4px; padding: 10px 12px; display: flex; align-items: center;">
                <input type="checkbox" class="goal-checkbox" style="width:16px; height:16px; margin-right:12px;" ${g.done ? 'checked' : ''} ${isOwner ? '' : 'disabled'} onchange="toggleGoalInModal(${record.id}, ${g.originalIndex})">
                <span style="font-size:0.9rem; transition:all 0.2s; text-decoration: ${g.done ? 'line-through' : 'none'}; color: ${g.done ? '#6b7280' : '#d1d5db'}">
                    ${formatGoalText(g.text)}
                </span>
            </div>
        `).join('');
    }
}

// Checkbox handler specifically within the viewing modal
window.toggleGoalInModal = async function (recordId, goalIndex) {
    await toggleGoal(recordId, goalIndex);
    renderGoalsViewContent(); // Update modal immediately
};

// Close modals when user clicks outside of the active container boundary
window.onclick = function (event) {
    const goalModal = document.getElementById('goalModal');
    const leaderboardModal = document.getElementById('leaderboardModal');
    const goalsViewModal = document.getElementById('goalsViewModal');
    if (event.target === goalModal) {
        closeGoalModal();
    }
    if (event.target === leaderboardModal) {
        closeLeaderboardModal();
    }
    if (event.target === goalsViewModal) {
        closeGoalsViewModal();
    }
};

async function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        await fetchDigitalSuiteApps(); // fetch apps directory first
        render(true);

        // Initialize sortable
        const goalsList = document.getElementById('goalsList');
        if (goalsList && typeof Sortable !== 'undefined') {
            new Sortable(goalsList, {
                animation: 150,
                handle: '.drag-handle'
            });
        }
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);

// Interactive dynamic goal list adder utilities
window.addGoalItemUI = async function (listId, inputId) {
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if (!text) return;

    const list = document.getElementById(listId);
    if (list.querySelectorAll('li').length >= 15) {
        await showAlert('Validation Error', 'You can set a maximum of 15 goals.');
        return;
    }

    const li = createGoalListItem(text);
    list.appendChild(li);
    input.value = '';
};

window.createGoalListItem = function (text) {
    const li = document.createElement('li');
    li.className = 'goal-item';
    li.innerHTML = `
        <i class="fa-solid fa-grip-vertical drag-handle"></i>
        <span class="goal-content">${text}</span>
        <div class="goal-actions">
            <button type="button" class="goal-btn" onclick="editGoalUI(this)"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="goal-btn" onclick="this.closest('li').remove()"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    return li;
};

window.editGoalUI = function (btn) {
    const li = btn.closest('li');
    const span = li.querySelector('.goal-content');
    const currentText = span.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'goal-input';
    input.value = currentText;

    span.replaceWith(input);
    input.focus();

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'goal-btn';
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';

    const actions = li.querySelector('.goal-actions');
    const editBtn = actions.querySelector('.fa-pen').closest('button');

    // Replace edit btn with save btn
    editBtn.replaceWith(saveBtn);

    const save = () => {
        const newSpan = document.createElement('span');
        newSpan.className = 'goal-content';
        newSpan.textContent = input.value.trim() || currentText;
        input.replaceWith(newSpan);

        const newEditBtn = document.createElement('button');
        newEditBtn.type = 'button';
        newEditBtn.className = 'goal-btn';
        newEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        newEditBtn.onclick = function () { editGoalUI(this); };
        saveBtn.replaceWith(newEditBtn);
    };

    saveBtn.onclick = save;
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            save();
        }
    });
};

function getGoalsFromList(listId) {
    const list = document.getElementById(listId);
    const goals = [];
    list.querySelectorAll('li').forEach(li => {
        const span = li.querySelector('.goal-content');
        if (span) {
            goals.push(span.textContent.trim());
        } else {
            const input = li.querySelector('.goal-input');
            if (input) goals.push(input.value.trim());
        }
    });
    return goals.filter(g => g.length > 0);
}

// Interactive Concentric Circular Sunburst Chart Helpers

let selectedGoalKey = null;
let cycleTimer = null;
let currentCycleTier = 'annual';
let currentCycleIndex = 0;
let cycleIntervalTime = 5000;
let isHoveringGoal = false;
let wheelActiveRecords = {};

function getCurrentPeriods() {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    const weekId = getWeekIdentifier(now);
    
    return {
        annual: `${year}`,
        quarterly: `${year}-Q${quarter}`,
        monthly: `${year}-M${month}`,
        weekly: weekId,
        daily: now.toISOString().split('T')[0]
    };
}

function showHoverInfo(item) {
    const defaultInfo = document.getElementById('wheelDefaultInfo');
    const activeInfo = document.getElementById('wheelActiveInfo');
    const activeGoalBadge = document.getElementById('activeGoalBadge');
    const activeGoalTitle = document.getElementById('activeGoalTitle');
    const activeGoalUser = document.getElementById('activeGoalUser');
    const activeGoalPeriod = document.getElementById('activeGoalPeriod');
    const activeGoalStatus = document.getElementById('activeGoalStatus');
    const activeGoalViewBtn = document.getElementById('activeGoalViewBtn');
    
    if (!defaultInfo || !activeInfo) return;
    defaultInfo.style.display = 'none';
    activeInfo.style.display = 'flex';
    
    const tiers = [
        { type: 'annual', label: 'Annual', color: '#fb7185' },
        { type: 'quarterly', label: 'Quarterly', color: '#6366f1' },
        { type: 'monthly', label: 'Monthly', color: '#a855f7' },
        { type: 'weekly', label: 'Weekly', color: '#06b6d4' },
        { type: 'daily', label: 'Daily', color: '#10b981' }
    ];
    const tier = tiers.find(t => t.type === item.type);
    
    if (activeGoalBadge) {
        activeGoalBadge.innerText = tier ? tier.label : item.type.toUpperCase();
        activeGoalBadge.style.background = tier ? `${tier.color}22` : 'rgba(255,255,255,0.08)';
        activeGoalBadge.style.color = tier ? tier.color : '#cbd5e1';
        activeGoalBadge.style.borderColor = tier ? `${tier.color}44` : 'rgba(255,255,255,0.1)';
    }
    
    if (activeGoalTitle) {
        activeGoalTitle.innerHTML = formatGoalText(item.text);
    }
    
    if (activeGoalUser) {
        if (item.placeholder) {
            activeGoalUser.style.display = 'none';
            activeGoalUser.innerText = '';
        } else {
            const itemType = item.type
                ? item.type.charAt(0).toUpperCase() + item.type.slice(1)
                : 'Goal';
            const itemEmail = (item.email && typeof item.email === 'string')
                ? item.email.trim().toLowerCase()
                : '';
            activeGoalUser.innerText = `${itemType} • ${itemEmail || item.user || 'Unknown'}`;
            activeGoalUser.style.display = 'block';
        }
    }
    
    if (activeGoalPeriod) {
        activeGoalPeriod.style.display = 'none';
        activeGoalPeriod.innerText = '';
    }
    
    if (activeGoalStatus) {
        if (item.placeholder) {
            activeGoalStatus.style.display = 'block';
            activeGoalStatus.innerHTML = `<span style="color: #6b7280; font-style: italic;"><i class="fa-solid fa-circle-exclamation"></i> No goals set</span>`;
        } else {
            activeGoalStatus.style.display = 'none';
            activeGoalStatus.innerHTML = '';
        }
    }
    
    if (activeGoalViewBtn) {
        if (item.placeholder) {
            activeGoalViewBtn.style.display = 'none';
        } else {
            activeGoalViewBtn.style.display = 'inline-block';
            activeGoalViewBtn.onclick = () => {
                window.location.href = `all-goals.html?tab=${item.type}`;
            };
        }
    }
}

function resetHoverInfo() {
    const defaultInfo = document.getElementById('wheelDefaultInfo');
    const activeInfo = document.getElementById('wheelActiveInfo');
    if (!defaultInfo || !activeInfo) return;
    defaultInfo.style.display = 'block';
    activeInfo.style.display = 'none';
}

function restoreCycleDisplay() {
    if (isHoveringGoal) return;
    const items = wheelActiveRecords[currentCycleTier] || [];
    if (items.length > 0) {
        const idx = (currentCycleIndex - 1 + items.length) % items.length;
        showHoverInfo(items[idx]);
    } else {
        resetHoverInfo();
    }
}

function runCycleStep() {
    if (cycleTimer) {
        clearTimeout(cycleTimer);
    }
    
    let items = wheelActiveRecords[currentCycleTier] || [];
    if (items.length === 0) {
        const tiersOrder = ['annual', 'quarterly', 'monthly', 'weekly', 'daily'];
        for (const tier of tiersOrder) {
            if ((wheelActiveRecords[tier] || []).length > 0) {
                currentCycleTier = tier;
                currentCycleIndex = 0;
                items = wheelActiveRecords[tier];
                break;
            }
        }
    }
    
    if (items.length === 0) {
        resetHoverInfo();
        cycleTimer = setTimeout(runCycleStep, 5000);
        return;
    }
    
    if (currentCycleIndex >= items.length) {
        currentCycleIndex = 0;
    }
    
    const item = items[currentCycleIndex];
    if (!isHoveringGoal) {
        showHoverInfo(item);
    }
    
    currentCycleIndex = (currentCycleIndex + 1) % items.length;
    cycleTimer = setTimeout(runCycleStep, cycleIntervalTime);
}

function renderGoalWheel(data) {
    const svg = document.getElementById('goalWheelSvg');
    if (!svg) return;
    
    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const currentUserName = (actor.name || '').toLowerCase();
    
    const currentPeriods = getCurrentPeriods();
    
    // Tiers definition (outward to inward)
    const tiers = [
        { type: 'annual', label: 'Annual', color: '#fb7185', innerRadius: 160, outerRadius: 190 },
        { type: 'quarterly', label: 'Quarterly', color: '#6366f1', innerRadius: 130, outerRadius: 155 },
        { type: 'monthly', label: 'Monthly', color: '#a855f7', innerRadius: 100, outerRadius: 125 },
        { type: 'weekly', label: 'Weekly', color: '#06b6d4', innerRadius: 70, outerRadius: 95 },
        { type: 'daily', label: 'Daily', color: '#10b981', innerRadius: 40, outerRadius: 65 }
    ];
    
    const activeRecords = {};
    const filterDropdown = document.getElementById('goalFilterDropdown');
    const filterValue = filterDropdown ? filterDropdown.value : 'all';
    const timeDropdown = document.getElementById('goalTimeDropdown');
    const timeValue = timeDropdown ? timeDropdown.value : 'ongoing';

    tiers.forEach(tier => {
        const matching = data.filter(record => {
            let recType = record.type;
            if (!recType) {
                if (record.weekId) recType = 'weekly';
                else recType = 'annual';
            } else if (recType === 'short-term') {
                recType = 'weekly';
            } else if (recType === 'long-term') {
                recType = 'annual';
            }
            
            if (recType !== tier.type) return false;

            const recordUser = (record.user && typeof record.user === 'string') ? record.user.toLowerCase().trim() : '';
            const trimmedCurrentUser = currentUserName.trim();
            const isOwn = recordUser === trimmedCurrentUser;
            const isGlobal = record.scope === 'global';

            if (filterValue === 'all') {
                if (!isOwn && !isGlobal) {
                    return false;
                }
            } else if (filterValue === 'personal') {
                if (!isOwn || isGlobal) {
                    return false;
                }
            }

            return true;
        });
        
        let goalsList = [];
        matching.forEach(record => {
            if (record.goals && Array.isArray(record.goals)) {
                record.goals.forEach((g, idx) => {
                    if (timeValue === 'ongoing' && g.done) {
                        return;
                    }
                    goalsList.push({
                        recordId: record.id,
                        goalIndex: idx,
                        text: g.text,
                        done: !!g.done,
                        type: tier.type,
                        periodId: record.periodId || record.weekId,
                        title: record.title || '',
                        user: record.user,
                        email: record.email || ''
                    });
                });
            }
        });
        activeRecords[tier.type] = goalsList;
    });
    
    // Update global reference
    wheelActiveRecords = activeRecords;
    
    // Start or adjust cycling engine
    if (!cycleTimer) {
        currentCycleTier = 'annual';
        currentCycleIndex = 0;
        cycleIntervalTime = 5000;
        runCycleStep();
    } else {
        const items = wheelActiveRecords[currentCycleTier] || [];
        if (items.length === 0) {
            const tiersOrder = ['annual', 'quarterly', 'monthly', 'weekly', 'daily'];
            for (const tier of tiersOrder) {
                if ((wheelActiveRecords[tier] || []).length > 0) {
                    currentCycleTier = tier;
                    currentCycleIndex = 0;
                    break;
                }
            }
        }
    }
    
    svg.innerHTML = '';
    
    let totalGoals = 0;
    let completedGoals = 0;
    
    function getArcPath(cx, cy, r_in, r_out, startAngle, endAngle) {
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        
        const x1_out = cx + r_out * Math.cos(startRad);
        const y1_out = cy + r_out * Math.sin(startRad);
        const x2_out = cx + r_out * Math.cos(endRad);
        const y2_out = cy + r_out * Math.sin(endRad);
        
        const x1_in = cx + r_in * Math.cos(endRad);
        const y1_in = cy + r_in * Math.sin(endRad);
        const x2_in = cx + r_in * Math.cos(startRad);
        const y2_in = cy + r_in * Math.sin(startRad);
        
        const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
        
        return [
            `M ${x1_out} ${y1_out}`,
            `A ${r_out} ${r_out} 0 ${largeArcFlag} 1 ${x2_out} ${y2_out}`,
            `L ${x1_in} ${y1_in}`,
            `A ${r_in} ${r_in} 0 ${largeArcFlag} 0 ${x2_in} ${y2_in}`,
            `Z`
        ].join(' ');
    }
    
    tiers.forEach(tier => {
        const items = activeRecords[tier.type];
        const numItems = items.length;
        
        totalGoals += numItems;
        completedGoals += items.filter(i => i.done).length;
        
        if (numItems === 0) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', getArcPath(200, 200, tier.innerRadius, tier.outerRadius, 0, 359.99));
            path.setAttribute('fill', 'rgba(255, 255, 255, 0.03)');
            path.setAttribute('stroke', 'rgba(255, 255, 255, 0.05)');
            path.setAttribute('stroke-width', '1');
            path.style.cursor = 'default';
            
            path.addEventListener('mouseover', () => {
                isHoveringGoal = true;
                showHoverInfo({
                    type: tier.type,
                    label: tier.label,
                    text: `No commitments set for the ${tier.label} tier.`,
                    periodId: '',
                    placeholder: true
                });
            });
            path.addEventListener('mouseout', () => {
                isHoveringGoal = false;
                restoreCycleDisplay();
            });
            
            svg.appendChild(path);
        } else {
            const angleStep = 360 / numItems;
            const padAngle = numItems > 1 ? 2.5 : 0;
            
            items.forEach((item, index) => {
                const startAngle = index * angleStep + padAngle / 2;
                const endAngle = (index + 1) * angleStep - padAngle / 2;
                
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', getArcPath(200, 200, tier.innerRadius, tier.outerRadius, startAngle, endAngle));
                
                const baseColor = tier.color;
                const fillOpacity = item.done ? '0.8' : '0.12';
                const strokeColor = item.done ? baseColor : 'rgba(255, 255, 255, 0.15)';
                const strokeWidth = item.done ? '1.5' : '1';
                
                path.setAttribute('fill', baseColor);
                path.setAttribute('fill-opacity', fillOpacity);
                path.setAttribute('stroke', strokeColor);
                if (!item.done) {
                    path.setAttribute('stroke-dasharray', '3,3');
                }
                path.setAttribute('stroke-width', strokeWidth);
                path.style.cursor = 'pointer';
                path.style.transition = 'all 0.2s ease-in-out';
                
                path.addEventListener('mouseover', () => {
                    path.setAttribute('fill-opacity', item.done ? '0.95' : '0.4');
                    path.setAttribute('stroke-width', '2.5');
                    isHoveringGoal = true;
                    showHoverInfo(item);
                });
                
                path.addEventListener('mouseout', () => {
                    path.setAttribute('fill-opacity', fillOpacity);
                    path.setAttribute('stroke-width', strokeWidth);
                    isHoveringGoal = false;
                    restoreCycleDisplay();
                });
                
                path.addEventListener('click', () => {
                    const tierItems = wheelActiveRecords[item.type] || [];
                    const clickedIdx = tierItems.findIndex(it => it.recordId === item.recordId && it.goalIndex === item.goalIndex);
                    
                    if (clickedIdx !== -1) {
                        currentCycleTier = item.type;
                        currentCycleIndex = (clickedIdx + 1) % tierItems.length;
                        cycleIntervalTime = 10000; // 10 seconds
                        
                        isHoveringGoal = false;
                        showHoverInfo(item);
                        
                        if (cycleTimer) {
                            clearTimeout(cycleTimer);
                        }
                        cycleTimer = setTimeout(runCycleStep, 10000);
                    }
                });
                
                svg.appendChild(path);
            });
        }
    });
    
    const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerCircle.setAttribute('cx', '200');
    centerCircle.setAttribute('cy', '200');
    centerCircle.setAttribute('r', '32');
    centerCircle.setAttribute('fill', '#0f172a');
    centerCircle.setAttribute('stroke', 'rgba(255, 255, 255, 0.1)');
    centerCircle.setAttribute('stroke-width', '2');
    svg.appendChild(centerCircle);
    
    const pctVal = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
    const centerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    centerText.setAttribute('x', '200');
    centerText.setAttribute('y', '204');
    centerText.setAttribute('text-anchor', 'middle');
    centerText.setAttribute('fill', '#fb7185');
    centerText.setAttribute('font-size', '12px');
    centerText.setAttribute('font-weight', 'bold');
    centerText.setAttribute('font-family', 'Outfit, sans-serif');
    centerText.textContent = `${pctVal}%`;
    svg.appendChild(centerText);
}

window.handleGoalFilterChange = function () {
    render(false);
};
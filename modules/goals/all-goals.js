// modules/goals/all-goals.js
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

let cachedWorkspaceGoals = null;
let cachedAppsList = []; // stores digital suite app list for mentions tagging
let cachedUsersList = [];
let cachedAllowedEmails = [];
let currentTab = 'annual'; // type used when creating a new goal
let activeEditingGoalId = null;
let currentWorkspacePage = 1;
let lastWorkspaceSearchQuery = '';
const WORKSPACE_ITEMS_PER_PAGE = 4;

async function getWorkspaceGoals(forceRefresh = false) {
    if (cachedWorkspaceGoals && !forceRefresh) {
        return cachedWorkspaceGoals;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API issue');
        cachedWorkspaceGoals = await response.json();
        return cachedWorkspaceGoals;
    } catch (e) {
        console.error('Error fetching workspace goals:', e);
        return [];
    }
}

async function saveWorkspaceGoals(data, options = {}) {
    try {
        const sanitized = Array.isArray(data)
            ? data.map(record => {
                if (!record || typeof record !== 'object') return record;
                const { title, ...rest } = record;
                return rest;
            })
            : data;
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sanitized)
        });
        if (!response.ok) throw new Error('API issue');
        cachedWorkspaceGoals = sanitized;
        if (!options.skipRender) {
            cachedWorkspaceGoals = null;
            await renderWorkspace(true);
        }
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
        return true;
    } catch (e) {
        console.error('Error saving goals:', e);
        await showAlert('Error', 'Failed to save data to the server.');
        return false;
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

async function fetchUsersList() {
    try {
        const res = await fetch('/api/profile');
        if (res.ok) {
            cachedUsersList = await res.json();
            if (!Array.isArray(cachedUsersList)) {
                cachedUsersList = [];
            }
        }
    } catch (e) {
        console.error('Failed to load users database:', e);
        cachedUsersList = [];
    }

    try {
        const raRes = await fetch('/api/role_access');
        if (raRes.ok) {
            const raData = await raRes.json();
            const allowedRec = Array.isArray(raData) ? raData.find(r => r.id === 'allowed') : null;
            cachedAllowedEmails = allowedRec ? allowedRec.emails || [] : [];
        } else {
            cachedAllowedEmails = [];
        }
    } catch (e) {
        console.warn('Failed to load role access allowed list:', e);
        cachedAllowedEmails = [];
    }
}

function getDirectoryUsers() {
    const normalizedAllowed = cachedAllowedEmails.map(e => (e || '').trim().toLowerCase());
    return cachedUsersList.filter(u =>
        u.email && normalizedAllowed.includes(u.email.trim().toLowerCase())
    );
}

function currentActor() {
    return window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
}

function goalEmail(record) {
    if (window.GoalUser) {
        return window.GoalUser.resolveEmail(record, cachedUsersList);
    }
    return (record && record.email ? record.email : '').trim().toLowerCase();
}

function goalDisplayName(record) {
    return (record && record.user) || 'Unknown';
}

function actorOwnsGoal(record) {
    if (window.GoalUser) {
        return window.GoalUser.actorOwnsRecord(record, currentActor(), cachedUsersList);
    }
    const actor = currentActor();
    const recordUser = (record && record.user ? record.user : '').trim().toLowerCase();
    const actorName = (actor.name || '').trim().toLowerCase();
    return recordUser !== '' && recordUser === actorName;
}

function populateMemberFilterDropdown() {
    const select = document.getElementById('memberFilterDropdown');
    if (!select) return;

    const previousValue = select.value || 'all';
    const teammates = [...getDirectoryUsers()]
        .filter(p => (p.email || '').trim())
        .sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: 'base' }));

    select.innerHTML = '<option value="all" style="background: #0f172a">All users</option>';
    teammates.forEach(profile => {
        const email = profile.email.trim().toLowerCase();
        const opt = document.createElement('option');
        opt.value = email;
        opt.innerText = email;
        opt.style.background = '#0f172a';
        select.appendChild(opt);
    });

    const stillExists = [...select.options].some(o => o.value === previousValue);
    select.value = stillExists ? previousValue : 'all';
    refreshWorkspaceSelect(select);
}

function refreshWorkspaceSelect(selectEl) {
    const wrap = selectEl && selectEl.closest ? selectEl.closest('.workspace-select') : null;
    if (wrap && typeof wrap._renderMenu === 'function') {
        wrap._renderMenu();
    }
}

function initWorkspaceSelects() {
    document.querySelectorAll('.workspace-select').forEach(wrap => {
        const select = wrap.querySelector('select');
        const trigger = wrap.querySelector('.workspace-select-trigger');
        const menu = wrap.querySelector('.workspace-select-menu');
        const label = wrap.querySelector('.workspace-select-label');
        if (!select || !trigger || !menu || !label) return;

        const renderMenu = () => {
            menu.innerHTML = '';
            [...select.options].forEach(opt => {
                const item = document.createElement('div');
                item.className = 'workspace-select-option' + (opt.value === select.value ? ' active' : '');
                item.setAttribute('role', 'option');
                item.dataset.value = opt.value;
                item.textContent = opt.textContent;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (select.value !== opt.value) {
                        select.value = opt.value;
                        select.dispatchEvent(new Event('change'));
                    }
                    wrap.classList.remove('open');
                    renderMenu();
                });
                menu.appendChild(item);
            });
            const selected = select.options[select.selectedIndex];
            label.textContent = selected ? selected.textContent : '';
        };

        wrap._renderMenu = renderMenu;
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.workspace-select.open').forEach(other => {
                if (other !== wrap) other.classList.remove('open');
            });
            wrap.classList.toggle('open');
        });
        renderMenu();
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.workspace-select.open').forEach(wrap => wrap.classList.remove('open'));
    });
}

window.handleMemberFilterChange = function () {
    currentWorkspacePage = 1;
    renderWorkspace(false);
};

window.changeWorkspacePage = function (direction) {
    currentWorkspacePage += direction;
    renderWorkspace(false);
};

function getSelectedTimeframe() {
    return document.getElementById('timeframeFilterDropdown')?.value || 'all';
}

let workspaceSortDir = 'desc';

function getGoalCreatedTime(record) {
    if (record && record.createdAt) {
        const parsed = new Date(record.createdAt).getTime();
        if (!Number.isNaN(parsed)) return parsed;
    }
    const id = Number(record && record.id);
    return Number.isNaN(id) ? 0 : id;
}

function formatGoalCreatedStamp(record) {
    const ms = getGoalCreatedTime(record);
    if (!ms) return { time: '', date: '' };
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { time: '', date: '' };

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const time = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const date = `${day}/${month}/${year}`;

    return { time, date };
}

function updateSortCreatedButton() {
    const btn = document.getElementById('sortCreatedBtn');
    if (!btn) return;
    const icon = btn.querySelector('i');
    const isDesc = workspaceSortDir === 'desc';
    if (icon) {
        icon.className = isDesc ? 'fa-solid fa-arrow-down-wide-short' : 'fa-solid fa-arrow-up-wide-short';
    }
    btn.title = isDesc ? 'Newest first' : 'Oldest first';
}

window.toggleCreatedSort = function () {
    workspaceSortDir = workspaceSortDir === 'desc' ? 'asc' : 'desc';
    updateSortCreatedButton();
    currentWorkspacePage = 1;
    renderWorkspace(false);
};

function getSelectedHorizon() {
    return document.getElementById('goalHorizonSelect')?.value || 'annual';
}

function applyHorizonLabels(type) {
    const itemsLabel = document.getElementById('itemsLabel');
    if (!itemsLabel) return;
    if (type === 'annual') itemsLabel.innerText = 'Yearly Commitments';
    else if (type === 'quarterly') itemsLabel.innerText = 'Quarterly Commitments';
    else if (type === 'monthly') itemsLabel.innerText = 'Monthly Commitments';
    else if (type === 'weekly') itemsLabel.innerText = 'Weekly Commitments';
    else itemsLabel.innerText = 'Daily Commitments';
}

function computePeriodId(type, now = new Date()) {
    if (type === 'annual') return `${now.getFullYear()}`;
    if (type === 'quarterly') {
        const quarter = Math.floor(now.getMonth() / 3) + 1;
        return `${now.getFullYear()}-Q${quarter}`;
    }
    if (type === 'monthly') {
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${now.getFullYear()}-M${month}`;
    }
    if (type === 'weekly') return getWeekIdentifier(now);
    if (type === 'daily') return now.toISOString().split('T')[0];
    return '';
}

window.handleHorizonChange = function () {
    const type = getSelectedHorizon();
    currentTab = type;
    applyHorizonLabels(type);
};

window.handleTimeframeFilterChange = function () {
    currentWorkspacePage = 1;
    renderWorkspace(false);
};

window.switchWorkspaceTab = function (tabName) {
    const timeframeSelect = document.getElementById('timeframeFilterDropdown');
    if (timeframeSelect && ['annual', 'quarterly', 'monthly', 'weekly', 'daily'].includes(tabName)) {
        timeframeSelect.value = tabName;
        refreshWorkspaceSelect(timeframeSelect);
    }
};

// Configures and clears the unified modal before loading
window.handleOpenUnifiedModal = function () {
    activeEditingGoalId = null;
    
    document.getElementById('goalItemInput').innerHTML = ''; // cleared contenteditable
    document.getElementById('modalItemsList').innerHTML = '';
    hideAppDropdown();

    const timeframe = getSelectedTimeframe();
    currentTab = timeframe === 'all' ? 'annual' : timeframe;
    const horizonSelect = document.getElementById('goalHorizonSelect');
    if (horizonSelect) {
        horizonSelect.value = currentTab;
        horizonSelect.disabled = false;
        refreshWorkspaceSelect(horizonSelect);
    }
    applyHorizonLabels(currentTab);

    openUnifiedModal();
};

// Saves information generated inside unifiedModal
window.saveUnifiedGoal = async function () {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const user = actor.name || 'Anonymous';
    const userEmail = (actor.email || '').trim().toLowerCase();
    const itemsArray = getGoalsFromList('modalItemsList');
    const horizon = getSelectedHorizon();
    currentTab = horizon;

    // Members can only create personal goals (Personal/Global is admin-only)
    const scope = 'personal';

    if (!user) {
        await showAlert('Authentication Error', 'Your user session name could not be identified.');
        return;
    }

    // Validate limit constraints (Minimum 1, Maximum 15)
    if (itemsArray.length < 1) {
        await showAlert('Validation Error', 'You must add at least 1 goal/milestone.');
        return;
    }
    if (itemsArray.length > 15) {
        await showAlert('Validation Error', 'A maximum of 15 goals/milestones is allowed.');
        return;
    }

    const currentDB = await getWorkspaceGoals();

    if (activeEditingGoalId) {
        const record = currentDB.find(r => r.id === activeEditingGoalId);
        if (!record) {
            await showAlert('Error', 'Goal record not found.');
            return;
        }

        let type = record.type;
        if (!type) {
            type = record.weekId ? 'weekly' : 'annual';
        } else if (type === 'short-term') {
            type = 'weekly';
        } else if (type === 'long-term') {
            type = 'annual';
        }

        const originalGoals = record.goals || [];
        const updatedGoals = itemsArray.map(text => {
            const match = originalGoals.find(og => og.text.toLowerCase() === text.toLowerCase());
            return {
                text: text,
                done: match ? match.done : false
            };
        });

        record.goals = updatedGoals;
        // Keep existing scope on edit; members cannot change Personal/Global
        if (!record.scope) record.scope = 'personal';
        if (userEmail) record.email = userEmail;
        if (horizon !== type) {
            const periodId = computePeriodId(horizon);
            record.type = horizon;
            record.periodId = periodId;
            record.weekId = horizon === 'weekly' ? periodId : null;
        }
        delete record.title;

        await saveWorkspaceGoals(currentDB);

        window.notifyTeam && window.notifyTeam({
            action: 'updated',
            actorName: actor.name,
            itemName: `${record.type} goals (${record.periodId})`,
            module: 'Goals',
            excludeEmail: actor.email
        });

        closeUnifiedModal();
        await renderWorkspace(true);
        return;
    }

    const periodId = computePeriodId(horizon);

    const now = Date.now();
    const record = {
        id: now,
        createdAt: new Date(now).toISOString(),
        user,
        email: userEmail,
        goals: itemsArray.map(item => ({ text: item, done: false })),
        weekId: horizon === 'weekly' ? periodId : null,
        periodId: periodId,
        type: horizon,
        scope: scope
    };

    currentDB.push(record);
    await saveWorkspaceGoals(currentDB);

    // Notify Team Members
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `${horizon} goals (${periodId})`,
        module: 'Goals',
        excludeEmail: actor.email
    });

    closeUnifiedModal();
    await renderWorkspace(true);
};

window.editCurrentGoal = async function (recordId) {
    activeEditingGoalId = recordId;

    const data = await getWorkspaceGoals();
    const record = data.find(r => r.id === recordId);
    if (!record) return;

    document.getElementById('goalItemInput').innerHTML = '';
    hideAppDropdown();

    const list = document.getElementById('modalItemsList');
    list.innerHTML = '';
    record.goals.forEach(g => {
        const li = createGoalListItem(g.text);
        list.appendChild(li);
    });

    let type = record.type;
    if (!type) {
        type = record.weekId ? 'weekly' : 'annual';
    } else if (type === 'short-term') {
        type = 'weekly';
    } else if (type === 'long-term') {
        type = 'annual';
    }

    currentTab = type;
    const horizonSelect = document.getElementById('goalHorizonSelect');
    if (horizonSelect) {
        horizonSelect.value = type;
        horizonSelect.disabled = false;
        refreshWorkspaceSelect(horizonSelect);
    }
    applyHorizonLabels(type);

    openUnifiedModal();
};

// Controls creation UI list additions
window.addGoalItemUI = async function (listId, inputId) {
    const input = document.getElementById(inputId);
    // Use textContent to fetch raw clean plaintext (strips interactive tags automatically)
    const text = input.textContent.trim();
    if (!text) return;

    const list = document.getElementById(listId);
    if (list.querySelectorAll('li').length >= 15) {
        await showAlert('Validation Error', 'A maximum of 15 items is allowed.');
        return;
    }

    const li = createGoalListItem(text);
    list.appendChild(li);
    input.innerHTML = ''; // Reset editor layout
    hideAppDropdown();
};

window.createGoalListItem = function (text) {
    const li = document.createElement('li');
    li.className = 'goal-item';
    li.innerHTML = `
        <i class="fa-solid fa-grip-vertical drag-handle"></i>
        <span class="goal-content">${formatGoalText(text)}</span>
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

    // Get actual raw value by removing styling spans
    const rawText = span.innerText;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'goal-input';
    input.value = rawText;

    span.replaceWith(input);
    input.focus();

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'goal-btn';
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';

    const actions = li.querySelector('.goal-actions');
    const editBtn = actions.querySelector('.fa-pen').closest('button');

    editBtn.replaceWith(saveBtn);

    const save = () => {
        const newSpan = document.createElement('span');
        newSpan.className = 'goal-content';
        newSpan.innerHTML = formatGoalText(input.value.trim() || rawText);
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
            // Retrieve plaintext contents ignoring HTML styled highlights
            goals.push(span.innerText.trim());
        } else {
            const input = li.querySelector('.goal-input');
            if (input) goals.push(input.value.trim());
        }
    });
    return goals.filter(g => g.length > 0);
}

function resolveGoalType(record) {
    let type = record.type;
    if (!type) {
        type = record.weekId ? 'weekly' : 'annual';
    } else if (type === 'short-term') {
        type = 'weekly';
    } else if (type === 'long-term') {
        type = 'annual';
    }
    return type;
}

// Global Main Rendering System
async function renderWorkspace(forceRefresh = false) {
    const loader = document.getElementById('workspaceLoader');
    const content = document.getElementById('workspaceContent');
    const paginationEl = document.getElementById('workspacePagination');
    const isInitialLoad = content && content.style.display === 'none';
    if (loader && content && (forceRefresh || isInitialLoad)) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    const listEl = document.getElementById('goalsList');
    if (!listEl) return;

    const data = await getWorkspaceGoals(forceRefresh);
    if (forceRefresh) {
        populateMemberFilterDropdown();
    }

    const searchQuery = (document.getElementById('searchWorkspace')?.value || '').toLowerCase().trim();
    if (searchQuery !== lastWorkspaceSearchQuery) {
        currentWorkspacePage = 1;
        lastWorkspaceSearchQuery = searchQuery;
    }

    const memberFilter = (document.getElementById('memberFilterDropdown')?.value || 'all');
    const timeframeFilter = getSelectedTimeframe();

    listEl.innerHTML = '';
    if (paginationEl) paginationEl.innerHTML = '';

    const sortedData = [...data].sort((a, b) => {
        const diff = getGoalCreatedTime(a) - getGoalCreatedTime(b);
        return workspaceSortDir === 'asc' ? diff : -diff;
    });

    const filteredRows = [];

    sortedData.forEach(record => {
        const type = resolveGoalType(record);
        if (timeframeFilter !== 'all' && type !== timeframeFilter) {
            return;
        }

        const resolvedPeriod = record.periodId || record.weekId || 'Target';
        const recordEmail = goalEmail(record);

        if (memberFilter !== 'all' && recordEmail !== memberFilter.toLowerCase().trim()) {
            return;
        }

        const userMatch = recordEmail.includes(searchQuery);
        const periodMatch = (resolvedPeriod && typeof resolvedPeriod === 'string') ? resolvedPeriod.toLowerCase().includes(searchQuery) : false;
        const formattedPeriod = formatPeriodLabel(resolvedPeriod, type);
        const periodLabelMatch = formattedPeriod.toLowerCase().includes(searchQuery);
        const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
        const typeMatch = typeLabel.toLowerCase().includes(searchQuery);

        const goals = Array.isArray(record.goals) ? record.goals : [];
        const matchingGoals = goals.map((g, index) => ({ ...g, index })).filter(g => {
            if (!searchQuery) return true;
            if (userMatch || periodMatch || periodLabelMatch || typeMatch) return true;
            return g && g.text && typeof g.text === 'string' && g.text.toLowerCase().includes(searchQuery);
        });

        if (matchingGoals.length === 0) return;

        const isOwner = actorOwnsGoal(record);

        matchingGoals.forEach((g) => {
            filteredRows.push({
                record,
                goal: g,
                typeLabel,
                recordEmail,
                isOwner
            });
        });
    });

    const totalCount = filteredRows.length;
    const maxPage = Math.max(1, Math.ceil(totalCount / WORKSPACE_ITEMS_PER_PAGE));
    if (currentWorkspacePage > maxPage) currentWorkspacePage = maxPage;
    if (currentWorkspacePage < 1) currentWorkspacePage = 1;

    const startIdx = (currentWorkspacePage - 1) * WORKSPACE_ITEMS_PER_PAGE;
    const endIdx = startIdx + WORKSPACE_ITEMS_PER_PAGE;
    const pageRows = filteredRows.slice(startIdx, endIdx);

    if (totalCount === 0) {
        listEl.innerHTML = `<div class="empty-state"><p>No goals mapped to current workspace filter.</p></div>`;
    } else {
        const shownActionRecordIds = new Set();

        pageRows.forEach(({ record, goal: g, typeLabel, recordEmail, isOwner }) => {
            const showActions = isOwner && !shownActionRecordIds.has(record.id);
            if (showActions) shownActionRecordIds.add(record.id);

            const editButton = showActions ? `
                <button class="secondary-btn" title="Edit goal group" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(251,113,133,0.1); color:#fb7185; margin-bottom:0;" onclick="event.stopPropagation(); editCurrentGoal(${record.id})">
                    <i class="fa-solid fa-pen"></i>
                </button>
            ` : '';
            const deleteButton = showActions ? `
                <button class="secondary-btn" title="Delete goal group" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteWorkspaceRecord(${record.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : '';

            const createdStamp = formatGoalCreatedStamp(record);
            const createdStampHtml = createdStamp.time ? `
                <div class="goal-created-stamp" title="Created ${createdStamp.time} ${createdStamp.date}">
                    <span class="goal-created-time">${createdStamp.time}</span>
                    <span class="goal-created-date">${createdStamp.date}</span>
                </div>
            ` : '';
            const actionsHtml = (editButton || deleteButton) ? `
                <div class="workspace-goal-actions">
                    ${editButton}
                    ${deleteButton}
                </div>
            ` : '';

            const row = document.createElement('div');
            row.className = 'workspace-goal-row' + (showActions ? ' has-visible-actions' : '');
            row.innerHTML = `
                <input type="checkbox" class="goal-checkbox" ${g.done ? 'checked' : ''} ${isOwner ? '' : 'disabled'} onchange="toggleSubGoal(${record.id}, ${g.index})">
                <div class="workspace-goal-body">
                    <div class="workspace-goal-text" style="text-decoration: ${g.done ? 'line-through' : 'none'}; color: ${g.done ? '#6b7280' : '#d1d5db'}">
                        ${formatGoalText(g.text)}
                    </div>
                    <div class="workspace-goal-footer">
                        <span class="workspace-goal-footer-meta">${typeLabel} • ${recordEmail || 'Unknown'}</span>
                    </div>
                </div>
                ${actionsHtml}
                ${createdStampHtml}
            `;

            listEl.appendChild(row);
        });

        if (paginationEl) {
            const startRange = startIdx + 1;
            const endRange = Math.min(endIdx, totalCount);
            const prevDisabled = currentWorkspacePage === 1;
            const nextDisabled = endIdx >= totalCount;

            paginationEl.innerHTML = `
                <span>${startRange}-${endRange} of ${totalCount}</span>
                <div style="display: flex; gap: 6px;">
                    <button onclick="changeWorkspacePage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <button onclick="changeWorkspacePage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }
    }

    } finally {
        if (loader && content) {
            loader.style.display = 'none';
            content.style.display = '';
        }
    }
}

// Manual Refresh
window.handleWorkspaceRefresh = async function () {
    const icon = document.querySelector('.header-container .refresh-btn i');
    if (icon) icon.classList.add('fa-spin');
    try {
        await fetchUsersList();
        await renderWorkspace(true);
    } catch (e) {
        console.error('Refresh issue:', e);
    } finally {
        if (icon) {
            setTimeout(() => icon.classList.remove('fa-spin'), 500);
        }
    }
};

// Removal Handler
window.deleteWorkspaceRecord = async function (id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const data = await getWorkspaceGoals(true);
    const item = data.find(r => r.id === id);

    if (item && !actorOwnsGoal(item)) {
        await showAlert("Permission Denied", "You can only remove your own goal cards.");
        return;
    }
    const confirmed = await showConfirm('Confirm Delete', 'Are you sure you want to delete this goal record?');
    if (!confirmed) return;

    const filtered = data.filter(r => r.id !== id);
    await saveWorkspaceGoals(filtered);

    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: item ? `goal entry matching user ${item.user}` : 'a goal record',
        module: 'Goals',
        excludeEmail: actor.email
    });
};

// Checkbox interactive triggers — only the assigned member / creator can complete
window.toggleSubGoal = async function (recordId, index) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const data = await getWorkspaceGoals();
    const item = data.find(r => r.id === recordId);
    if (!item) return;

    if (!actorOwnsGoal(item)) {
        await showAlert("Permission Denied", "You can only complete your own goals.");
        await renderWorkspace(false);
        return;
    }

    item.goals[index].done = !item.goals[index].done;
    const saved = await saveWorkspaceGoals(data, { skipRender: true });
    if (!saved) {
        item.goals[index].done = !item.goals[index].done;
    }
    await renderWorkspace(false);
};

// Helper to format period identifiers for list metadata
function formatPeriodLabel(periodId, type) {
    if (!periodId) return '';
    if (type === 'monthly') {
        const match = periodId.match(/-M(\d{2})/);
        if (match) {
            const months = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const monthIdx = parseInt(match[1], 10) - 1;
            if (monthIdx >= 0 && monthIdx < 12) {
                return months[monthIdx];
            }
        }
    } else if (type === 'quarterly') {
        const match = periodId.match(/-Q(\d)/);
        if (match) {
            return `Q${match[1]}`;
        }
    } else if (type === 'weekly') {
        const match = periodId.match(/-W(\d+)/);
        if (match) {
            return `Week ${match[1]}`;
        }
    } else if (type === 'daily') {
        const parts = periodId.split('-');
        if (parts.length === 3) {
            const monthIdx = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const months = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            if (monthIdx >= 0 && monthIdx < 12) {
                return `${months[monthIdx]} ${day}`;
            }
        }
    }
    return periodId;
}

// Modal View Toggles
window.openUnifiedModal = function () {
    const modal = document.getElementById('unifiedGoalModal');
    const headerTitle = document.getElementById('unifiedModalTitle');
    headerTitle.innerText = activeEditingGoalId ? 'Edit Goal' : 'New Goal';

    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
};

window.closeUnifiedModal = function () {
    const modal = document.getElementById('unifiedGoalModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        hideAppDropdown();
    }, 300);
};

// Validation Info Modal View Controls
window.openValidationInfoModal = function () {
    const modal = document.getElementById('validationInfoModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
};

window.closeValidationInfoModal = function () {
    const modal = document.getElementById('validationInfoModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Backdrop Click handlers
window.onclick = function (e) {
    const unifiedModal = document.getElementById('unifiedGoalModal');
    const validationModal = document.getElementById('validationInfoModal');
    if (e.target === unifiedModal) closeUnifiedModal();
    if (e.target === validationModal) closeValidationInfoModal();
};

function getWeekIdentifier(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${weekNo}`;
}

// ---- APP TAG dropdown core interactions ----

function showAppDropdown() {
    const dropdown = document.getElementById('appTagDropdown');
    if (dropdown) dropdown.style.display = 'block';
}

function hideAppDropdown() {
    const dropdown = document.getElementById('appTagDropdown');
    const searchInput = document.getElementById('appTagSearch');
    if (dropdown) dropdown.style.display = 'none';
    if (searchInput) searchInput.value = '';
}

function populateAppDropdown(searchFilter = '') {
    const listEl = document.getElementById('appTagList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const filtered = cachedAppsList.filter(app =>
        app.name.toLowerCase().includes(searchFilter.toLowerCase())
    );

    if (filtered.length === 0) {
        listEl.innerHTML = `<span style="font-size:0.75rem; color:#6b7280; padding:4px 8px;">No apps found</span>`;
        return;
    }

    filtered.forEach(app => {
        const item = document.createElement('div');
        item.className = 'app-tag-item';
        item.innerText = app.name;
        item.onclick = (e) => {
            e.stopPropagation();
            insertSelectedTag(app.name);
        };
        listEl.appendChild(item);
    });
}

// Places typing caret/cursor at the very end of contenteditable block
function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

function formatGoalTextForInput(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    if (cachedAppsList && cachedAppsList.length > 0) {
        cachedAppsList.forEach(app => {
            const regex = new RegExp(`(<span[^>]*>[^<]*</span>)|@${escapeRegExp(app.name)}\\b`, 'gi');
            escaped = escaped.replace(regex, (match, p1) => {
                if (p1) return p1;
                return `<span style="color: #c084fc; font-weight: 600;" contenteditable="false">@${app.name}</span>`;
            });
        });
    }
    return escaped;
}

window.insertSelectedTag = function (appName) {
    const inputEl = document.getElementById('goalItemInput');
    if (!inputEl) return;

    const val = inputEl.textContent;
    const lastAtIndex = val.lastIndexOf('@');
    let newVal = val;
    if (lastAtIndex !== -1) {
        newVal = val.substring(0, lastAtIndex) + `@${appName}`;
    }

    inputEl.innerHTML = formatGoalTextForInput(newVal) + '&nbsp;';
    placeCaretAtEnd(inputEl);
    hideAppDropdown();
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

// Bind custom autocomplete listeners onto the contenteditable input field
function initAppTagEventListeners() {
    const inputEl = document.getElementById('goalItemInput');
    const dropdownSearch = document.getElementById('appTagSearch');

    if (inputEl) {
        inputEl.addEventListener('input', (e) => {
            const val = inputEl.textContent;
            const words = val.split(/\s+/);
            const lastWord = words[words.length - 1] || '';

            if (lastWord.startsWith('@')) {
                showAppDropdown();
                const filterQuery = lastWord.slice(1);
                populateAppDropdown(filterQuery);
            } else {
                hideAppDropdown();
            }
        });

        // Intercept key strokes to check and replace typed matches
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Suppress actual newlines inside contenteditable
                addGoalItemUI('modalItemsList', 'goalItemInput');
            }

            if (e.key === ' ' || e.keyCode === 32) {
                const val = inputEl.textContent;
                const words = val.split(/\s+/);
                const lastWord = words[words.length - 1];

                if (lastWord && lastWord.startsWith('@')) {
                    const typedAppName = lastWord.slice(1).toLowerCase();
                    const matchedApp = cachedAppsList.find(app => app.name.toLowerCase() === typedAppName);

                    if (matchedApp) {
                        e.preventDefault(); // Intercept default space inserting
                        const lastAtIndex = val.lastIndexOf('@');
                        let newVal = val;
                        if (lastAtIndex !== -1) {
                            newVal = val.substring(0, lastAtIndex) + `@${matchedApp.name}`;
                        }
                        inputEl.innerHTML = formatGoalTextForInput(newVal) + '&nbsp;';
                        placeCaretAtEnd(inputEl);
                        hideAppDropdown();
                    }
                }
            }
        });
    }

    if (dropdownSearch) {
        dropdownSearch.addEventListener('input', (e) => {
            populateAppDropdown(e.target.value);
        });
    }
}

async function waitForFirebaseAndInitialize() {
    if (window.FirebaseDB) {
        await fetchDigitalSuiteApps(); // populate digital suite details
        await fetchUsersList();
        initAppTagEventListeners();
        initWorkspaceSelects();
        
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        if (tabParam && ['annual', 'quarterly', 'monthly', 'weekly', 'daily'].includes(tabParam)) {
            switchWorkspaceTab(tabParam);
        } else {
            currentTab = 'annual';
        }
        
        renderWorkspace(true);
        const listContainer = document.getElementById('modalItemsList');
        if (listContainer && typeof Sortable !== 'undefined') {
            new Sortable(listContainer, { animation: 150, handle: '.drag-handle' });
        }
    } else {
        setTimeout(waitForFirebaseAndInitialize, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndInitialize);
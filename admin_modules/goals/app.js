const API_URL = '/api/goals';

// Pagination & State variables
let viewingRecordId = null;
let cachedGoals = null;
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';
let currentTab = 'annual';

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
        alert('Failed to save goals data to the server.');
    }
}

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

        const cancelBtn = overlay.querySelector('.custom-dialog-btn-secondary');
        const confirmBtn = overlay.querySelector('.custom-dialog-btn-primary');
        
        confirmBtn.focus();
        
        confirmBtn.addEventListener('click', () => {
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

let cachedUsersList = [];
let activeEditingGoalId = null;
let reassigningRecordId = null;

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
}

function currentActor() {
    return window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
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

function actorCanManageGoal(record) {
    if (window.GoalUser) {
        return window.GoalUser.actorCanManageRecord(record, currentActor(), cachedUsersList);
    }
    return actorOwnsGoal(record);
}

function fillEmailSelect(select, emails, selectedValue) {
    if (!select) return;
    select.innerHTML = '';
    const unique = [...new Set((emails || []).map(e => (e || '').trim().toLowerCase()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    if (unique.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.innerText = 'No users loaded';
        select.appendChild(opt);
        return;
    }

    unique.forEach(email => {
        const opt = document.createElement('option');
        opt.value = email;
        opt.innerText = email;
        select.appendChild(opt);
    });

    if (selectedValue && unique.includes(selectedValue)) {
        select.value = selectedValue;
    }
}

function directoryEmails() {
    return cachedUsersList
        .map(u => (u.email || '').trim().toLowerCase())
        .filter(Boolean);
}

function profileNameForEmail(email) {
    const key = (email || '').trim().toLowerCase();
    const match = cachedUsersList.find(u => (u.email || '').trim().toLowerCase() === key);
    return (match && match.name && match.name.trim()) ? match.name.trim() : key;
}

function isPersonalGoalRecord(record) {
    return !!(record && record.scope !== 'global' && !record.pendingId);
}

function recordBelongsToEmail(record, email) {
    const key = (email || '').trim().toLowerCase();
    if (!key || !record) return false;
    if (goalEmail(record) === key) return true;
    if ((record.email || '').trim().toLowerCase() === key) return true;
    if ((record.user || '').trim().toLowerCase() === key) return true;
    return false;
}

function populateAssigneeDropdown(extraEmail) {
    const select = document.getElementById('assigneeSelect');
    if (!select) return;
    const emails = directoryEmails();
    const extra = (extraEmail || '').trim().toLowerCase();
    if (extra && !emails.includes(extra)) {
        emails.push(extra);
    }
    fillEmailSelect(select, emails, extra);
}

function initScopeRadioListeners() {
    const radios = document.querySelectorAll('input[name="goalScope"]');
    radios.forEach(r => {
        r.addEventListener('change', (e) => {
            const container = document.getElementById('assigneeContainer');
            if (container) {
                container.style.display = e.target.value === 'personal' ? 'block' : 'none';
            }
        });
    });
}

window.handleOpenUnifiedModal = function () {
    activeEditingGoalId = null;
    
    document.getElementById('goalItemInput').innerHTML = ''; // cleared contenteditable
    document.getElementById('modalItemsList').innerHTML = '';
    hideAppDropdown();

    const personalRadio = document.querySelector('input[name="goalScope"][value="personal"]');
    if (personalRadio) personalRadio.checked = true;

    const container = document.getElementById('assigneeContainer');
    if (container) {
        container.style.display = 'block';
    }

    // Populate dropdown with latest profiles
    populateAssigneeDropdown();

    const itemsLabel = document.getElementById('itemsLabel');
    const headerTitle = document.getElementById('unifiedModalTitle');
    const assigneeLabel = document.getElementById('assigneeSelectLabel');
    const saveBtn = document.getElementById('saveGoalBtn');

    const typeLabel = currentTab.charAt(0).toUpperCase() + currentTab.slice(1);
    headerTitle.innerText = `Set ${typeLabel} Goal`;
    if (assigneeLabel) assigneeLabel.innerText = 'Assign Goal To';
    if (saveBtn) saveBtn.innerText = 'Commit Goal';

    if (currentTab === 'annual') {
        itemsLabel.innerText = 'Yearly Commitments';
    } else if (currentTab === 'quarterly') {
        itemsLabel.innerText = 'Quarterly Commitments';
    } else if (currentTab === 'monthly') {
        itemsLabel.innerText = 'Monthly Commitments';
    } else if (currentTab === 'weekly') {
        itemsLabel.innerText = 'Weekly Commitments';
    } else {
        itemsLabel.innerText = 'Daily Commitments';
    }

    openGoalModal();
};

window.saveUnifiedGoal = async function () {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const itemsArray = getGoalsFromList('modalItemsList');
    
    // Capture scope selection
    const scopeElement = document.querySelector('input[name="goalScope"]:checked');
    const scope = scopeElement ? scopeElement.value : 'personal';

    // Get selected assignee if scope is personal — identity is email, name is display only
    let targetUser = actor.name || 'Anonymous';
    let targetEmail = (actor.email || '').trim().toLowerCase();
    let isAssigned = false;
    if (scope === 'personal') {
        const assigneeSelect = document.getElementById('assigneeSelect');
        if (assigneeSelect && assigneeSelect.value) {
            const selectedEmail = assigneeSelect.value.trim().toLowerCase();
            const selectedUser = cachedUsersList.find(u => (u.email || '').trim().toLowerCase() === selectedEmail);
            if (selectedUser) {
                targetUser = (selectedUser.name || '').trim() || selectedEmail;
                targetEmail = selectedEmail;
            } else {
                targetUser = profileNameForEmail(selectedEmail) || selectedEmail;
                targetEmail = selectedEmail;
            }
            isAssigned = true;
        } else {
            await showAlert('Validation Error', 'Please select a profile to assign the goal to.');
            return;
        }
    }

    if (itemsArray.length < 1) {
        await showAlert('Validation Error', 'You must add at least 1 goal/milestone.');
        return;
    }
    if (itemsArray.length > 15) {
        await showAlert('Validation Error', 'A maximum of 15 goals/milestones is allowed.');
        return;
    }

    const currentDB = await getGoals();

    if (activeEditingGoalId) {
        const record = currentDB.find(r => r.id === activeEditingGoalId);
        if (!record) {
            await showAlert('Error', 'Goal record not found.');
            return;
        }

        let type = record.type;
        if (!type) {
            type = record.weekId ? 'weekly' : 'annual';
        }

        const originalGoals = record.goals || [];
        const wasAssigned = !!record.assignedByAdmin;
        const previousAssigneeEmail = goalEmail(record);
        const updatedGoals = itemsArray.map(text => {
            const match = originalGoals.find(og => og.text.toLowerCase() === text.toLowerCase());
            return {
                text: text,
                done: match ? match.done : false
            };
        });

        record.goals = updatedGoals;
        record.scope = scope;
        delete record.title;
        if (scope === 'personal') {
            record.user = targetUser;
            record.email = targetEmail;
            record.assignedByAdmin = isAssigned;
            record.createdBy = actor.name;
            record.createdByEmail = (actor.email || '').trim().toLowerCase();
        } else {
            record.user = actor.name;
            record.email = (actor.email || '').trim().toLowerCase();
            delete record.assignedByAdmin;
            delete record.createdBy;
            delete record.createdByEmail;
        }

        await saveGoals(currentDB);

        const assigneeChanged = isAssigned && (
            !wasAssigned ||
            previousAssigneeEmail !== (targetEmail || '').trim().toLowerCase()
        );
        if (assigneeChanged && window.notifyAssigneeOfGoal) {
            await window.notifyAssigneeOfGoal({
                assigneeName: targetUser,
                assigneeEmail: targetEmail,
                actorName: actor.name,
                goalType: type,
                periodId: record.periodId,
                action: wasAssigned ? 'updated' : 'assigned'
            });
        }

        window.notifyTeam && window.notifyTeam({
            action: 'updated',
            actorName: actor.name,
            itemName: `${type} goals (${record.periodId})`,
            module: 'Goals',
            excludeEmail: actor.email
        });

        closeGoalModal();
        await render(true);
        return;
    }

    // Programmatically calculate period identifiers based on active tab and today's date
    let periodId = '';
    const now = new Date();

    if (currentTab === 'annual') {
        periodId = `${now.getFullYear()}`;
    } else if (currentTab === 'quarterly') {
        const quarter = Math.floor(now.getMonth() / 3) + 1;
        periodId = `${now.getFullYear()}-Q${quarter}`;
    } else if (currentTab === 'monthly') {
        const month = String(now.getMonth() + 1).padStart(2, '0');
        periodId = `${now.getFullYear()}-M${month}`;
    } else if (currentTab === 'weekly') {
        periodId = getWeekIdentifier(now);
    } else if (currentTab === 'daily') {
        periodId = now.toISOString().split('T')[0];
    }

    const record = {
        id: Date.now(),
        user: targetUser,
        email: targetEmail,
        goals: itemsArray.map(item => ({ text: item, done: false })),
        weekId: currentTab === 'weekly' ? periodId : null, // keep backward compatibility
        periodId: periodId,
        type: currentTab,
        scope: scope
    };
    if (isAssigned) {
        record.assignedByAdmin = true;
        record.createdBy = actor.name;
        record.createdByEmail = (actor.email || '').trim().toLowerCase();
    }

    currentDB.push(record);
    await saveGoals(currentDB);

    if (isAssigned && window.notifyAssigneeOfGoal) {
        await window.notifyAssigneeOfGoal({
            assigneeName: targetUser,
            assigneeEmail: targetEmail,
            actorName: actor.name,
            goalType: currentTab,
            periodId: record.periodId,
            action: 'assigned'
        });
    }

    // Notify Team Members
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `${currentTab} goals (${periodId})`,
        module: 'Goals',
        excludeEmail: actor.email
    });

    closeGoalModal();
    await render(true);
};

window.editCurrentGoal = async function (recordId) {
    activeEditingGoalId = recordId;
    closeGoalsViewModal();

    const data = await getGoals();
    const record = data.find(r => r.id === recordId);
    if (!record) return;

    document.getElementById('goalItemInput').innerHTML = '';
    hideAppDropdown();

    const scopeVal = record.scope || 'personal';
    const radioBtn = document.querySelector(`input[name="goalScope"][value="${scopeVal}"]`);
    if (radioBtn) {
        radioBtn.checked = true;
    }

    // Trigger display toggle of assignee dropdown
    const container = document.getElementById('assigneeContainer');
    if (container) {
        container.style.display = scopeVal === 'personal' ? 'block' : 'none';
    }

    // Populate drop down before setting its value, keeping the current assignee even if they left the directory
    populateAssigneeDropdown(goalEmail(record));

    const assigneeSelect = document.getElementById('assigneeSelect');
    if (assigneeSelect) {
        assigneeSelect.value = goalEmail(record) || '';
    }

    const assigneeLabel = document.getElementById('assigneeSelectLabel');
    const saveBtn = document.getElementById('saveGoalBtn');
    if (assigneeLabel) assigneeLabel.innerText = 'Reassign Goal To';
    if (saveBtn) saveBtn.innerText = 'Save Changes';

    const list = document.getElementById('modalItemsList');
    list.innerHTML = '';
    record.goals.forEach(g => {
        const li = createGoalListItem(g.text);
        list.appendChild(li);
    });

    const itemsLabel = document.getElementById('itemsLabel');
    const headerTitle = document.getElementById('unifiedModalTitle');

    let type = record.type;
    if (!type) {
        type = record.weekId ? 'weekly' : 'annual';
    } else if (type === 'short-term') {
        type = 'weekly';
    } else if (type === 'long-term') {
        type = 'annual';
    }

    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
    headerTitle.innerText = `Edit ${capitalizedType} Goal`;

    if (type === 'annual') {
        itemsLabel.innerText = 'Yearly Commitments';
    } else if (type === 'quarterly') {
        itemsLabel.innerText = 'Quarterly Commitments';
    } else if (type === 'monthly') {
        itemsLabel.innerText = 'Monthly Commitments';
    } else if (type === 'weekly') {
        itemsLabel.innerText = 'Weekly Commitments';
    } else {
        itemsLabel.innerText = 'Daily Commitments';
    }

    openGoalModal();
};

window.addGoalItemUI = async function (listId, inputId) {
    const input = document.getElementById(inputId);
    const text = input.textContent.trim();
    if (!text) return;

    const list = document.getElementById(listId);
    if (list.querySelectorAll('li').length >= 15) {
        await showAlert('Validation Error', 'A maximum of 15 items is allowed.');
        return;
    }

    const li = createGoalListItem(text);
    list.appendChild(li);
    input.innerHTML = '';
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
            goals.push(span.innerText.trim());
        } else {
            const input = li.querySelector('.goal-input');
            if (input) goals.push(input.value.trim());
        }
    });
    return goals;
}

// App Tag Dropdown code
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

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
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
                        e.preventDefault();
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

async function toggleGoal(recordId, goalIndex) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const data = await getGoals();
    const item = data.find(r => r.id === recordId);
    if (item) {
        if (!actorOwnsGoal(item)) {
            alert("Permission Denied: You can only modify your own goals.");
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
    
    if (deletedRecord && !actorCanManageGoal(deletedRecord)) {
        alert("Permission Denied: You can only delete your own goals or goals you assigned.");
        return;
    }
    if (!confirm('Are you sure you want to delete this goals commitment card?')) return;
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
        itemName: deletedRecord ? `${deletedRecord.user}'s goals (${deletedPeriod})` : 'a goals record',
        module: 'Goals',
        excludeEmail: actor.email
    });
}

function getWeekIdentifier(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
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

window.switchGoalsTab = function (tabName) {
    currentTab = tabName;
    currentPage = 1;
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${tabName}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const actionBtn = document.getElementById('addGoalBtn');
    if (actionBtn) {
        const capitalized = tabName.charAt(0).toUpperCase() + tabName.slice(1);
        actionBtn.innerHTML = `<i class="fa-solid fa-plus"></i> New ${capitalized} Goal`;
    }

    render();
};

async function render(forceRefresh = false) {
    const loader = document.getElementById('goalsLoader');
    const content = document.getElementById('goalsContent');
    if (loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    const container = document.getElementById('goalsHistory');
    const leaderboardContainer = document.getElementById('leaderboard');
    const mainPaginationContainer = document.getElementById('mainPagination');
    const lbPaginationContainer = document.getElementById('leaderboardPagination');

    if (!container || !leaderboardContainer) return;

    const data = await getGoals(forceRefresh);
    const searchQuery = (document.getElementById('searchGoals')?.value || '').toLowerCase().trim();

    // Reset pagination to Page 1 if query text changes
    if (searchQuery !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = searchQuery;
    }

    // Filter commitments based on tab and search query
    const filteredData = data.filter(record => {
        let type = record.type;
        if (!type) {
            if (record.weekId) type = 'weekly';
            else type = 'annual';
        } else if (type === 'short-term') {
            type = 'weekly';
        } else if (type === 'long-term') {
            type = 'annual';
        }

        if (type !== currentTab) return false;

        const resolvedPeriod = record.periodId || record.weekId || 'Target';
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

        const userMatch = goalEmail(record).includes(searchQuery);
        const goalMatch = record.goals ? record.goals.some(g => g.text.toLowerCase().includes(searchQuery)) : false;
        const weekMatch = resolvedPeriod ? resolvedPeriod.toLowerCase().includes(searchQuery) : false;
        const typeMatch = capitalizedType ? capitalizedType.toLowerCase().includes(searchQuery) : false;
        const titleMatch = record.title ? record.title.toLowerCase().includes(searchQuery) : false;
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
            const displayTitle = (record.title && record.title.trim()) ? formatGoalText(record.title) : capitalizedType;

            const totalGoalsCount = record.goals.length || 1;
            const completedCount = record.goals.filter(g => g.done).length;
            const pct = Math.round((completedCount / totalGoalsCount) * 100);
            
            const isOwner = actorCanManageGoal(record);
            
            const editButton = isOwner ? `
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(251,113,133,0.1); color:#fb7185; margin-bottom:0;" onclick="event.stopPropagation(); editCurrentGoal(${record.id})">
                    <i class="fa-solid fa-pen"></i>
                </button>
            ` : '';

            const reassignButton = (!record.pendingId && record.scope !== 'global') ? `
                <button class="secondary-btn" title="Reassign to another user" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(251,113,133,0.1); color:#fb7185; margin-bottom:0;" onclick="event.stopPropagation(); handleOpenReassignModal(${record.id})">
                    <i class="fa-solid fa-user-pen"></i>
                </button>
            ` : '';
            
            const deleteButton = isOwner ? `
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteRecord(${record.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : '';

            const actionButtons = record.pendingId ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button class="secondary-btn" style="padding:4px 8px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(16, 185, 129, 0.15); color:#10b981; border: 1px solid rgba(16, 185, 129, 0.2); margin-bottom:0;" onclick="event.stopPropagation(); approvePending(${record.pendingId})">
                        Approve
                    </button>
                    <button class="secondary-btn" style="padding:4px 8px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239, 68, 68, 0.15); color:#ef4444; border: 1px solid rgba(239, 68, 68, 0.2); margin-bottom:0;" onclick="event.stopPropagation(); rejectPending(${record.pendingId})">
                        Reject
                    </button>
                </div>
            ` : '';

            let pendingBadge = '';
            if (record.pendingId) {
                if (record.pendingType === 'goals_completed') {
                    pendingBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Completed 5 Goals</span>`;
                } else {
                    pendingBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Pending Global</span>`;
                }
            }
            
            const card = document.createElement('div');
            card.className = 'card accordion-card';
            card.style.cursor = 'pointer';
            card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
            card.style.transition = 'all 0.2s ease';
            card.setAttribute('onclick', `openGoalsViewModal(${record.id})`);

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <h4 style="margin:0; color:white; font-size:0.95rem; font-weight:600;">${displayTitle}</h4>
                    <div style="display:flex; align-items:center; gap:4px;">
                        ${actionButtons}
                        ${reassignButton}
                        ${editButton}
                        ${deleteButton}
                    </div>
                </div>
                <p style="font-size:0.75rem; color:#9ca3af; margin:0 0 10px 0; display: flex; align-items: center; gap: 4px;">
                    <span>${capitalizedType} • ${goalEmail(record) || 'Unknown'}</span>
                    ${pendingBadge}
                </p>
                <div class="infographics-bar" style="height:6px; margin: 10px 0;">
                    <div class="infographics-fill" style="width: ${pct}%"></div>
                </div>
                <p style="font-size:0.75rem; color:#9ca3af; margin:0;">${completedCount}/${record.goals.length} metrics reached (${pct}%)</p>
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
        return;
    }

    const userStats = {};
    data.forEach(r => {
        const key = goalEmail(r) || r.user || 'unknown';
        if (!userStats[key]) userStats[key] = { attempted: 0, completed: 0, name: key };
        userStats[key].attempted += r.goals.length;
        userStats[key].completed += r.goals.filter(g => g.done).length;
    });

    const sortedUsers = Object.entries(userStats).sort((a,b) => b[1].completed - a[1].completed);
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
                <strong style="color:white; font-size:0.95rem;">${stats.name || username}</strong>
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

    } finally {
        if (loader && content) {
            loader.style.display = 'none';
            content.style.display = '';
        }
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

function personalGoalsForEmail(data, email) {
    return (data || []).filter(record => isPersonalGoalRecord(record) && recordBelongsToEmail(record, email));
}

function applyAssigneeToRecord(record, targetEmail, actor) {
    record.user = profileNameForEmail(targetEmail);
    record.email = targetEmail;
    record.assignedByAdmin = true;
    record.createdBy = actor.name;
    record.createdByEmail = (actor.email || '').trim().toLowerCase();
    record.scope = 'personal';
}

window.handleOpenReassignModal = async function (recordId) {
    if (recordId && (typeof recordId === 'object' || recordId === true)) {
        recordId = null;
    }
    reassigningRecordId = recordId || null;
    const data = await getGoals();
    const fromSelect = document.getElementById('reassignFromSelect');
    const toSelect = document.getElementById('reassignToSelect');
    const fromRow = document.getElementById('reassignFromRow');
    const title = document.getElementById('reassignModalTitle');

    fillEmailSelect(toSelect, directoryEmails());

    if (recordId) {
        const record = data.find(r => String(r.id) === String(recordId));
        if (!record) {
            await showAlert('Error', 'Goal record not found.');
            return;
        }
        if (fromRow) fromRow.style.display = 'none';
        if (title) title.innerText = 'Reassign Goal';
        const current = goalEmail(record);
        if (fromSelect) {
            fillEmailSelect(fromSelect, current ? [current] : [], current);
        }
    } else {
        if (fromRow) fromRow.style.display = 'block';
        if (title) title.innerText = 'Reassign Goals';
        const fromEmails = [...new Set([
            ...directoryEmails(),
            ...data.filter(isPersonalGoalRecord).map(r => goalEmail(r)).filter(Boolean)
        ])];
        fillEmailSelect(fromSelect, fromEmails);
    }

    updateReassignPreview();
    openReassignModal();
};

function openReassignModal() {
    const modal = document.getElementById('reassignModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
}

window.closeReassignModal = function () {
    const modal = document.getElementById('reassignModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        reassigningRecordId = null;
    }, 300);
};

window.updateReassignPreview = async function () {
    const preview = document.getElementById('reassignPreview');
    if (!preview) return;

    const fromEmail = (document.getElementById('reassignFromSelect')?.value || '').trim().toLowerCase();
    const toEmail = (document.getElementById('reassignToSelect')?.value || '').trim().toLowerCase();
    const data = await getGoals();

    if (reassigningRecordId) {
        const record = data.find(r => String(r.id) === String(reassigningRecordId));
        const current = record ? goalEmail(record) : '';
        if (!toEmail) {
            preview.textContent = 'Select a user to receive this goal.';
            return;
        }
        if (current && current === toEmail) {
            preview.textContent = 'This goal is already assigned to that user.';
            return;
        }
        preview.textContent = current
            ? `This goal will move from ${current} to ${toEmail}.`
            : `This goal will be assigned to ${toEmail}.`;
        return;
    }

    if (!fromEmail || !toEmail) {
        preview.textContent = 'Select a current assignee and a new assignee.';
        return;
    }
    if (fromEmail === toEmail) {
        preview.textContent = 'Choose a different user to reassign to.';
        return;
    }
    const count = personalGoalsForEmail(data, fromEmail).length;
    preview.textContent = count === 1
        ? `1 personal goal will move from ${fromEmail} to ${toEmail}.`
        : `${count} personal goals will move from ${fromEmail} to ${toEmail}.`;
};

window.confirmReassignGoals = async function () {
    const actor = currentActor();
    const fromEmail = (document.getElementById('reassignFromSelect')?.value || '').trim().toLowerCase();
    const toEmail = (document.getElementById('reassignToSelect')?.value || '').trim().toLowerCase();

    if (!toEmail) {
        await showAlert('Validation Error', 'Please select a user to reassign to.');
        return;
    }

    const data = await getGoals(true);
    let targets = [];

    if (reassigningRecordId) {
        const record = data.find(r => String(r.id) === String(reassigningRecordId));
        if (!record) {
            await showAlert('Error', 'Goal record not found.');
            return;
        }
        if (goalEmail(record) === toEmail) {
            await showAlert('Validation Error', 'This goal is already assigned to that user.');
            return;
        }
        targets = [record];
    } else {
        if (!fromEmail) {
            await showAlert('Validation Error', 'Please select the user to reassign from.');
            return;
        }
        if (fromEmail === toEmail) {
            await showAlert('Validation Error', 'Choose a different user to reassign to.');
            return;
        }
        targets = personalGoalsForEmail(data, fromEmail);
        if (targets.length === 0) {
            await showAlert('No Goals', `No personal goals found for ${fromEmail}.`);
            return;
        }
    }

    const confirmed = await showConfirm(
        'Confirm Reassign',
        targets.length === 1
            ? `Reassign this goal to ${toEmail}?`
            : `Reassign ${targets.length} goals from ${fromEmail} to ${toEmail}?`
    );
    if (!confirmed) return;

    const previousEmails = new Set(targets.map(r => goalEmail(r)).filter(Boolean));
    targets.forEach(record => applyAssigneeToRecord(record, toEmail, actor));
    await saveGoals(data);

    if (window.notifyAssigneeOfGoal && !previousEmails.has(toEmail)) {
        const sample = targets[0];
        await window.notifyAssigneeOfGoal({
            assigneeName: profileNameForEmail(toEmail),
            assigneeEmail: toEmail,
            actorName: actor.name,
            goalType: targets.length === 1 ? (sample.type || 'goal') : `${targets.length} personal`,
            periodId: targets.length === 1 ? sample.periodId : '',
            action: 'assigned'
        });
    }

    closeReassignModal();
    await render(true);
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

// Sub-render function to display specific goals of the viewing card inside modal
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
        titleElem.innerHTML = ` ${goalEmail(record) || 'Unknown'}'s Goals`;
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
    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

    const totalGoalsCount = record.goals.length || 1;
    const completedCount = record.goals.filter(g => g.done).length;
    const pct = Math.round((completedCount / totalGoalsCount) * 100);

    const pendingBadge = record.pendingId
        ? (record.pendingType === 'goals_completed'
            ? `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Completed 5 Goals</span>`
            : `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Pending Global</span>`)
        : '';

    if (metaElem) {
        const canReassign = !record.pendingId && record.scope !== 'global';
        const reassignAction = canReassign
            ? `<button class="secondary-btn" title="Reassign to another user" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:4px; background:rgba(251,113,133,0.1); color:#fb7185; margin:8px 0 0 0;" onclick="closeGoalsViewModal(); handleOpenReassignModal(${record.id})"><i class="fa-solid fa-user-pen"></i> Reassign</button>`
            : '';
        metaElem.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 6px; align-items: center;">
                <span style="display: flex; align-items: center; gap: 4px;">
                    <span>${capitalizedType} • ${goalEmail(record) || 'Unknown'}</span>
                    ${pendingBadge}
                </span>
                <span><strong>${completedCount} of ${record.goals.length} completed (${pct}%)</strong></span>
            </div>
            ${record.title ? `<div style="font-size: 0.9rem; color: #cbd5e1; font-weight: 500; margin-bottom: 8px;">${formatGoalText(record.title)}</div>` : ''}
            <div class="infographics-bar" style="margin: 4px 0; height: 8px;">
                <div class="infographics-fill" style="width: ${pct}%"></div>
            </div>
            ${reassignAction}
        `;
    }

    const isOwner = actorCanManageGoal(record);

    if (listElem) {
        listElem.innerHTML = record.goals.map((g, idx) => `
            <div class="goal-item-row" style="margin-bottom: 4px; padding: 10px 12px; display: flex; align-items: center;">
                <input type="checkbox" class="goal-checkbox" style="width:16px; height:16px; margin-right:12px;" ${g.done ? 'checked' : ''} ${isOwner ? '' : 'disabled'} onchange="toggleGoalInModal(${record.id}, ${idx})">
                <span style="font-size:0.9rem; transition:all 0.2s; text-decoration: ${g.done ? 'line-through' : 'none'}; color: ${g.done ? '#6b7280' : '#d1d5db'}">
                    ${formatGoalText(g.text)}
                </span>
            </div>
        `).join('');
    }
}

// Checkbox handler specifically within the viewing modal
window.toggleGoalInModal = async function(recordId, goalIndex) {
    await toggleGoal(recordId, goalIndex);
    renderGoalsViewContent(); // Update modal immediately
};

// Close modals when user clicks outside of the active container boundary
window.onclick = function (event) {
    const goalModal = document.getElementById('goalModal');
    const leaderboardModal = document.getElementById('leaderboardModal');
    const goalsViewModal = document.getElementById('goalsViewModal');
    const validationInfoModal = document.getElementById('validationInfoModal');
    const reassignModal = document.getElementById('reassignModal');
    if (event.target === goalModal) {
        closeGoalModal();
    }
    if (event.target === leaderboardModal) {
        closeLeaderboardModal();
    }
    if (event.target === goalsViewModal) {
        closeGoalsViewModal();
    }
    if (event.target === validationInfoModal) {
        closeValidationInfoModal();
    }
    if (event.target === reassignModal) {
        closeReassignModal();
    }
};

async function approvePending(id) {
    if (!confirm('Approve this goals review record?')) return;
    const res = await fetch(`/api/goals/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        cachedGoals = null;
        await render(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } else {
        alert('Failed to approve goals record.');
    }
}

async function rejectPending(id) {
    if (!confirm('Reject and delete this goals review record?')) return;
    const res = await fetch(`/api/goals/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        cachedGoals = null;
        await render(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } else {
        alert('Failed to reject goals record.');
    }
}

let cachedAppsList = [];
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

async function waitForFirebaseAndStart() {
    console.log("Goals waitForFirebaseAndStart: checking window.FirebaseDB", !!window.FirebaseDB);
    if (window.FirebaseDB) {
        console.log("Goals window.FirebaseDB is defined! Running render...");
        await fetchDigitalSuiteApps();
        await fetchUsersList();
        
        initScopeRadioListeners();
        initAppTagEventListeners();
        
        const listContainer = document.getElementById('modalItemsList');
        if (listContainer && typeof Sortable !== 'undefined') {
            new Sortable(listContainer, { animation: 150, handle: '.drag-handle' });
        }

        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        if (tabParam && ['annual', 'quarterly', 'monthly', 'weekly', 'daily'].includes(tabParam)) {
            window.switchGoalsTab(tabParam);
        } else {
            window.switchGoalsTab('annual');
        }
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);
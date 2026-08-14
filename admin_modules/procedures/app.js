const API_URL = '/api/procedures';

// Pagination & State variables
let viewingProcedureId = null;
let editingProcedureId = null;
let cachedProcedures = null;
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;

async function getProcedures(forceRefresh = false) {
    if (cachedProcedures && !forceRefresh) {
        return cachedProcedures;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API failure');
        cachedProcedures = await response.json();
        return cachedProcedures;
    } catch (e) {
        console.error('Error fetching procedures:', e);
        return [];
    }
}

async function saveProcedures(procs) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(procs)
        });
        if (!response.ok) throw new Error('API failure');
        cachedProcedures = null; // Clear local cache
        await render(true); // Force fresh render
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving procedures:', e);
        alert('Failed to save procedures runbook to database.');
    }
}

async function addProcedure() {
    const author = document.getElementById('procAuthor').value.trim();
    const title = document.getElementById('procTitle').value.trim();
    const steps = getStepsFromList('procStepsList');

    if (!author || !title || !steps) return alert('Your name, runbook title, and execution guide details are required');

    const procs = await getProcedures();
    procs.push({ id: Date.now(), author, title, steps });
    await saveProcedures(procs);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: title,
        module: 'Procedures',
        excludeEmail: actor.email
    });

    document.getElementById('procAuthor').value = '';
    document.getElementById('procTitle').value = '';
    document.getElementById('procStepsList').innerHTML = '';

    closeProcedureModal();
}

async function deleteProcedure(id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const procs = await getProcedures(true);
    const deletedProc = procs.find(p => p.id === id);
    if (deletedProc && (deletedProc.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only delete your own procedures.");
        return;
    }
    if (!confirm('Are you sure you want to remove this procedure runbook?')) return;
    const filtered = procs.filter(p => p.id !== id);
    if (viewingProcedureId === id) {
        closeProcedureDetailModal();
    }
    await saveProcedures(filtered);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedProc ? deletedProc.title : 'a procedure',
        module: 'Procedures',
        excludeEmail: actor.email
    });
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

async function render(forceRefresh = false) {
    const loader = document.getElementById('proceduresLoader');
    const content = document.getElementById('proceduresContent');
    if (loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    const container = document.getElementById('proceduresList');
    const board = document.getElementById('proceduresLeaderboard');
    const mainPaginationContainer = document.getElementById('mainPagination');
    const lbPaginationContainer = document.getElementById('leaderboardPagination');

    if (!container || !board) return;

    const list = await getProcedures(forceRefresh);
    const searchQuery = (document.getElementById('searchProcedures')?.value || '').toLowerCase().trim();

    // Reset pagination to Page 1 if query text changes
    if (searchQuery !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = searchQuery;
    }

    container.innerHTML = '';
    board.innerHTML = '';

    // Render Contributor Leaderboard (always generated using complete data)
    const counts = {};
    list.forEach(p => {
        const contributor = p.author || 'Anonymous';
        counts[contributor] = (counts[contributor] || 0) + 1;
    });
    const ranking = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    const totalLbCount = ranking.length;

    if (totalLbCount === 0) {
        board.innerHTML = '<p style="font-size:0.85rem; color:#6b7280; font-style:italic; margin:0; text-align:center; width:100%;">No contributor publications logged yet.</p>';
        if (lbPaginationContainer) lbPaginationContainer.innerHTML = '';
    } else {
        // Leaderboard page constraint
        const maxLbPage = Math.max(1, Math.ceil(totalLbCount / LEADERBOARD_ITEMS_PER_PAGE));
        if (currentLeaderboardPage > maxLbPage) {
            currentLeaderboardPage = maxLbPage;
        }

        const lbStartIdx = (currentLeaderboardPage - 1) * LEADERBOARD_ITEMS_PER_PAGE;
        const lbEndIdx = lbStartIdx + LEADERBOARD_ITEMS_PER_PAGE;
        const paginatedLbUsers = ranking.slice(lbStartIdx, lbEndIdx);

        paginatedLbUsers.forEach(([user, val], relativeIdx) => {
            const absoluteIdx = lbStartIdx + relativeIdx;
            const entry = document.createElement('div');
            entry.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(0,0,0,0.15); border-radius:10px; border:1px solid rgba(255,255,255,0.03);";
            
            let rankBadge = '';
            if (absoluteIdx === 0) {
                rankBadge = '';
            } else if (absoluteIdx === 1) {
                rankBadge = '';
            } else if (absoluteIdx === 2) {
                rankBadge = '';
            } else {
                rankBadge = `<span style="color:#6b7280; font-weight:bold; font-size:0.85rem; width:16px; text-align:center; display:inline-block;">${absoluteIdx + 1}</span>`;
            }

            entry.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    ${rankBadge}
                    <strong style="color:white; font-size:0.9rem;">${user}</strong>
                </div>
                <div style="font-size:0.8rem; color:#9ca3af; font-weight:600;">
                    ${val} runbook${val > 1 ? 's' : ''}
                </div>
            `;
            board.appendChild(entry);
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
                    <button onclick="changeLeaderboardPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#a78bfa'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                    <button onclick="changeLeaderboardPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#a78bfa'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
                </div>
            `;
        }
    }

    // Filter by Search Query
    const filtered = list.filter(p => 
        p.title.toLowerCase().includes(searchQuery) ||
        p.steps.toLowerCase().includes(searchQuery) ||
        (p.author && p.author.toLowerCase().includes(searchQuery))
    );

    const totalCount = filtered.length;

    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                
                <p>${searchQuery ? 'No procedures match your search query.' : 'No procedures published yet.'}</p>
            </div>
        `;
        if (mainPaginationContainer) mainPaginationContainer.innerHTML = '';
        return;
    }

    // Sort: newest first
    filtered.sort((a,b) => b.id - a.id);

    // Handle History pagination parameters
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
        currentPage = maxPage;
    }

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedProcedures = filtered.slice(startIdx, endIdx);

    paginatedProcedures.forEach(p => {
        const typeBadge = p.pendingType ? `<span class="badge" style="font-size:0.7rem; padding:2px 6px; margin-left:6px; background:${p.pendingType === 'create' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)'}; color:${p.pendingType === 'create' ? '#10b981' : '#6366f1'}; border:1px solid ${p.pendingType === 'create' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'};">${p.pendingType.toUpperCase()}</span>` : '';
        const actionButtons = p.pendingId ? `
            <div style="display: flex; align-items: center; gap: 4px;">
                <button class="secondary-btn" style="padding:4px 8px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(16, 185, 129, 0.15); color:#10b981; border: 1px solid rgba(16, 185, 129, 0.2); margin-bottom:0;" onclick="event.stopPropagation(); approvePending(${p.pendingId})">
                    Approve
                </button>
                <button class="secondary-btn" style="padding:4px 8px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239, 68, 68, 0.15); color:#ef4444; border: 1px solid rgba(239, 68, 68, 0.2); margin-bottom:0;" onclick="event.stopPropagation(); rejectPending(${p.pendingId})">
                    Reject
                </button>
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = 'card accordion-card';
        card.style.cursor = 'pointer';
        card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        card.style.transition = 'all 0.2s ease';
        card.setAttribute('onclick', `openProcedureDetailModal(${p.id})`);

        const stepCount = p.steps.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0).length;

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding: 2px;">
                <strong style="font-size: 0.85rem; color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; display: flex; align-items: center; gap: 6px;">
                    ${p.title} ${typeBadge}
                </strong>
                ${actionButtons}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px; margin-top: 4px; font-size: 0.75rem;">
                <span style="color: #9ca3af;"> ${p.author || 'Anonymous'}</span>
                <span style="color: #a78bfa; font-weight: 600;"> ${stepCount} steps</span>
            </div>
        `;
        container.appendChild(card);
    });

    // Render Main Directory Pagination
    if (mainPaginationContainer) {
        const startRange = startIdx + 1;
        const endRange = Math.min(endIdx, totalCount);
        const prevDisabled = currentPage === 1;
        const nextDisabled = endIdx >= totalCount;

        mainPaginationContainer.innerHTML = `
            <span>${startRange}-${endRange} of ${totalCount}</span>
            <div style="display: flex; gap: 6px;">
                <button onclick="changeMainPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#a78bfa'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button onclick="changeMainPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#a78bfa'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
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

// Client-side visual toggle helper for runbooks
window.toggleLabelStrike = function(checkboxId) {
    // Wait a brief tick for checkbox state change
    setTimeout(() => {
        const checkbox = document.getElementById(checkboxId);
        const textSpan = document.getElementById(`text-${checkboxId}`);
        if (checkbox && textSpan) {
            if (checkbox.checked) {
                textSpan.style.textDecoration = 'line-through';
                textSpan.style.color = '#6b7280';
            } else {
                textSpan.style.textDecoration = 'none';
                textSpan.style.color = '#d1d5db';
            }
        }
    }, 20);
};

// Modal handling functions - Publish Procedure Modal
window.openProcedureModal = function () {
    const modal = document.getElementById('procedureModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeProcedureModal = function () {
    const modal = document.getElementById('procedureModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Contributors Leaderboard Modal
window.openProceduresLeaderboardModal = function () {
    const modal = document.getElementById('proceduresLeaderboardModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
    render();
};

window.closeProceduresLeaderboardModal = function () {
    const modal = document.getElementById('proceduresLeaderboardModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Procedure Detail Viewer Modal
window.openProcedureDetailModal = function (procId) {
    viewingProcedureId = procId;
    const modal = document.getElementById('procedureDetailModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
    renderProcedureDetailContent();
};

window.closeProcedureDetailModal = function () {
    const modal = document.getElementById('procedureDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        viewingProcedureId = null;
    }, 300);
};

// Modal handling functions - Edit Procedure Modal
window.openEditProcedureModal = async function (procId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const procs = await getProcedures();
    const item = procs.find(p => p.id === procId);
    if (!item) return;
    if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only edit your own procedures.");
        return;
    }
    editingProcedureId = procId;

    document.getElementById('editProcId').value = item.id;
    document.getElementById('editProcAuthor').value = item.author || '';
    document.getElementById('editProcTitle').value = item.title || '';
    
    const list = document.getElementById('editProcStepsList');
    list.innerHTML = '';
    if (item.steps) {
        item.steps.split('\n').forEach(step => {
            if (step.trim()) {
                list.appendChild(createStepListItem(step.trim()));
            }
        });
    }

    const modal = document.getElementById('editProcedureModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
};

window.closeEditProcedureModal = function () {
    const modal = document.getElementById('editProcedureModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        editingProcedureId = null;
    }, 300);
};

// Save Edit Action
window.saveEditProcedure = async function () {
    const id = parseInt(document.getElementById('editProcId').value);
    const author = document.getElementById('editProcAuthor').value.trim();
    const title = document.getElementById('editProcTitle').value.trim();
    const steps = getStepsFromList('editProcStepsList');

    if (!author || !title || !steps) return alert('Your name, runbook title, and execution guide details are required');

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const procs = await getProcedures(true);
    const item = procs.find(p => p.id === id);
    if (item) {
        if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own procedures.");
            return;
        }
        item.author = author;
        item.title = title;
        item.steps = steps;
        await saveProcedures(procs);

        // Broadcast email notification to all team members
        window.notifyTeam && window.notifyTeam({
            action: 'edited',
            actorName: actor.name,
            itemName: title,
            module: 'Procedures',
            excludeEmail: actor.email
        });
    }
    closeEditProcedureModal();
};

// Sub-render function to display selected runbook inside modal view details
async function renderProcedureDetailContent() {
    if (!viewingProcedureId) return;
    const procedures = await getProcedures();
    const p = procedures.find(item => item.id === viewingProcedureId);
    if (!p) {
        closeProcedureDetailModal();
        return;
    }

    const titleElem = document.getElementById('detailProcedureTitle');
    const metaElem = document.getElementById('detailProcedureMeta');
    const stepsElem = document.getElementById('detailProcedureSteps');

    const stepLines = p.steps.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    if (titleElem) {
        titleElem.innerHTML = ` ${p.title}`;
    }
    if (metaElem) {
        metaElem.innerHTML = `
            <span> Contributor: <strong>${p.author || 'Anonymous'}</strong></span>
            <span style="color:#a78bfa; font-weight:600;"> ${stepLines.length} steps</span>
        `;
    }
    if (stepsElem) {
        stepsElem.innerHTML = stepLines.map((line, idx) => {
            const uniqueId = `check-${p.id}-${idx}`;
            return `
                <label for="${uniqueId}" style="display:flex; align-items:flex-start; gap:10px; padding:6px; border-radius:6px; cursor:pointer; transition:all 0.15s;" class="step-label" onclick="toggleLabelStrike('${uniqueId}')">
                    <input type="checkbox" id="${uniqueId}" style="width:16px; height:16px; margin:2px 0 0 0; cursor:pointer; flex-shrink:0;">
                    <span id="text-${uniqueId}" style="font-size:0.88rem; color:#d1d5db; line-height:1.4;">${line}</span>
                </label>
            `;
        }).join('');
    }
}

// Close modal when user clicks outside the modal box boundary
window.onclick = function (event) {
    const procedureModal = document.getElementById('procedureModal');
    const proceduresLeaderboardModal = document.getElementById('proceduresLeaderboardModal');
    const procedureDetailModal = document.getElementById('procedureDetailModal');
    const editProcedureModal = document.getElementById('editProcedureModal');
    
    if (event.target === procedureModal) {
        closeProcedureModal();
    }
    if (event.target === proceduresLeaderboardModal) {
        closeProceduresLeaderboardModal();
    }
    if (event.target === procedureDetailModal) {
        closeProcedureDetailModal();
    }
    if (event.target === editProcedureModal) {
        closeEditProcedureModal();
    }
};

async function approvePending(id) {
    if (!confirm('Approve this procedure?')) return;
    const res = await fetch(`/api/procedures/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        cachedProcedures = null;
        await render(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } else {
        alert('Failed to approve procedure.');
    }
}

async function rejectPending(id) {
    if (!confirm('Reject and discard this procedure?')) return;
    const res = await fetch(`/api/procedures/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        cachedProcedures = null;
        await render(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } else {
        alert('Failed to reject procedure.');
    }
}

function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        render(true);

        // Initialize sortable
        const procStepsList = document.getElementById('procStepsList');
        if (procStepsList && typeof Sortable !== 'undefined') {
            new Sortable(procStepsList, {
                animation: 150,
                handle: '.drag-handle'
            });
        }
        const editProcStepsList = document.getElementById('editProcStepsList');
        if (editProcStepsList && typeof Sortable !== 'undefined') {
            new Sortable(editProcStepsList, {
                animation: 150,
                handle: '.drag-handle'
            });
        }
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);

window.addProcStepUI = function(listId, inputId) {
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if (!text) return;

    const list = document.getElementById(listId);
    const li = createStepListItem(text);
    list.appendChild(li);
    input.value = '';
};

window.createStepListItem = function(text) {
    const li = document.createElement('li');
    li.className = 'step-item';
    li.innerHTML = `
        <i class="fa-solid fa-grip-vertical drag-handle"></i>
        <span class="step-content">${text}</span>
        <div class="step-actions">
            <button type="button" class="step-btn" onclick="editStepUI(this)"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="step-btn" onclick="this.closest('li').remove()"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    return li;
};

window.editStepUI = function(btn) {
    const li = btn.closest('li');
    const span = li.querySelector('.step-content');
    const currentText = span.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'step-input';
    input.value = currentText;

    span.replaceWith(input);
    input.focus();

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'step-btn';
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    
    const actions = li.querySelector('.step-actions');
    const editBtn = actions.querySelector('.fa-pen').closest('button');
    
    // Replace edit btn with save btn
    editBtn.replaceWith(saveBtn);

    const save = () => {
        const newSpan = document.createElement('span');
        newSpan.className = 'step-content';
        newSpan.textContent = input.value.trim() || currentText;
        input.replaceWith(newSpan);
        
        const newEditBtn = document.createElement('button');
        newEditBtn.type = 'button';
        newEditBtn.className = 'step-btn';
        newEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        newEditBtn.onclick = function() { editStepUI(this); };
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

function getStepsFromList(listId) {
    const list = document.getElementById(listId);
    const steps = [];
    list.querySelectorAll('li').forEach(li => {
        const span = li.querySelector('.step-content');
        if (span) {
            steps.push(span.textContent);
        } else {
            const input = li.querySelector('.step-input');
            if (input) steps.push(input.value.trim());
        }
    });
    return steps.join('\n');
}
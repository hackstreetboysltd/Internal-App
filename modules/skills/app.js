const API_URL = '/api/skills';

// Pagination & State variables
let viewingSkillId = null;
let editingSkillId = null;
let cachedSkills = null;
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;

async function getSkills(forceRefresh = false) {
    if (cachedSkills && !forceRefresh) {
        return cachedSkills;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API request failed');
        cachedSkills = await response.json();
        return cachedSkills;
    } catch (e) {
        console.error('Error fetching skills:', e);
        return [];
    }
}

async function saveSkills(list) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(list)
        });
        if (!response.ok) throw new Error('API request failed');
        cachedSkills = null; // Clear local cache
        await render(true); // Force fresh render
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving skills:', e);
        alert('Failed to save skill entry to database.');
    }
}

async function addSkill() {
    const author = document.getElementById('contribName').value.trim();
    const title = document.getElementById('skillTitle').value.trim();
    const body = document.getElementById('skillDesc').value.trim();

    if (!author || !title || !body) return alert('Fill in all sections of the form');

    const list = await getSkills();
    list.push({
        id: Date.now(),
        author,
        title,
        body
    });

    await saveSkills(list);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: title,
        module: 'Skills',
        excludeEmail: actor.email
    });

    // Reset fields
    document.getElementById('contribName').value = '';
    document.getElementById('skillTitle').value = '';
    document.getElementById('skillDesc').value = '';

    closeSkillModal();
}

async function deleteSkill(id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const list = await getSkills(true);
    const deletedItem = list.find(s => s.id === id);
    if (deletedItem && (deletedItem.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only delete your own skills.");
        return;
    }
    if (!confirm('Are you sure you want to delete this skill article?')) return;
    const filtered = list.filter(s => s.id !== id);
    if (viewingSkillId === id) {
        closeSkillDetailModal();
    }
    await saveSkills(filtered);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedItem ? deletedItem.title : 'a skill',
        module: 'Skills',
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

// Refresh function for top right refresh button
window.refreshSkills = async function () {
    const icon = document.querySelector('.header-container .refresh-btn i');
    if (icon) {
        icon.classList.add('fa-spin');
    }
    try {
        await render(true);
    } catch (e) {
        console.error('Error during manual skills refresh:', e);
    } finally {
        if (icon) {
            setTimeout(() => {
                icon.classList.remove('fa-spin');
            }, 500);
        }
    }
};

async function render(forceRefresh = false) {
    const loader = document.getElementById('skillsLoader');
    const content = document.getElementById('skillsContent');
    if (loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    const container = document.getElementById('skillsContainer');
    const board = document.getElementById('skillsLeaderboard');
    const mainPaginationContainer = document.getElementById('mainPagination');
    const lbPaginationContainer = document.getElementById('leaderboardPagination');

    if (!container || !board) return;

    const skills = await getSkills(forceRefresh);
    const searchQuery = (document.getElementById('searchSkills')?.value || '').toLowerCase().trim();

    // Reset pagination to Page 1 if query text changes
    if (searchQuery !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = searchQuery;
    }

    container.innerHTML = '';
    board.innerHTML = '';

    // Render Contributor Leaderboard (always generated using complete data)
    const counts = {};
    skills.forEach(s => counts[s.author] = (counts[s.author] || 0) + 1);
    const ranking = Object.entries(counts).sort((a, b) => b[1] - a[1]);
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
                    ${val} skill${val > 1 ? 's' : ''}
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
                    <button onclick="changeLeaderboardPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#fbbf24'}; border: none; color: ${prevDisabled ? '#4b5563' : '#1e1b4b'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <button onclick="changeLeaderboardPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#fbbf24'}; border: none; color: ${nextDisabled ? '#4b5563' : '#1e1b4b'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }
    }

    // Search and Filter directory lists
    const filteredSkills = skills.filter(s =>
        s.title.toLowerCase().includes(searchQuery) ||
        s.body.toLowerCase().includes(searchQuery) ||
        (s.author || '').toLowerCase().includes(searchQuery)
    );

    const totalCount = filteredSkills.length;

    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <p>${searchQuery ? 'No skills match your search query.' : 'No skills logged yet. Click "Share Skill" to get started.'}</p>
            </div>
        `;
        if (mainPaginationContainer) mainPaginationContainer.innerHTML = '';
        return;
    }

    // Sort by newest first
    filteredSkills.sort((a, b) => b.id - a.id);

    // Handle History pagination parameters
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
        currentPage = maxPage;
    }

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedSkills = filteredSkills.slice(startIdx, endIdx);

    paginatedSkills.forEach(s => {
        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
        const isOwner = (s.author || '').toLowerCase() === actor.name.toLowerCase();
        const actionButtons = isOwner ? `
            <div style="display: flex; align-items: center; gap: 4px;">
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(251, 191, 36, 0.1); color:#fbbf24; margin-bottom:0; border: 1px solid rgba(251, 191, 36, 0.15);" onclick="event.stopPropagation(); openEditSkillModal(${s.id})">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteSkill(${s.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = 'card accordion-card';
        card.style.cursor = 'pointer';
        card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        card.style.transition = 'all 0.2s ease';
        card.setAttribute('onclick', `openSkillDetailModal(${s.id})`);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding: 2px;">
                <strong style="font-size: 0.85rem; color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;">
                    ${s.title}
                </strong>
                ${actionButtons}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px; margin-top: 4px; font-size: 0.75rem;">
                <span style="color: #9ca3af;">${s.author}</span>
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
                <button onclick="changeMainPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#fbbf24'}; border: none; color: ${prevDisabled ? '#4b5563' : '#1e1b4b'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button onclick="changeMainPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#fbbf24'}; border: none; color: ${nextDisabled ? '#4b5563' : '#1e1b4b'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
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

// Modal handling functions - Share Skill Modal
window.openSkillModal = function () {
    const modal = document.getElementById('skillModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeSkillModal = function () {
    const modal = document.getElementById('skillModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Contributors Leaderboard Modal
window.openSkillsLeaderboardModal = function () {
    const modal = document.getElementById('skillsLeaderboardModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
    render();
};

window.closeSkillsLeaderboardModal = function () {
    const modal = document.getElementById('skillsLeaderboardModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Skill Detail Viewer Modal
window.openSkillDetailModal = function (skillId) {
    viewingSkillId = skillId;
    const modal = document.getElementById('skillDetailModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
    renderSkillDetailContent();
};

window.closeSkillDetailModal = function () {
    const modal = document.getElementById('skillDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        viewingSkillId = null;
    }, 300);
};

// Modal handling functions - Edit Skill Modal
window.openEditSkillModal = async function (skillId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const list = await getSkills();
    const item = list.find(s => s.id === skillId);
    if (!item) return;
    if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only edit your own skills.");
        return;
    }
    editingSkillId = skillId;

    document.getElementById('editSkillId').value = item.id;
    document.getElementById('editSkillAuthor').value = item.author || '';
    document.getElementById('editSkillTitle').value = item.title || '';
    document.getElementById('editSkillDesc').value = item.body || '';

    const modal = document.getElementById('editSkillModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
};

window.closeEditSkillModal = function () {
    const modal = document.getElementById('editSkillModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        editingSkillId = null;
    }, 300);
};

// Save Edit Action
window.saveEditSkill = async function () {
    const id = parseInt(document.getElementById('editSkillId').value);
    const author = document.getElementById('editSkillAuthor').value.trim();
    const title = document.getElementById('editSkillTitle').value.trim();
    const body = document.getElementById('editSkillDesc').value.trim();

    if (!author || !title || !body) return alert('Your name, skill title, and guidance details are required');

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const list = await getSkills(true);
    const item = list.find(s => s.id === id);
    if (item) {
        if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own skills.");
            return;
        }
        item.author = author;
        item.title = title;
        item.body = body;
        await saveSkills(list);

        // Broadcast email notification to all team members
        window.notifyTeam && window.notifyTeam({
            action: 'edited',
            actorName: actor.name,
            itemName: title,
            module: 'Skills',
            excludeEmail: actor.email
        });
    }
    closeEditSkillModal();
};

// Sub-render function to display selected skill inside modal view details
async function renderSkillDetailContent() {
    if (!viewingSkillId) return;
    const skills = await getSkills();
    const s = skills.find(item => item.id === viewingSkillId);
    if (!s) {
        closeSkillDetailModal();
        return;
    }

    const titleElem = document.getElementById('detailSkillTitle');
    const metaElem = document.getElementById('detailSkillMeta');
    const bodyElem = document.getElementById('detailSkillBody');

    if (titleElem) {
        titleElem.innerHTML = `${s.title}`;
    }
    if (metaElem) {
        metaElem.innerHTML = `
            <span>By : <strong>${s.author}</strong></span>
        `;
    }
    if (bodyElem) {
        bodyElem.textContent = s.body;
    }
}

// Close modal when user clicks outside the modal box boundary
window.onclick = function (event) {
    const skillModal = document.getElementById('skillModal');
    const skillsLeaderboardModal = document.getElementById('skillsLeaderboardModal');
    const skillDetailModal = document.getElementById('skillDetailModal');
    const editSkillModal = document.getElementById('editSkillModal');

    if (event.target === skillModal) {
        closeSkillModal();
    }
    if (event.target === skillsLeaderboardModal) {
        closeSkillsLeaderboardModal();
    }
    if (event.target === skillDetailModal) {
        closeSkillDetailModal();
    }
    if (event.target === editSkillModal) {
        closeEditSkillModal();
    }
};

function waitForFirebaseAndStart() {
    console.log("Skills waitForFirebaseAndStart: checking window.FirebaseDB", !!window.FirebaseDB);
    if (window.FirebaseDB) {
        console.log("Skills window.FirebaseDB is defined! Running render...");
        render(true);
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);
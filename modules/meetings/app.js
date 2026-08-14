const API_URL = '/api/meetings';

// Pagination & State variables
let viewingMeetingId = null;
let editingMeetingId = null;
let cachedMeetings = null;
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;

async function getMeetings(forceRefresh = false) {
    if (cachedMeetings && !forceRefresh) {
        return cachedMeetings;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API request failed');
        cachedMeetings = await response.json();
        return cachedMeetings;
    } catch (e) {
        console.error('Error fetching meetings:', e);
        return [];
    }
}

async function saveMeetings(data) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('API request failed');
        cachedMeetings = null; // Clear local cache
        await renderMeetings(true); // Force fresh render
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving meetings:', e);
        alert('Failed to save meetings to physical database server.');
    }
}

async function addMeeting() {
    const author = document.getElementById('mAuthor').value.trim();
    const time = document.getElementById('mTime').value;
    const link = document.getElementById('mLink').value.trim();
    const agenda = document.getElementById('mAgenda').value.trim();

    if (!author || !time || !link || !agenda) return alert('Fill in all fields');

    const meetings = await getMeetings();
    meetings.push({
        id: Date.now(),
        author,
        time,
        link,
        agenda,
        minutes: ''
    });

    await saveMeetings(meetings);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `meeting on ${new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        module: 'Meetings',
        excludeEmail: actor.email
    });

    // Reset form fields
    document.getElementById('mAuthor').value = '';
    document.getElementById('mTime').value = '';
    document.getElementById('mLink').value = '';
    document.getElementById('mAgenda').value = '';

    closeMeetingModal();
}

async function addMinutes(id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const meetings = await getMeetings();
    const index = meetings.findIndex(m => m.id === id);
    if (index === -1) return;

    if ((meetings[index].author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only add/update minutes for meetings you organized.");
        return;
    }

    const currentMinutes = meetings[index].minutes || '';
    const minutes = prompt('Add/Update post-meeting minutes:', currentMinutes);
    if (minutes === null) return;

    meetings[index].minutes = minutes.trim();
    await saveMeetings(meetings);
}

async function deleteMeeting(id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const meetings = await getMeetings(true);
    const deletedMeeting = meetings.find(m => m.id === id);
    if (deletedMeeting && (deletedMeeting.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only delete your own meetings.");
        return;
    }
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    const filtered = meetings.filter(m => m.id !== id);
    if (viewingMeetingId === id) {
        closeMeetingDetailModal();
    }
    await saveMeetings(filtered);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedMeeting ? `meeting on ${new Date(deletedMeeting.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'a meeting',
        module: 'Meetings',
        excludeEmail: actor.email
    });
}

// Navigation controllers
window.changeMainPage = function (direction) {
    currentPage += direction;
    renderMeetings();
};

window.changeLeaderboardPage = function (direction) {
    currentLeaderboardPage += direction;
    renderMeetings();
};

// Refresh function for top right refresh button
window.refreshMeetings = async function () {
    const icon = document.querySelector('.header-container .refresh-btn i');
    if (icon) {
        icon.classList.add('fa-spin');
    }
    try {
        await renderMeetings(true);
    } catch (e) {
        console.error('Error during manual meetings refresh:', e);
    } finally {
        if (icon) {
            setTimeout(() => {
                icon.classList.remove('fa-spin');
            }, 500);
        }
    }
};

async function renderMeetings(forceRefresh = false) {
    const loader = document.getElementById('meetingsLoader');
    const content = document.getElementById('meetingsContent');
    if (loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    const container = document.getElementById('meetingsList');
    const board = document.getElementById('meetingsLeaderboard');
    const mainPaginationContainer = document.getElementById('mainPagination');
    const lbPaginationContainer = document.getElementById('leaderboardPagination');

    if (!container || !board) return;

    const meetings = await getMeetings(forceRefresh);
    const searchQuery = (document.getElementById('searchMeetings')?.value || '').toLowerCase().trim();
    const now = new Date();

    // Reset pagination to Page 1 if query text changes
    if (searchQuery !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = searchQuery;
    }

    container.innerHTML = '';
    board.innerHTML = '';

    // Render Contributor Leaderboard (always generated using complete data)
    const counts = {};
    meetings.forEach(m => {
        const contributor = m.author || 'Anonymous';
        counts[contributor] = (counts[contributor] || 0) + 1;
    });
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
                    ${val} meeting${val > 1 ? 's' : ''}
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
                    <button onclick="changeLeaderboardPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#818cf8'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <button onclick="changeLeaderboardPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#818cf8'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }
    }

    // Filter meetings based on agenda, post-meeting minutes, or status matching
    const filteredMeetings = meetings.filter(m => {
        const mDate = new Date(m.time);
        const diffMs = mDate - now;
        let status = '';
        if (diffMs > 0) status = 'upcoming';
        else if (diffMs <= 0 && Math.abs(diffMs) < 60 * 60 * 1000) status = 'in progress';
        else status = 'completed';

        return m.agenda.toLowerCase().includes(searchQuery) ||
            (m.minutes || '').toLowerCase().includes(searchQuery) ||
            mDate.toLocaleString().toLowerCase().includes(searchQuery) ||
            (m.author && m.author.toLowerCase().includes(searchQuery)) ||
            status.includes(searchQuery);
    });

    const totalCount = filteredMeetings.length;

    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <p>${searchQuery ? 'No meetings match your search query.' : 'No meetings scheduled yet. Click "Schedule Meeting" to get started.'}</p>
            </div>
        `;
        if (mainPaginationContainer) mainPaginationContainer.innerHTML = '';
        return;
    }

    // Sort meetings: upcoming first, then past
    filteredMeetings.sort((a, b) => new Date(a.time) - new Date(b.time));

    // Handle History pagination parameters
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
        currentPage = maxPage;
    }

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedMeetings = filteredMeetings.slice(startIdx, endIdx);

    paginatedMeetings.forEach(m => {
        const mDate = new Date(m.time);
        const diffMs = mDate - now;

        let statusBadge = '';
        let badgeClass = '';

        if (diffMs > 0) {
            statusBadge = ' Upcoming';
            badgeClass = 'pending';
        } else if (diffMs <= 0 && Math.abs(diffMs) < 60 * 60 * 1000) { // 1 hour duration
            statusBadge = ' In Progress';
            badgeClass = 'danger';
        } else {
            statusBadge = ' Completed';
            badgeClass = 'success';
        }

        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
        const isOwner = (m.author || '').toLowerCase() === actor.name.toLowerCase();
        const actionButtons = isOwner ? `
            <div style="display: flex; align-items: center; gap: 4px;">
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(129, 140, 248, 0.1); color:#818cf8; margin-bottom:0; border: 1px solid rgba(129, 140, 248, 0.15);" onclick="event.stopPropagation(); openEditMeetingModal(${m.id})">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteMeeting(${m.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = 'card accordion-card';
        card.style.cursor = 'pointer';
        card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        card.style.transition = 'all 0.2s ease';
        card.setAttribute('onclick', `openMeetingDetailModal(${m.id})`);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding: 2px;">
                <strong style="font-size: 0.82rem; color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%;">
                    ${mDate.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </strong>
                ${actionButtons}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px; margin-top: 4px; font-size: 0.75rem;">
                <span style="color: #9ca3af;"> ${m.author || 'Anonymous'}</span>
                <span class="badge ${badgeClass}" style="font-size:0.65rem; padding: 2px 6px;">${statusBadge}</span>
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
                <button onclick="changeMainPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#818cf8'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button onclick="changeMainPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#818cf8'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
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

// Modal handling functions - Schedule Meeting Modal
window.openMeetingModal = function () {
    const modal = document.getElementById('meetingModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeMeetingModal = function () {
    const modal = document.getElementById('meetingModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Organizers Leaderboard Modal
window.openMeetingsLeaderboardModal = function () {
    const modal = document.getElementById('meetingsLeaderboardModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
    renderMeetings();
};

window.closeMeetingsLeaderboardModal = function () {
    const modal = document.getElementById('meetingsLeaderboardModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Meeting Detail Viewer Modal
window.openMeetingDetailModal = function (mId) {
    viewingMeetingId = mId;
    const modal = document.getElementById('meetingDetailModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
    renderMeetingDetailContent();
};

window.closeMeetingDetailModal = function () {
    const modal = document.getElementById('meetingDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        viewingMeetingId = null;
    }, 300);
};

// Modal handling functions - Edit Meeting Modal
window.openEditMeetingModal = async function (mId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const meetings = await getMeetings();
    const item = meetings.find(m => m.id === mId);
    if (!item) return;
    if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only edit your own meetings.");
        return;
    }
    editingMeetingId = mId;

    document.getElementById('editMId').value = item.id;
    document.getElementById('editMAuthor').value = item.author || '';
    document.getElementById('editMTime').value = item.time || '';
    document.getElementById('editMLink').value = item.link || '';
    document.getElementById('editMAgenda').value = item.agenda || '';

    const modal = document.getElementById('editMeetingModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
};

window.closeEditMeetingModal = function () {
    const modal = document.getElementById('editMeetingModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        editingMeetingId = null;
    }, 300);
};

// Save Edit Action
window.saveEditMeeting = async function () {
    const id = parseInt(document.getElementById('editMId').value);
    const author = document.getElementById('editMAuthor').value.trim();
    const time = document.getElementById('editMTime').value;
    const link = document.getElementById('editMLink').value.trim();
    const agenda = document.getElementById('editMAgenda').value.trim();

    if (!author || !time || !link || !agenda) return alert('Fill in all fields');

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const meetings = await getMeetings(true);
    const item = meetings.find(m => m.id === id);
    if (item) {
        if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own meetings.");
            return;
        }
        item.author = author;
        item.time = time;
        item.link = link;
        item.agenda = agenda;
        await saveMeetings(meetings);

        // Broadcast email notification to all team members
        window.notifyTeam && window.notifyTeam({
            action: 'edited',
            actorName: actor.name,
            itemName: `meeting on ${new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
            module: 'Meetings',
            excludeEmail: actor.email
        });
    }
    closeEditMeetingModal();
};

// Sub-render function to display selected meeting details inside modal view
async function renderMeetingDetailContent() {
    if (!viewingMeetingId) return;
    const meetings = await getMeetings();
    const m = meetings.find(item => item.id === viewingMeetingId);
    if (!m) {
        closeMeetingDetailModal();
        return;
    }

    const titleElem = document.getElementById('detailMeetingTitle');
    const metaElem = document.getElementById('detailMeetingMeta');
    const agendaElem = document.getElementById('detailMeetingAgenda');
    const linkContainer = document.getElementById('detailMeetingLinkContainer');
    const minutesElem = document.getElementById('detailMeetingMinutes');

    const mDate = new Date(m.time);
    const now = new Date();
    const diffMs = mDate - now;

    let statusBadge = '';
    let badgeClass = '';

    if (diffMs > 0) {
        statusBadge = ' Upcoming';
        badgeClass = 'pending';
    } else if (diffMs <= 0 && Math.abs(diffMs) < 60 * 60 * 1000) {
        statusBadge = ' In Progress';
        badgeClass = 'danger';
    } else {
        statusBadge = ' Completed';
        badgeClass = 'success';
    }

    if (titleElem) {
        titleElem.innerHTML = ` ${mDate.toLocaleString()}`;
    }

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const isOwner = (m.author || '').toLowerCase() === actor.name.toLowerCase();
    const editMinutesBtn = document.getElementById('editMinutesBtn');
    if (editMinutesBtn) {
        editMinutesBtn.style.display = isOwner ? 'block' : 'none';
    }

    if (metaElem) {
        metaElem.innerHTML = `
            <span>Organizer: <strong>${m.author || 'Anonymous'}</strong></span>
            <span class="badge ${badgeClass}">${statusBadge}</span>
        `;
    }
    if (agendaElem) {
        agendaElem.textContent = m.agenda;
    }
    if (linkContainer) {
        linkContainer.innerHTML = `
            <a href="${m.link}" target="_blank" style="text-decoration:none; display:inline-block;">
                <button class="secondary-btn" style="padding:6px 12px; font-size:0.8rem; width:auto; border-radius:6px; color:#818cf8; background:rgba(129, 140, 248, 0.1); border-color:rgba(129,140,248,0.2);">
                     Join Meeting Link
                </button>
            </a>
        `;
    }
    if (minutesElem) {
        minutesElem.className = ''; // Reset styling classes
        minutesElem.style.color = m.minutes ? '#10b981' : '#6b7280';
        minutesElem.style.fontStyle = m.minutes ? 'normal' : 'italic';
        minutesElem.textContent = m.minutes ? m.minutes : 'Pending meeting completion - Minutes not yet entered.';
    }
}

// Trigger post-meeting minutes update directly within detail modal viewer
window.addMinutesInModal = async function () {
    if (!viewingMeetingId) return;
    await addMinutes(viewingMeetingId);
    renderMeetingDetailContent();
};

// Close modal when user clicks outside the modal box boundary
window.onclick = function (event) {
    const meetingModal = document.getElementById('meetingModal');
    const meetingsLeaderboardModal = document.getElementById('meetingsLeaderboardModal');
    const meetingDetailModal = document.getElementById('meetingDetailModal');
    const editMeetingModal = document.getElementById('editMeetingModal');

    if (event.target === meetingModal) {
        closeMeetingModal();
    }
    if (event.target === meetingsLeaderboardModal) {
        closeMeetingsLeaderboardModal();
    }
    if (event.target === meetingDetailModal) {
        closeMeetingDetailModal();
    }
    if (event.target === editMeetingModal) {
        closeEditMeetingModal();
    }
};

function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        renderMeetings(true);
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);
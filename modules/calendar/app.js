const EVENTS_API = '/api/calendar';
const MEETINGS_API = '/api/meetings';

let viewingEventId = null;
let viewingMeetingId = null;
let editingEventId = null;
let editingMeetingId = null;
let cachedEvents = null;
let cachedMeetings = null;

let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth();
let selectedCalendarDateStr = null;
let showEvents = true;
let showMeetings = true;
let dayViewOpen = false;
let viewingDocs = null;
let docsDropBound = false;

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateStr(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
}

function itemDateStr(item) {
    return item.kind === 'meeting' ? toDateStr(item.time) : toDateStr(item.date);
}

function getActor() {
    return window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
}

function isOwner(item) {
    return (item.author || '').toLowerCase() === getActor().name.toLowerCase();
}

function showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
}

async function fetchCollection(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Server returned error status ' + response.status);
    return response.json();
}

async function getEvents(forceRefresh = false) {
    if (cachedEvents && !forceRefresh) return cachedEvents;
    try {
        cachedEvents = await fetchCollection(EVENTS_API);
        return cachedEvents;
    } catch (e) {
        console.error('Failed to load events.', e);
        return [];
    }
}

async function getMeetings(forceRefresh = false) {
    if (cachedMeetings && !forceRefresh) return cachedMeetings;
    try {
        cachedMeetings = await fetchCollection(MEETINGS_API);
        return cachedMeetings;
    } catch (e) {
        console.error('Failed to load meetings.', e);
        return [];
    }
}

async function getSchedule(forceRefresh = false) {
    const [events, meetings] = await Promise.all([
        getEvents(forceRefresh),
        getMeetings(forceRefresh)
    ]);
    return [
        ...(events || []).map(e => ({ ...e, kind: 'event' })),
        ...(meetings || []).map(m => ({ ...m, kind: 'meeting' }))
    ];
}

async function persistCollection(url, data, kind) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Server returned error status ' + response.status);
    } catch (e) {
        console.error('Failed database write.', e);
        alert(kind === 'meeting'
            ? 'Failed to save meetings to physical database server.'
            : 'Failed to save event. Ensure you have an active internet connection.');
        throw e;
    }

    if (kind === 'meeting') cachedMeetings = null;
    else cachedEvents = null;

    await renderCalendar(true);

    if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
        try { window.parent.loadDashboardStats(); } catch (err) {
            console.warn('Unable to reach parent stats module:', err);
        }
    }
}

async function saveEvents(events) {
    await persistCollection(EVENTS_API, events, 'event');
}

async function saveMeetings(meetings) {
    await persistCollection(MEETINGS_API, meetings, 'meeting');
}

function matchesSearch(item, query) {
    if (!query) return true;
    if (item.kind === 'event') {
        const docNames = (item.documents || []).map(d => d.name).join(' ');
        return [item.title, item.author, item.date, item.loc, docNames]
            .some(v => (v || '').toLowerCase().includes(query));
    }
    const timeLabel = item.time ? new Date(item.time).toLocaleString() : '';
    let status = '';
    if (item.time) {
        const diffMs = new Date(item.time) - new Date();
        if (diffMs > 0) status = 'upcoming';
        else if (Math.abs(diffMs) < 60 * 60 * 1000) status = 'in progress';
        else status = 'completed';
    }
    return [item.agenda, item.minutes, item.author, item.link, timeLabel, status, 'meeting', (item.documents || []).map(d => d.name).join(' ')]
        .some(v => (v || '').toLowerCase().includes(query));
}

function visibleItems(schedule, query) {
    return schedule.filter(item => {
        if (item.kind === 'event' && !showEvents) return false;
        if (item.kind === 'meeting' && !showMeetings) return false;
        return matchesSearch(item, query);
    });
}

function searchQuery() {
    return (document.getElementById('searchCalendar')?.value || '').toLowerCase().trim();
}

window.toggleKindFilter = function (kind) {
    if (kind === 'event') showEvents = !showEvents;
    if (kind === 'meeting') showMeetings = !showMeetings;
    if (!showEvents && !showMeetings) {
        if (kind === 'event') showEvents = true;
        else showMeetings = true;
    }
    document.getElementById('legendEvents')?.classList.toggle('active', showEvents);
    document.getElementById('legendEvents')?.classList.toggle('dimmed', !showEvents);
    document.getElementById('legendMeetings')?.classList.toggle('active', showMeetings);
    document.getElementById('legendMeetings')?.classList.toggle('dimmed', !showMeetings);
    renderCalendar();
};

window.toggleAddMenu = function (event) {
    event.stopPropagation();
    document.getElementById('addMenu')?.classList.toggle('show');
};

function closeAddMenu() {
    document.getElementById('addMenu')?.classList.remove('show');
}

window.changeMonth = function (direction) {
    currentCalendarMonth += direction;
    if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear -= 1;
    } else if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear += 1;
    }
    selectedCalendarDateStr = null;
    renderCalendar();
};

window.jumpToToday = function () {
    const now = new Date();
    currentCalendarYear = now.getFullYear();
    currentCalendarMonth = now.getMonth();
    if (dayViewOpen) closeDayView();
    else renderCalendar();
};

window.refreshCalendar = async function () {
    const icon = document.querySelector('.header-container .refresh-btn i');
    if (icon) icon.classList.add('fa-spin');
    try {
        await renderCalendar(true);
    } catch (e) {
        console.error('Error during calendar refresh:', e);
    } finally {
        if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 500);
    }
};

window.renderCalendar = async function (forceRefresh = false) {
    const loader = document.getElementById('calendarLoader');
    const content = document.getElementById('calendarContent');
    if (loader && content && forceRefresh && !dayViewOpen) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
        const schedule = await getSchedule(forceRefresh);
        const items = visibleItems(schedule, searchQuery());
        renderCalendarGrid(items);
        if (dayViewOpen) renderDayView(items);
    } finally {
        if (loader && content && !dayViewOpen) {
            loader.style.display = 'none';
            content.style.display = '';
        }
    }
};

function renderCalendarGrid(items) {
    const monthYearLabel = document.getElementById('calendarMonthYear');
    const grid = document.getElementById('calendarGrid');
    if (!monthYearLabel || !grid) return;

    monthYearLabel.textContent = `${MONTH_NAMES[currentCalendarMonth]} ${currentCalendarYear}`;
    grid.innerHTML = '';

    const firstOfMonth = new Date(currentCalendarYear, currentCalendarMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(currentCalendarYear, currentCalendarMonth, 1 - startOffset);
    const today = todayStr();

    for (let i = 0; i < 42; i++) {
        const cellDate = new Date(gridStart);
        cellDate.setDate(gridStart.getDate() + i);
        const y = cellDate.getFullYear();
        const m = cellDate.getMonth();
        const d = cellDate.getDate();
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const inMonth = m === currentCalendarMonth;
        const dayItems = items.filter(item => itemDateStr(item) === dateStr);
        const hasEvent = dayItems.some(item => item.kind === 'event');
        const hasMeeting = dayItems.some(item => item.kind === 'meeting');

        const cell = document.createElement('div');
        cell.className = 'cal-day';
        if (!inMonth) cell.classList.add('is-outside');
        if (dateStr === today) cell.classList.add('is-today');
        if (selectedCalendarDateStr === dateStr) cell.classList.add('is-selected');

        const dots = [];
        if (hasEvent) dots.push('<span class="cal-dot event"></span>');
        if (hasMeeting) dots.push('<span class="cal-dot meeting"></span>');

        cell.innerHTML = `
            <span class="cal-day-num">${d}</span>
            <div class="cal-day-dots">${dots.join('')}</div>
        `;
        cell.onclick = () => {
            if (!inMonth) {
                currentCalendarYear = y;
                currentCalendarMonth = m;
            }
            openDayView(dateStr);
        };
        grid.appendChild(cell);
    }
}

function formatDayTitle(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
}

function itemClockTime(item) {
    if (item.kind === 'meeting' && item.time) {
        const d = new Date(item.time);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
    }
    return 'All day';
}

function itemHourFraction(item) {
    if (item.kind !== 'meeting' || !item.time) return null;
    const d = new Date(item.time);
    if (Number.isNaN(d.getTime())) return null;
    return (d.getHours() + d.getMinutes() / 60) / 24;
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function itemDocuments(item) {
    return Array.isArray(item && item.documents) ? item.documents : [];
}

function recordTitle(item) {
    if (!item) return 'Record';
    return item.kind === 'meeting' ? (item.agenda || 'Meeting') : (item.title || 'Event');
}

function safeDocHref(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch (e) { /* ignore */ }
    return '';
}

function docIconForName(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'fa-regular fa-image';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-solid fa-file-excel';
    if (['ppt', 'pptx'].includes(ext)) return 'fa-solid fa-file-powerpoint';
    if (ext === 'pdf') return 'fa-solid fa-file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'fa-solid fa-file-word';
    if (['zip', 'rar', '7z'].includes(ext)) return 'fa-solid fa-file-zipper';
    return 'fa-solid fa-file-lines';
}

function formatDocMeta(doc) {
    const who = doc.postedBy || 'Team';
    if (!doc.postedAt) return who;
    const d = new Date(doc.postedAt);
    if (Number.isNaN(d.getTime())) return who;
    return `${who} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const MAX_INLINE_FILE_BYTES = 512 * 1024;
let viewingDocPayloads = [];

function persistableCollection(list) {
    return (list || []).filter(item => !item.pendingId && !item.pendingType);
}

function canManageDocument(item, doc) {
    const actor = getActor().name.toLowerCase();
    if (!actor) return false;
    if ((doc.postedBy || '').toLowerCase() === actor) return true;
    return (item.author || '').toLowerCase() === actor;
}

function filesCollectionName(kind, id) {
    return `calfiles_${kind}_${id}`;
}

async function getFilePayloads(kind, id) {
    if (!window.FirebaseDB) return [];
    try {
        const data = await window.FirebaseDB.getCollection(filesCollectionName(kind, id));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn('Could not load attached files.', e);
        return [];
    }
}

async function saveFilePayloads(kind, id, payloads) {
    if (!window.FirebaseDB) throw new Error('Database unavailable');
    await window.FirebaseDB.saveCollection(filesCollectionName(kind, id), payloads);
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Could not read file'));
        reader.readAsDataURL(file);
    });
}

function resetPostDocButton() {
    const postBtn = document.getElementById('postDocBtn');
    if (!postBtn) return;
    postBtn.disabled = false;
    postBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post document';
}

function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function removeStoredDocs(kind, id) {
    try {
        if (window.FirebaseDB && kind && id) {
            await window.FirebaseDB.saveCollection(filesCollectionName(kind, id), []);
        }
    } catch (e) {
        console.warn('Could not clear attached files.', e);
    }
}

function resetDocForm() {
    const fileInput = document.getElementById('docFile');
    const nameInput = document.getElementById('docName');
    const urlInput = document.getElementById('docUrl');
    const label = document.getElementById('docFileLabel');
    if (fileInput) fileInput.value = '';
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    if (label) label.textContent = 'Choose a file (max 512 KB) or drop it here';
}

function bindDocsDropZone() {
    if (docsDropBound) return;
    const zone = document.getElementById('docDropZone');
    const fileInput = document.getElementById('docFile');
    if (!zone || !fileInput) return;
    docsDropBound = true;
    ['dragenter', 'dragover'].forEach(type => {
        zone.addEventListener(type, e => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(type => {
        zone.addEventListener(type, e => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('dragover');
        });
    });
    zone.addEventListener('drop', e => {
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
        onDocFileChosen();
    });
}

function setDayChrome(open, dateStr) {
    const backBtn = document.getElementById('calBackBtn');
    const title = document.getElementById('calTitleText');
    const infoBtn = document.getElementById('calInfoBtn');
    const searchWrap = document.getElementById('searchWrap');
    const monthView = document.getElementById('monthView');
    const dayView = document.getElementById('dayView');
    const toolbar = document.getElementById('monthToolbar');
    if (backBtn) backBtn.style.display = open ? 'inline-flex' : 'none';
    if (infoBtn) infoBtn.style.display = open ? 'none' : '';
    if (searchWrap) searchWrap.style.display = open ? 'none' : '';
    if (toolbar) toolbar.style.justifyContent = open ? 'flex-end' : '';
    if (monthView) monthView.style.display = open ? 'none' : '';
    if (dayView) dayView.style.display = open ? '' : 'none';
    if (title) {
        title.textContent = open ? formatDayTitle(dateStr) : 'Calendar';
        title.style.color = open ? '#f472b6' : '';
        title.style.fontSize = open ? '1.35rem' : '';
    }
}

window.openDayView = function (dateStr) {
    dayViewOpen = true;
    selectedCalendarDateStr = dateStr;
    setDayChrome(true, dateStr);
    renderCalendar();
};

window.closeDayView = function () {
    dayViewOpen = false;
    selectedCalendarDateStr = null;
    setDayChrome(false);
    renderCalendar();
};

function renderDayView(items) {
    const dateStr = selectedCalendarDateStr;
    if (!dateStr) return;
    setDayChrome(true, dateStr);

    const labels = document.getElementById('dayTimelineLabels');
    const dots = document.getElementById('dayTimelineDots');
    const cards = document.getElementById('dayCards');
    if (!labels || !dots || !cards) return;

    const hourMarks = [0, 3, 6, 9, 12, 15, 18, 21];
    labels.innerHTML = hourMarks.map((h, i) => {
        const suffix = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
        const cls = i === 0 ? ' style="left:0;transform:translateX(0)"' : i === hourMarks.length - 1 ? ` style="left:${(h / 24) * 100}%;transform:translateX(-100%)"` : ` style="left:${(h / 24) * 100}%"`;
        return `<span${cls}>${suffix}</span>`;
    }).join('');

    const dayItems = items.filter(item => itemDateStr(item) === dateStr);
    dayItems.sort((a, b) => {
        const aFrac = itemHourFraction(a);
        const bFrac = itemHourFraction(b);
        if (aFrac === null && bFrac === null) return 0;
        if (aFrac === null) return -1;
        if (bFrac === null) return 1;
        return aFrac - bFrac;
    });

    dots.innerHTML = '';
    dayItems.forEach(item => {
        const frac = itemHourFraction(item);
        if (frac === null) return;
        const dot = document.createElement('div');
        dot.className = `day-timeline-dot ${item.kind}`;
        dot.style.left = `${Math.min(100, Math.max(0, frac * 100))}%`;
        dot.title = `${item.kind === 'meeting' ? (item.agenda || 'Meeting') : (item.title || 'Event')} · ${itemClockTime(item)}`;
        dots.appendChild(dot);
    });

    cards.innerHTML = '';
    if (dayItems.length === 0) {
        cards.innerHTML = `<p style="font-size:0.85rem; color:#6b7280; font-style:italic; margin:8px auto 0; text-align:center; max-width:480px;">Nothing scheduled for this date. Use Add to create an event or meeting.</p>`;
        return;
    }

    dayItems.forEach(item => {
        const card = document.createElement('div');
        card.className = `day-card ${item.kind}`;
        const title = item.kind === 'meeting' ? (item.agenda || 'Meeting') : (item.title || 'Event');
        const timeLabel = itemClockTime(item);
        const place = item.kind === 'meeting'
            ? (item.author || 'Anonymous')
            : (item.loc || item.author || 'Anonymous');
        const pending = item.pendingType
            ? `<span class="badge" style="font-size:0.65rem; padding:2px 6px; margin-left:6px; background:${item.pendingType === 'create' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)'}; color:${item.pendingType === 'create' ? '#10b981' : '#6366f1'}; border:1px solid ${item.pendingType === 'create' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'};">${item.pendingType.toUpperCase()}</span>`
            : '';
        const icon = item.kind === 'meeting' ? 'fa-solid fa-video' : 'fa-regular fa-calendar';
        const docs = itemDocuments(item);
        card.innerHTML = `
            <div class="day-card-time">${escapeHtml(timeLabel)}</div>
            <div class="day-card-body">
                <strong>${escapeHtml(title)}${pending}</strong>
                <span>${escapeHtml(place)} · ${escapeHtml(timeLabel)}</span>
            </div>
            <div class="day-card-actions">
                <button type="button" class="day-card-docs${docs.length ? ' has-docs' : ''}" title="Documents">
                    <i class="fa-solid fa-file-lines"></i>
                    ${docs.length ? `<span class="day-card-docs-count">${docs.length}</span>` : ''}
                </button>
                <i class="${icon} day-card-icon"></i>
            </div>
        `;
        card.querySelector('.day-card-docs').addEventListener('click', (e) => {
            e.stopPropagation();
            openDocumentsModal(item.kind, item.id);
        });
        card.onclick = () => {
            if (item.kind === 'meeting') openMeetingDetailModal(item.id);
            else openEventDetailModal(item.id);
        };
        cards.appendChild(card);
    });
}

window.openCalendarModal = function () {
    closeAddMenu();
    if (selectedCalendarDateStr) {
        const dateInput = document.getElementById('evDate');
        if (dateInput) dateInput.value = selectedCalendarDateStr;
    }
    showModal('calendarModal');
};

window.closeCalendarModal = function () { hideModal('calendarModal'); };

window.openMeetingModal = function () {
    closeAddMenu();
    if (selectedCalendarDateStr) {
        const timeInput = document.getElementById('mTime');
        if (timeInput && !timeInput.value) timeInput.value = `${selectedCalendarDateStr}T09:00`;
    }
    showModal('meetingModal');
};

window.closeMeetingModal = function () { hideModal('meetingModal'); };

window.openEventDetailModal = function (evId) {
    viewingEventId = evId;
    showModal('eventDetailModal');
    renderEventDetailContent();
};

window.closeEventDetailModal = function () {
    hideModal('eventDetailModal');
    setTimeout(() => { viewingEventId = null; }, 300);
};

window.openMeetingDetailModal = function (mId) {
    viewingMeetingId = mId;
    showModal('meetingDetailModal');
    renderMeetingDetailContent();
};

window.closeMeetingDetailModal = function () {
    hideModal('meetingDetailModal');
    setTimeout(() => { viewingMeetingId = null; }, 300);
};

window.openEditCalendarModal = async function (evId) {
    const events = await getEvents();
    const item = events.find(ev => String(ev.id) === String(evId));
    if (!item) return;
    if (!isOwner(item)) {
        alert('Permission Denied: You can only edit your own events.');
        return;
    }
    editingEventId = evId;
    document.getElementById('editEvId').value = item.id;
    document.getElementById('editEvAuthor').value = item.author || '';
    document.getElementById('editEvTitle').value = item.title || '';
    document.getElementById('editEvDate').value = item.date || '';
    document.getElementById('editEvLoc').value = item.loc || '';
    showModal('editCalendarModal');
};

window.closeEditCalendarModal = function () {
    hideModal('editCalendarModal');
    setTimeout(() => { editingEventId = null; }, 300);
};

window.openEditMeetingModal = async function (mId) {
    const meetings = await getMeetings();
    const item = meetings.find(m => String(m.id) === String(mId));
    if (!item) return;
    if (!isOwner(item)) {
        alert('Permission Denied: You can only edit your own meetings.');
        return;
    }
    editingMeetingId = mId;
    document.getElementById('editMId').value = item.id;
    document.getElementById('editMAuthor').value = item.author || '';
    document.getElementById('editMTime').value = item.time || '';
    document.getElementById('editMLink').value = item.link || '';
    document.getElementById('editMAgenda').value = item.agenda || '';
    showModal('editMeetingModal');
};

window.closeEditMeetingModal = function () {
    hideModal('editMeetingModal');
    setTimeout(() => { editingMeetingId = null; }, 300);
};

window.addEvent = async function () {
    const author = document.getElementById('evAuthor').value.trim();
    const title = document.getElementById('evTitle').value.trim();
    const date = document.getElementById('evDate').value;
    const loc = document.getElementById('evLoc').value.trim();
    if (!author || !title || !date || !loc) return alert('Please complete all form fields');

    const events = await getEvents();
    events.push({ id: Date.now(), author, title, date, loc, documents: [] });
    selectedCalendarDateStr = date;
    const [y, m] = date.split('-').map(Number);
    currentCalendarYear = y;
    currentCalendarMonth = m - 1;
    dayViewOpen = true;
    await saveEvents(events);

    const actor = getActor();
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `${title} (${date})`,
        module: 'Calendar',
        excludeEmail: actor.email
    });

    document.getElementById('evAuthor').value = '';
    document.getElementById('evTitle').value = '';
    document.getElementById('evDate').value = '';
    document.getElementById('evLoc').value = '';
    closeCalendarModal();
};

window.addMeeting = async function () {
    const author = document.getElementById('mAuthor').value.trim();
    const time = document.getElementById('mTime').value;
    const link = document.getElementById('mLink').value.trim();
    const agenda = document.getElementById('mAgenda').value.trim();
    if (!author || !time || !link || !agenda) return alert('Fill in all fields');

    const meetings = await getMeetings();
    meetings.push({ id: Date.now(), author, time, link, agenda, minutes: '', documents: [] });
    selectedCalendarDateStr = toDateStr(time);
    const [y, m] = selectedCalendarDateStr.split('-').map(Number);
    currentCalendarYear = y;
    currentCalendarMonth = m - 1;
    dayViewOpen = true;
    await saveMeetings(meetings);

    const actor = getActor();
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `meeting on ${new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        module: 'Calendar',
        excludeEmail: actor.email
    });

    document.getElementById('mAuthor').value = '';
    document.getElementById('mTime').value = '';
    document.getElementById('mLink').value = '';
    document.getElementById('mAgenda').value = '';
    closeMeetingModal();
};

window.saveEditEvent = async function () {
    const id = parseInt(document.getElementById('editEvId').value);
    const author = document.getElementById('editEvAuthor').value.trim();
    const title = document.getElementById('editEvTitle').value.trim();
    const date = document.getElementById('editEvDate').value;
    const loc = document.getElementById('editEvLoc').value.trim();
    if (!author || !title || !date || !loc) return alert('Please complete all form fields');

    const actor = getActor();
    const events = await getEvents(true);
    const item = events.find(ev => String(ev.id) === String(id));
    if (!item) return;
    if (!isOwner(item)) {
        alert('Permission Denied: You can only edit your own events.');
        return;
    }
    item.author = author;
    item.title = title;
    item.date = date;
    item.loc = loc;
    selectedCalendarDateStr = date;
    await saveEvents(events);
    window.notifyTeam && window.notifyTeam({
        action: 'edited',
        actorName: actor.name,
        itemName: `${title} (${date})`,
        module: 'Calendar',
        excludeEmail: actor.email
    });
    closeEditCalendarModal();
};

window.saveEditMeeting = async function () {
    const id = parseInt(document.getElementById('editMId').value);
    const author = document.getElementById('editMAuthor').value.trim();
    const time = document.getElementById('editMTime').value;
    const link = document.getElementById('editMLink').value.trim();
    const agenda = document.getElementById('editMAgenda').value.trim();
    if (!author || !time || !link || !agenda) return alert('Fill in all fields');

    const actor = getActor();
    const meetings = await getMeetings(true);
    const item = meetings.find(m => String(m.id) === String(id));
    if (!item) return;
    if (!isOwner(item)) {
        alert('Permission Denied: You can only edit your own meetings.');
        return;
    }
    item.author = author;
    item.time = time;
    item.link = link;
    item.agenda = agenda;
    selectedCalendarDateStr = toDateStr(time);
    await saveMeetings(meetings);
    window.notifyTeam && window.notifyTeam({
        action: 'edited',
        actorName: actor.name,
        itemName: `meeting on ${new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        module: 'Calendar',
        excludeEmail: actor.email
    });
    closeEditMeetingModal();
};

window.deleteEvent = async function (id) {
    const actor = getActor();
    const events = await getEvents(true);
    const deletedEvent = events.find(ev => String(ev.id) === String(id));
    if (deletedEvent && !isOwner(deletedEvent)) {
        alert('Permission Denied: You can only delete your own events.');
        return;
    }
    if (!confirm('Are you sure you want to remove this event from the calendar?')) return;
    await removeStoredDocs('event', deletedEvent && deletedEvent.id);
    const filtered = events.filter(ev => String(ev.id) !== String(id));
    if (String(viewingEventId) === String(id)) closeEventDetailModal();
    if (viewingDocs && String(viewingDocs.id) === String(id)) closeDocumentsModal();
    await saveEvents(filtered);
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedEvent ? `${deletedEvent.title} (${deletedEvent.date})` : 'a calendar event',
        module: 'Calendar',
        excludeEmail: actor.email
    });
};

window.deleteMeeting = async function (id) {
    const actor = getActor();
    const meetings = await getMeetings(true);
    const deletedMeeting = meetings.find(m => String(m.id) === String(id));
    if (deletedMeeting && !isOwner(deletedMeeting)) {
        alert('Permission Denied: You can only delete your own meetings.');
        return;
    }
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    await removeStoredDocs('meeting', deletedMeeting && deletedMeeting.id);
    const filtered = meetings.filter(m => String(m.id) !== String(id));
    if (String(viewingMeetingId) === String(id)) closeMeetingDetailModal();
    if (viewingDocs && String(viewingDocs.id) === String(id)) closeDocumentsModal();
    await saveMeetings(filtered);
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedMeeting
            ? `meeting on ${new Date(deletedMeeting.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
            : 'a meeting',
        module: 'Calendar',
        excludeEmail: actor.email
    });
};

async function addMinutes(id) {
    const meetings = await getMeetings();
    const index = meetings.findIndex(m => String(m.id) === String(id));
    if (index === -1) return;
    if (!isOwner(meetings[index])) {
        alert('Permission Denied: You can only add/update minutes for meetings you organized.');
        return;
    }
    const currentMinutes = meetings[index].minutes || '';
    const minutes = prompt('Add/Update post-meeting minutes:', currentMinutes);
    if (minutes === null) return;
    meetings[index].minutes = minutes.trim();
    await saveMeetings(meetings);
}

window.addMinutesInModal = async function () {
    if (!viewingMeetingId) return;
    await addMinutes(viewingMeetingId);
    renderMeetingDetailContent();
};

function ownerActionButtons(kind, id) {
    const editFn = kind === 'meeting' ? `openEditMeetingModal(${id})` : `openEditCalendarModal(${id})`;
    const deleteFn = kind === 'meeting' ? `deleteMeeting(${id})` : `deleteEvent(${id})`;
    const accent = kind === 'meeting' ? '#818cf8' : '#f472b6';
    const accentBg = kind === 'meeting' ? 'rgba(129, 140, 248, 0.1)' : 'rgba(244, 114, 182, 0.1)';
    const accentBorder = kind === 'meeting' ? 'rgba(129, 140, 248, 0.15)' : 'rgba(244, 114, 182, 0.15)';
    return `
        <button class="secondary-btn" style="padding:6px 10px; font-size:0.75rem; width:auto; border-radius:6px; background:${accentBg}; color:${accent}; margin-bottom:0; border: 1px solid ${accentBorder};" onclick="${editFn}">
            <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button class="secondary-btn" style="padding:6px 10px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0; border: 1px solid rgba(239, 68, 68, 0.15);" onclick="${deleteFn}">
            <i class="fa-solid fa-trash"></i> Delete
        </button>
    `;
}

async function renderEventDetailContent() {
    if (!viewingEventId) return;
    const events = await getEvents();
    const ev = events.find(item => String(item.id) === String(viewingEventId));
    if (!ev) {
        closeEventDetailModal();
        return;
    }

    const isToday = ev.date === todayStr();
    const titleElem = document.getElementById('detailEventTitle');
    const metaElem = document.getElementById('detailEventMeta');
    const dateElem = document.getElementById('detailEventDate');
    const locContainer = document.getElementById('detailEventLocContainer');
    const actions = document.getElementById('eventDetailActions');

    if (titleElem) titleElem.textContent = ev.title;
    if (metaElem) {
        metaElem.innerHTML = `
            <span>Organizer: <strong>${ev.author || 'Anonymous'}</strong></span>
            ${isToday ? '<span class="badge danger" style="font-size:0.7rem; background: #ef4444; padding: 1px 4px; border-radius: 3px; color: white;"> TODAY</span>' : ''}
        `;
    }
    if (dateElem) {
        dateElem.textContent = new Date(ev.date + 'T00:00:00').toLocaleDateString(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
    if (locContainer) {
        const isLink = (ev.loc || '').startsWith('http://') || (ev.loc || '').startsWith('https://');
        locContainer.innerHTML = isLink
            ? `<a href="${ev.loc}" target="_blank" style="color:#f472b6; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:500;">${ev.loc}</a>`
            : ev.loc;
    }
    if (actions) {
        const docsBtn = `<button class="secondary-btn" style="padding:6px 10px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(244,114,182,0.1); color:#f472b6; margin-bottom:0; border: 1px solid rgba(244,114,182,0.15);" onclick="openDocumentsModal('event', ${ev.id})"><i class="fa-solid fa-file-lines"></i> Documents</button>`;
        actions.innerHTML = docsBtn + (isOwner(ev) ? ownerActionButtons('event', ev.id) : '');
    }
}

async function renderMeetingDetailContent() {
    if (!viewingMeetingId) return;
    const meetings = await getMeetings();
    const m = meetings.find(item => String(item.id) === String(viewingMeetingId));
    if (!m) {
        closeMeetingDetailModal();
        return;
    }

    const mDate = new Date(m.time);
    const diffMs = mDate - new Date();
    let statusBadge = 'Completed';
    let badgeClass = 'success';
    if (diffMs > 0) {
        statusBadge = 'Upcoming';
        badgeClass = 'pending';
    } else if (Math.abs(diffMs) < 60 * 60 * 1000) {
        statusBadge = 'In Progress';
        badgeClass = 'danger';
    }

    const titleElem = document.getElementById('detailMeetingTitle');
    const metaElem = document.getElementById('detailMeetingMeta');
    const agendaElem = document.getElementById('detailMeetingAgenda');
    const linkContainer = document.getElementById('detailMeetingLinkContainer');
    const minutesElem = document.getElementById('detailMeetingMinutes');
    const editMinutesBtn = document.getElementById('editMinutesBtn');
    const actions = document.getElementById('meetingDetailActions');
    const owner = isOwner(m);

    if (titleElem) titleElem.textContent = mDate.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (editMinutesBtn) editMinutesBtn.style.display = owner ? 'block' : 'none';
    if (metaElem) {
        metaElem.innerHTML = `
            <span>Organizer: <strong>${m.author || 'Anonymous'}</strong></span>
            <span class="badge ${badgeClass}">${statusBadge}</span>
        `;
    }
    if (agendaElem) agendaElem.textContent = m.agenda;
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
        minutesElem.style.color = m.minutes ? '#10b981' : '#6b7280';
        minutesElem.style.fontStyle = m.minutes ? 'normal' : 'italic';
        minutesElem.textContent = m.minutes ? m.minutes : 'Pending meeting completion - Minutes not yet entered.';
    }
    if (actions) {
        const docsBtn = `<button class="secondary-btn" style="padding:6px 10px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(129,140,248,0.1); color:#818cf8; margin-bottom:0; border: 1px solid rgba(129,140,248,0.15);" onclick="openDocumentsModal('meeting', ${m.id})"><i class="fa-solid fa-file-lines"></i> Documents</button>`;
        actions.innerHTML = docsBtn + (owner ? ownerActionButtons('meeting', m.id) : '');
    }
}

window.openDocumentsModal = async function (kind, id) {
    viewingDocs = { kind, id };
    bindDocsDropZone();
    resetDocForm();
    showModal('documentsModal');
    await renderDocumentsContent();
};

window.closeDocumentsModal = function () {
    hideModal('documentsModal');
    setTimeout(() => { viewingDocs = null; resetDocForm(); }, 300);
};

window.onDocFileChosen = function () {
    const fileInput = document.getElementById('docFile');
    const nameInput = document.getElementById('docName');
    const label = document.getElementById('docFileLabel');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
        if (label) label.textContent = 'Choose a file (max 512 KB) or drop it here';
        return;
    }
    if (label) label.textContent = file.name;
    if (nameInput && !nameInput.value.trim()) nameInput.value = file.name.replace(/\.[^.]+$/, '') || file.name;
};

async function loadViewingRecord(forceRefresh = false) {
    if (!viewingDocs) return null;
    const list = viewingDocs.kind === 'meeting'
        ? await getMeetings(forceRefresh)
        : await getEvents(forceRefresh);
    const item = (list || []).find(r => String(r.id) === String(viewingDocs.id));
    if (!item) return null;
    return { item, list, kind: viewingDocs.kind };
}

async function renderDocumentsContent() {
    const titleEl = document.getElementById('documentsModalTitle');
    const subEl = document.getElementById('documentsModalSubtitle');
    const listEl = document.getElementById('documentsList');
    const drop = document.getElementById('docDropZone');
    const postBtn = document.getElementById('postDocBtn');
    if (!listEl) return;

    const loaded = await loadViewingRecord();
    if (!loaded) {
        viewingDocPayloads = [];
        listEl.innerHTML = '<div class="docs-empty">This record is no longer available.</div>';
        return;
    }

    const { item, kind } = loaded;
    const accent = kind === 'meeting' ? '#818cf8' : '#f472b6';
    const docs = itemDocuments(item);
    viewingDocPayloads = await getFilePayloads(kind, item.id);
    if (titleEl) {
        titleEl.style.color = accent;
        titleEl.innerHTML = `<i class="fa-solid fa-file-lines"></i> Documents`;
    }
    if (subEl) subEl.textContent = recordTitle(item);
    if (drop) drop.classList.toggle('meeting', kind === 'meeting');
    if (postBtn) {
        postBtn.style.background = accent;
        postBtn.style.borderColor = accent;
        postBtn.style.color = 'white';
    }

    if (!docs.length) {
        listEl.innerHTML = '<div class="docs-empty">No documents posted yet. Attach a file or paste a link below.</div>';
        return;
    }

    listEl.innerHTML = docs.map(doc => {
        const payload = viewingDocPayloads.find(p => String(p.id) === String(doc.id));
        const href = payload && payload.dataUrl ? '' : safeDocHref(doc.url);
        const name = escapeHtml(doc.name || 'Untitled');
        const meta = escapeHtml(formatDocMeta(doc));
        const icon = docIconForName(doc.name || doc.url || '');
        const canDelete = canManageDocument(item, doc);
        const safeId = String(doc.id).replace(/'/g, '');
        const openAttr = href
            ? `href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"`
            : `href="#" onclick="openPostedDocument('${safeId}'); return false;"`;
        return `
            <div class="doc-row ${kind}">
                <div class="doc-row-icon"><i class="${icon}"></i></div>
                <div class="doc-row-body">
                    <a ${openAttr}>${name}</a>
                    <span>${meta}</span>
                </div>
                ${canDelete ? `<button type="button" class="doc-row-del" title="Remove" onclick="deleteRecordDocument('${safeId}')"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
        `;
    }).join('');
}

window.openPostedDocument = function (docId) {
    const payload = viewingDocPayloads.find(p => String(p.id) === String(docId));
    if (payload && payload.dataUrl) {
        downloadDataUrl(payload.dataUrl, payload.name || 'document');
        return;
    }
    const href = safeDocHref(payload && payload.url);
    if (href) window.open(href, '_blank', 'noopener');
};

window.postRecordDocument = async function () {
    if (!viewingDocs) return;
    const nameInput = document.getElementById('docName');
    const urlInput = document.getElementById('docUrl');
    const fileInput = document.getElementById('docFile');
    const postBtn = document.getElementById('postDocBtn');
    const file = fileInput && fileInput.files && fileInput.files[0];
    let name = (nameInput && nameInput.value.trim()) || (file && file.name) || '';
    let url = (urlInput && urlInput.value.trim()) || '';
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;

    if (!name) return alert('Give the document a name.');
    if (!file && !url) return alert('Attach a file or paste a link.');
    if (file && file.size > MAX_INLINE_FILE_BYTES) {
        return alert('This file is larger than 512 KB. Upload it to Drive and paste the share link instead.');
    }

    const loaded = await loadViewingRecord(true);
    if (!loaded) return alert('This record is no longer available.');
    if (loaded.item.pendingType) return alert('Documents can be posted after this record is approved.');

    const listToSave = persistableCollection(loaded.list);
    if (!listToSave.some(r => String(r.id) === String(loaded.item.id))) {
        return alert('Documents can be posted after this record is approved.');
    }

    const actor = getActor();
    const docId = Date.now();
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Posting...';
    }

    try {
        let finalUrl = url;
        if (file) {
            const dataUrl = await fileToDataUrl(file);
            const payloads = await getFilePayloads(loaded.kind, loaded.item.id);
            payloads.push({ id: docId, name, dataUrl });
            await saveFilePayloads(loaded.kind, loaded.item.id, payloads);
            finalUrl = '';
        }

        if (!file && !finalUrl) {
            alert('Attach a file or paste a link.');
            return;
        }

        if (!Array.isArray(loaded.item.documents)) loaded.item.documents = [];
        loaded.item.documents.push({
            id: docId,
            name,
            url: finalUrl,
            hasFile: !!file,
            postedBy: actor.name,
            postedAt: new Date().toISOString()
        });

        if (loaded.kind === 'meeting') await saveMeetings(listToSave);
        else await saveEvents(listToSave);

        window.notifyTeam && window.notifyTeam({
            action: 'added',
            actorName: actor.name,
            itemName: `document "${name}" on ${recordTitle(loaded.item)}`,
            module: 'Calendar',
            excludeEmail: actor.email
        });

        resetDocForm();
        await renderDocumentsContent();
    } catch (e) {
        console.error('Document post failed.', e);
        alert('Could not post this document. Try a smaller file or paste a link.');
    } finally {
        resetPostDocButton();
    }
};

window.deleteRecordDocument = async function (docId) {
    const loaded = await loadViewingRecord(true);
    if (!loaded) return;
    const docs = itemDocuments(loaded.item);
    const doc = docs.find(d => String(d.id) === String(docId));
    if (!doc) return;
    if (!canManageDocument(loaded.item, doc)) {
        alert('You can only remove documents you posted, or documents on your own record.');
        return;
    }
    if (!confirm(`Remove "${doc.name || 'this document'}"?`)) return;

    loaded.item.documents = docs.filter(d => String(d.id) !== String(docId));
    const listToSave = persistableCollection(loaded.list);
    try {
        const payloads = (await getFilePayloads(loaded.kind, loaded.item.id))
            .filter(p => String(p.id) !== String(docId));
        await saveFilePayloads(loaded.kind, loaded.item.id, payloads);
        if (loaded.kind === 'meeting') await saveMeetings(listToSave);
        else await saveEvents(listToSave);
        await renderDocumentsContent();
    } catch (e) {
        console.error('Failed to remove document.', e);
        alert('Could not remove this document.');
    }
};

window.onclick = function (event) {
    const addBtn = document.getElementById('addMenuBtn');
    const addMenu = document.getElementById('addMenu');
    if (!addBtn?.contains(event.target) && !addMenu?.contains(event.target)) {
        closeAddMenu();
    }
    const modalIds = [
        ['calendarModal', closeCalendarModal],
        ['eventDetailModal', closeEventDetailModal],
        ['editCalendarModal', closeEditCalendarModal],
        ['meetingModal', closeMeetingModal],
        ['meetingDetailModal', closeMeetingDetailModal],
        ['editMeetingModal', closeEditMeetingModal],
        ['documentsModal', closeDocumentsModal]
    ];
    modalIds.forEach(([id, closeFn]) => {
        if (event.target === document.getElementById(id)) closeFn();
    });
};

function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        renderCalendar(true);
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);

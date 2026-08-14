const API_URL = '/api/messages';

// Pagination & State variables
let viewingMessageId = null;
let editingMessageId = null;
let cachedMessages = null;
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;

function encrypt(text, key) {
    let result = "";
    for (let i = 0, j = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        const k = key.charCodeAt(j % key.length);
        result += String.fromCharCode(c ^ k);
        j++;
    }
    return btoa(result);
}

function decrypt(cipherText, key) {
    try {
        const decoded = atob(cipherText);
        let result = "";
        for (let i = 0, j = 0; i < decoded.length; i++) {
            const c = decoded.charCodeAt(i);
            const k = key.charCodeAt(j % key.length);
            result += String.fromCharCode(c ^ k);
            j++;
        }
        // Verify output matches ASCII readable characters to catch wrong key decryptions
        if (/[\x00-\x08\x0E-\x1F\x7F]/.test(result)) {
            return "[Decryption Key Mismatch]";
        }
        return result;
    } catch (e) {
        return "[Invalid Cipher Block]";
    }
}

// ---- Password visibility toggle ----
window.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input || !btn) return;
    const icon = btn.querySelector('i');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    if (icon) {
        icon.className = showing ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    }
    btn.title = showing ? 'Show encryption key' : 'Hide encryption key';
    btn.setAttribute('aria-label', btn.title);
};

// ---- Rich text editor helpers (same pattern as Apps module) ----
function sanitizeHtml(html) {
    const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'DIV', 'A', 'P', 'SPAN']);
    const template = document.createElement('template');
    template.innerHTML = html;

    const walk = (node) => {
        [...node.childNodes].forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE) {
                if (!allowedTags.has(child.tagName)) {
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

async function getMessages(forceRefresh = false) {
    if (cachedMessages && !forceRefresh) {
        return cachedMessages;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API issue');
        cachedMessages = await response.json();
        return cachedMessages;
    } catch (e) {
        console.error('Error fetching messages:', e);
        return [];
    }
}

async function saveMessages(msgs) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msgs)
        });
        if (!response.ok) throw new Error('API issue');
        cachedMessages = null; // Clear local cache
        await renderMessages(true); // Force fresh render
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving messages:', e);
        alert('Failed to transmit message data to server.');
    }
}

async function sendMessage() {
    const author = document.getElementById('mAuthor').value.trim();
    const key = document.getElementById('sharedKey').value.trim();
    const rawHtml = getEditorHtml('plainMsg');
    const rawText = stripHtml(rawHtml);

    if (!author || !key || !rawText) return alert('Your Name, secret key and message content are required');

    const encryptedData = encrypt(rawHtml, key);
    const msgs = await getMessages();

    msgs.push({
        id: Date.now(),
        author,
        cipher: encryptedData,
        timestamp: new Date().toLocaleTimeString()
    });

    await saveMessages(msgs);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: 'an encrypted message',
        module: 'Messages',
        excludeEmail: actor.email
    });

    document.getElementById('mAuthor').value = '';
    setEditorHtml('plainMsg', '');
    document.getElementById('sharedKey').value = '';
    document.getElementById('sharedKey').type = 'password';
    const toggleBtn = document.querySelector('#skillModal .password-toggle');
    if (toggleBtn) {
        const icon = toggleBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-eye';
        toggleBtn.title = 'Show encryption key';
        toggleBtn.setAttribute('aria-label', 'Show encryption key');
    }

    closeMessageModal();
}

async function deleteMessage(id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const msgs = await getMessages(true);
    const deletedMsg = msgs.find(m => m.id === id);
    if (deletedMsg && (deletedMsg.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only delete your own messages.");
        return;
    }
    if (!confirm('Permanently delete this message from physical server storage?')) return;
    const filtered = msgs.filter(m => m.id !== id);
    if (viewingMessageId === id) {
        closeMessageDetailModal();
    }
    await saveMessages(filtered);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: 'an encrypted message',
        module: 'Messages',
        excludeEmail: actor.email
    });
}

async function clearAllMessages() {
    if (!confirm('Are you sure you want to delete all of your own encrypted messages? This cannot be undone.')) return;
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const msgs = await getMessages(true);
    const remaining = msgs.filter(m => (m.author || '').toLowerCase() !== actor.name.toLowerCase());
    await saveMessages(remaining);
}

function onDecryptKeyInput() {
    const dKey = document.getElementById('decryptKey').value.trim();
    const statusBadge = document.getElementById('decryptionStatus');

    if (dKey) {
        statusBadge.className = 'badge success';
        statusBadge.innerHTML = ' Decrypting';
    } else {
        statusBadge.className = 'badge danger';
        statusBadge.innerHTML = ' Locked';
    }

    renderMessages();
}

// Navigation controllers
window.changeMainPage = function (direction) {
    currentPage += direction;
    renderMessages();
};

window.changeLeaderboardPage = function (direction) {
    currentLeaderboardPage += direction;
    renderMessages();
};

// Refresh function for top right refresh button
window.refreshMessages = async function () {
    const icon = document.querySelector('.header-container .refresh-btn i');
    if (icon) {
        icon.classList.add('fa-spin');
    }
    try {
        await renderMessages(true);
    } catch (e) {
        console.error('Error during manual messages refresh:', e);
    } finally {
        if (icon) {
            setTimeout(() => {
                icon.classList.remove('fa-spin');
            }, 500);
        }
    }
};

async function renderMessages(forceRefresh = false) {
    const loader = document.getElementById('messagesLoader');
    const content = document.getElementById('messagesContent');
    if (loader && content) {
        loader.style.display = '';
        content.style.display = 'none';
    }
    try {
    const container = document.getElementById('msgStream');
    const board = document.getElementById('messagesLeaderboard');
    const mainPaginationContainer = document.getElementById('mainPagination');
    const lbPaginationContainer = document.getElementById('leaderboardPagination');

    if (!container || !board) return;

    const msgs = await getMessages(forceRefresh);
    const searchQuery = (document.getElementById('searchMessages')?.value || '').toLowerCase().trim();
    const dKey = document.getElementById('decryptKey').value.trim();

    // Reset pagination to Page 1 if query text changes
    if (searchQuery !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = searchQuery;
    }

    container.innerHTML = '';
    board.innerHTML = '';

    // Render Contributor Leaderboard (always generated using complete data)
    const counts = {};
    msgs.forEach(m => {
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
                    ${val} message${val > 1 ? 's' : ''}
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
                    <button onclick="changeLeaderboardPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#34d399'}; border: none; color: ${prevDisabled ? '#4b5563' : '#111827'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <button onclick="changeLeaderboardPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#34d399'}; border: none; color: ${nextDisabled ? '#4b5563' : '#111827'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }
    }

    // Filter messages based on raw data, timestamp or matches with decrypted text (if unlocked)
    const filteredMsgs = msgs.filter(m => {
        let decryptedText = "";
        if (dKey) {
            const decResult = decrypt(m.cipher, dKey);
            if (decResult !== "[Decryption Key Mismatch]" && decResult !== "[Invalid Cipher Block]") {
                decryptedText = stripHtml(decResult);
            }
        }
        return m.cipher.toLowerCase().includes(searchQuery) ||
            m.timestamp.toLowerCase().includes(searchQuery) ||
            (m.author && m.author.toLowerCase().includes(searchQuery)) ||
            decryptedText.toLowerCase().includes(searchQuery);
    });

    const totalCount = filteredMsgs.length;

    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <p>${searchQuery ? 'No encrypted segments match your search query.' : 'Cipher stream empty. Encrypt and transmit a message to see it here.'}</p>
            </div>
        `;
        if (mainPaginationContainer) mainPaginationContainer.innerHTML = '';
        return;
    }

    // Newest messages first
    filteredMsgs.sort((a, b) => b.id - a.id);

    // Handle History pagination parameters
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
        currentPage = maxPage;
    }

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedMsgs = filteredMsgs.slice(startIdx, endIdx);

    paginatedMsgs.forEach(m => {
        let isDecrypted = false;
        let isError = false;

        if (dKey) {
            const decResult = decrypt(m.cipher, dKey);
            if (decResult === "[Decryption Key Mismatch]" || decResult === "[Invalid Cipher Block]") {
                isError = true;
            } else {
                isDecrypted = true;
            }
        }

        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
        const isOwner = (m.author || '').toLowerCase() === actor.name.toLowerCase();
        const actionButtons = isOwner ? `
            <div style="display: flex; align-items: center; gap: 4px;">
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(52, 211, 153, 0.1); color:#34d399; margin-bottom:0; border: 1px solid rgba(52, 211, 153, 0.15);" onclick="event.stopPropagation(); openEditMessageModal(${m.id})">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteMessage(${m.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = 'card accordion-card';
        card.style.cursor = 'pointer';
        card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        card.style.borderLeft = isDecrypted ? '4px solid #10b981' : (isError ? '4px solid #ef4444' : '4px solid #475569');
        card.style.transition = 'all 0.2s ease';
        card.setAttribute('onclick', `openMessageDetailModal(${m.id})`);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding: 2px;">
                <strong style="font-size: 0.8rem; color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%;">
                     ${m.timestamp}
                </strong>
                ${actionButtons}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px; margin-top: 4px; font-size: 0.75rem;">
                <span style="color: #cbd5e1;"> ${m.author || 'Anonymous'}</span>
                <span style="color:${isDecrypted ? '#10b981' : (isError ? '#ef4444' : '#6b7280')}; font-size: 0.75rem;">
                </span>
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
                <button onclick="changeMainPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#34d399'}; border: none; color: ${prevDisabled ? '#4b5563' : '#111827'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button onclick="changeMainPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#34d399'}; border: none; color: ${nextDisabled ? '#4b5563' : '#111827'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
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

// Modal handling functions - Transmit Message Modal
window.openMessageModal = function () {
    const modal = document.getElementById('skillModal'); // Reuses HTML's modal id
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeMessageModal = function () {
    const modal = document.getElementById('skillModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Senders Leaderboard Modal
window.openMessagesLeaderboardModal = function () {
    const modal = document.getElementById('messagesLeaderboardModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
    renderMessages();
};

window.closeMessagesLeaderboardModal = function () {
    const modal = document.getElementById('messagesLeaderboardModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Message Detail Viewer Modal
window.openMessageDetailModal = function (msgId) {
    viewingMessageId = mId = msgId;
    const modal = document.getElementById('messageDetailModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
    renderMessageDetailContent();
};

window.closeMessageDetailModal = function () {
    const modal = document.getElementById('messageDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        viewingMessageId = null;
    }, 300);
};

// Modal handling functions - Edit Message Modal
window.openEditMessageModal = async function (msgId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const list = await getMessages();
    const item = list.find(m => m.id === msgId);
    if (!item) return;
    if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only edit your own messages.");
        return;
    }
    editingMessageId = mId = msgId;

    document.getElementById('editMsgId').value = item.id;
    document.getElementById('editMsgAuthor').value = item.author || '';
    document.getElementById('editSharedKey').value = '';
    document.getElementById('editSharedKey').type = 'password';
    setEditorHtml('editPlainMsg', '');
    const editToggle = document.querySelector('#editMessageModal .password-toggle');
    if (editToggle) {
        const icon = editToggle.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-eye';
        editToggle.title = 'Show encryption key';
        editToggle.setAttribute('aria-label', 'Show encryption key');
    }

    const modal = document.getElementById('editMessageModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
};

window.closeEditMessageModal = function () {
    const modal = document.getElementById('editMessageModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        editingMessageId = null;
    }, 300);
};

// Save Edit Action (Encrypts edited plaintext payload with secret key)
window.saveEditMessage = async function () {
    const id = parseInt(document.getElementById('editMsgId').value);
    const author = document.getElementById('editMsgAuthor').value.trim();
    const key = document.getElementById('editSharedKey').value.trim();
    const rawHtml = getEditorHtml('editPlainMsg');
    const rawText = stripHtml(rawHtml);

    if (!author || !key || !rawText) return alert('Your name, encryption key, and new message content are required');

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const encryptedData = encrypt(rawHtml, key);
    const list = await getMessages(true);
    const item = list.find(m => m.id === id);
    if (item) {
        if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own messages.");
            return;
        }
        item.author = author;
        item.cipher = encryptedData;
        await saveMessages(list);

        // Broadcast email notification to all team members
        window.notifyTeam && window.notifyTeam({
            action: 'edited',
            actorName: actor.name,
            itemName: 'an encrypted message',
            module: 'Messages',
            excludeEmail: actor.email
        });
    }
    closeEditMessageModal();
};

// Sub-render function to display selected message details inside modal view details
async function renderMessageDetailContent() {
    if (!viewingMessageId) return;
    const list = await getMessages();
    const m = list.find(item => item.id === viewingMessageId);
    if (!m) {
        closeMessageDetailModal();
        return;
    }

    const titleElem = document.getElementById('detailMessageTitle');
    const metaElem = document.getElementById('detailMessageMeta');
    const cipherElem = document.getElementById('detailMessageCipher');
    const decryptedElem = document.getElementById('detailMessageDecrypted');
    const iconContainer = document.getElementById('detailMessageIconContainer');

    const dKey = document.getElementById('decryptKey').value.trim();
    let decrypted = "[ENCRYPTED CIPHERTEXT]";
    let isDecrypted = false;
    let isError = false;

    if (dKey) {
        const decResult = decrypt(m.cipher, dKey);
        if (decResult === "[Decryption Key Mismatch]" || decResult === "[Invalid Cipher Block]") {
            decrypted = decResult;
            isError = true;
        } else {
            decrypted = decResult;
            isDecrypted = true;
        }
    }

    if (titleElem) {
        titleElem.innerHTML = ` Message Detail`;
    }
    if (metaElem) {
        metaElem.innerHTML = `
            <span>Sender: <strong>${m.author || 'Anonymous'}</strong></span>
            <span>Time: <strong>${m.timestamp}</strong></span>
        `;
    }
    if (cipherElem) {
        cipherElem.textContent = m.cipher;
    }
    if (decryptedElem) {
        decryptedElem.style.color = isDecrypted ? '#f3f4f6' : (isError ? '#ef4444' : '#6b7280');
        decryptedElem.style.fontStyle = isDecrypted ? 'normal' : 'italic';
        if (isDecrypted) {
            decryptedElem.innerHTML = sanitizeHtml(decrypted);
        } else {
            decryptedElem.textContent = decrypted;
        }
    }
    if (iconContainer) {
        iconContainer.style.color = isDecrypted ? '#10b981' : (isError ? '#ef4444' : '#6b7280');
        iconContainer.innerHTML = ``;
    }
}

// Close modal when user clicks outside the modal box boundary
window.onclick = function (event) {
    const publishModal = document.getElementById('skillModal'); // Publish modal ID
    const messagesLeaderboardModal = document.getElementById('messagesLeaderboardModal');
    const messageDetailModal = document.getElementById('messageDetailModal');
    const editMessageModal = document.getElementById('editMessageModal');

    if (event.target === publishModal) {
        closeMessageModal();
    }
    if (event.target === messagesLeaderboardModal) {
        closeMessagesLeaderboardModal();
    }
    if (event.target === messageDetailModal) {
        closeMessageDetailModal();
    }
    if (event.target === editMessageModal) {
        closeEditMessageModal();
    }
};

function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        initRichTextToolbars();
        renderMessages(true);
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);
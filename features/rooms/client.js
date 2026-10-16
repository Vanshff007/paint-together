// Rooms feature: landing, create/join/exit, members list, host role, kick.

// DOM ELEMENTS
const usernameInput    = document.getElementById('usernameInput');
const roomCodeInput    = document.getElementById('roomCodeInput');
const landingCreateBtn = document.getElementById('landingCreateBtn');
const landingJoinBtn   = document.getElementById('landingJoinBtn');
const landingError     = document.getElementById('landingError');
const roomPasswordInput = document.getElementById('roomPasswordInput');

const roomInfo         = document.getElementById('roomInfo');
const roomIdDisplay    = document.getElementById('roomId');
const userCountDisplay = document.getElementById('userCount');
const copyLinkBtn      = document.getElementById('copyLinkBtn');
const exitRoomBtn      = document.getElementById('exitRoomBtn');
const myNameBadge      = document.getElementById('myNameBadge');

const membersBtn      = document.getElementById('membersBtn');
const membersDropdown = document.getElementById('membersDropdown');
const membersList     = document.getElementById('membersList');
const setPasswordBtn  = document.getElementById('setPasswordBtn');

const kickModal       = document.getElementById('kickModal');
const kickModalText   = document.getElementById('kickModalText');
const kickCancelBtn   = document.getElementById('kickCancelBtn');
const kickConfirmBtn  = document.getElementById('kickConfirmBtn');
let   pendingKickId   = null;
let   pendingKickName = null;

// MEMBERS PANEL
let membersOpen = false;
let roomUsersCache = {};

membersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    membersOpen = !membersOpen;
    membersDropdown.classList.toggle('show', membersOpen);
});

document.addEventListener('click', (e) => {
    if (membersOpen && !membersDropdown.contains(e.target) && e.target !== membersBtn) {
        membersOpen = false;
        membersDropdown.classList.remove('show');
    }
});

membersDropdown.addEventListener('click', e => e.stopPropagation());

function renderMembersList() {
    setPasswordBtn.hidden = !amIHost;
    membersList.innerHTML = '';
    Object.entries(roomUsersCache).forEach(([socketId, info]) => {
        const isHost  = socketId === currentHostId;
        const isMe    = socketId === mySocketId;
        const canKick = amIHost && !isMe;

        const li = document.createElement('li');
        li.className = 'member-item';

        const dot = document.createElement('span');
        dot.className = 'member-dot';
        dot.style.background = info.color || '#06b6d4';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'member-name';
        nameSpan.textContent = info.name + (isMe ? ' (you)' : '');

        if (isHost) {
            const crown = document.createElement('span');
            crown.className = 'member-crown';
            crown.textContent = '👑';
            crown.title = 'Room Host';
            li.appendChild(dot);
            li.appendChild(crown);
            li.appendChild(nameSpan);
        } else {
            li.appendChild(dot);
            li.appendChild(nameSpan);
        }

        if (canKick) {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'member-kick-btn';
            kickBtn.textContent = '✕';
            kickBtn.title = `Remove ${info.name} from room`;
            kickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                pendingKickId   = socketId;
                pendingKickName = info.name;
                kickModalText.textContent = `Remove "${info.name}" from the room?`;
                kickModal.classList.add('show');
            });
            li.appendChild(kickBtn);
        }

        membersList.appendChild(li);
    });
}

// host only: a new password for people who join from now on (browsers already in skip it)
setPasswordBtn.addEventListener('click', () => {
    const password = prompt('New room password (leave empty to remove it):');
    if (password === null || !currentRoomId) return;
    socket.emit('set-password', { roomId: currentRoomId, password });
});

kickCancelBtn.addEventListener('click', () => {
    kickModal.classList.remove('show');
    pendingKickId = null;
});

kickConfirmBtn.addEventListener('click', () => {
    if (pendingKickId && currentRoomId) {
        socket.emit('kick-user', { roomId: currentRoomId, targetSocketId: pendingKickId });
        showToast(`🦵 Kicked ${pendingKickName}`);
    }
    kickModal.classList.remove('show');
    pendingKickId = null;
});

kickModal.addEventListener('click', (e) => {
    if (e.target === kickModal) kickModal.classList.remove('show');
});


// LANDING LOGIC

// Stable per-browser id so a kicked user can't rejoin the same room (see README)
function getClientId() {
    let id = null;
    try { id = localStorage.getItem('clientId'); } catch (e) {}
    if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
        try { localStorage.setItem('clientId', id); } catch (e) {}
    }
    return id;
}
const clientId = getClientId();

function getLandingName() {
    const name = usernameInput.value.trim();
    if (!name) {
        showLandingError('Please enter your name first!');
        usernameInput.focus();
        return null;
    }
    return name;
}

// an older message's timer must not clear a newer message
let landingErrorTimer = null;
function showLandingError(msg) {
    landingError.textContent = msg;
    clearTimeout(landingErrorTimer);
    landingErrorTimer = setTimeout(() => { landingError.textContent = ''; }, 3000);
}

// Password sent with the last create/join; kept in memory (never stored) for reconnects
let pendingPassword = '';
let roomPassword    = '';

landingCreateBtn.addEventListener('click', () => {
    const name = getLandingName();
    if (!name) return;
    myName = name;
    pendingPassword = roomPasswordInput.value;
    socket.emit('create-room', { userName: name, clientId, password: pendingPassword });
});

landingJoinBtn.addEventListener('click', () => {
    const name = getLandingName();
    if (!name) return;
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) {
        showLandingError('Please enter a room code!');
        roomCodeInput.focus();
        return;
    }
    myName = name;
    pendingPassword = roomPasswordInput.value;
    socket.emit('join-room', { roomId: code, userName: name, clientId, password: pendingPassword });
});

roomCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') landingJoinBtn.click(); });
[usernameInput, roomPasswordInput].forEach(input => input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const code = roomCodeInput.value.trim();
        if (code) landingJoinBtn.click();
        else landingCreateBtn.click();
    }
}));

// the password worked: keep it for reconnects and clear the field
function acceptPassword() {
    roomPassword = pendingPassword;
    roomPasswordInput.value = '';
}

const urlParams   = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) roomCodeInput.value = roomFromUrl.toUpperCase();


// BUTTONS

copyLinkBtn.addEventListener('click', () => {
    const link = `${window.location.origin}/?room=${currentRoomId}`;
    navigator.clipboard.writeText(link).then(() => {
        copyLinkBtn.textContent = '✅ Copied!';
        copyLinkBtn.classList.add('copied');
        setTimeout(() => {
            copyLinkBtn.textContent = '🔗 Copy Link';
            copyLinkBtn.classList.remove('copied');
        }, 2000);
    });
});

exitRoomBtn.addEventListener('click', () => {
    if (!currentRoomId) return;
    currentRoomId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasImage = null;
    localUndoStack = [];
    localRedoStack = [];
    updateUndoRedoButtons();
    chatMessages.innerHTML = '';
    roomUsersCache = {};
    amIHost = false;
    // Clear all remote cursors and drawing state
    Object.keys(remoteCursors).forEach(id => removeCursor(id));
    window.history.pushState({}, '', '/');
    appScreen.classList.remove('visible');
    socket.disconnect();
    setTimeout(() => {
        appScreen.style.display = 'none';
        landingScreen.style.display = 'flex';
        landingScreen.classList.remove('fade-out');
        socket.connect();
        animateSplash();
    }, 300);
    showToast('👋 Left the room');
});

// SOCKET EVENTS

// true while joining currentRoomId again after a reconnect
let rejoining = false;

socket.on('connect', () => {
    mySocketId = socket.id;
    // a reconnect gives a new socket that is not in the room yet; join it again
    if (currentRoomId) {
        rejoining = true;
        Object.keys(remoteCursors).forEach(id => removeCursor(id));
        socket.emit('join-room', { roomId: currentRoomId, userName: myName, clientId, password: roomPassword });
    }
});

socket.on('disconnect', (reason) => {
    // server-side kick disconnect never auto-reconnects; reconnect so the user can join again
    if (wasKicked) { wasKicked = false; socket.connect(); return; }
    if (reason === 'io client disconnect') return;
    showToast('⚠️ Disconnected. Reconnecting...');
});

socket.on('room-created', (data) => {
    resetRoomHistory();
    currentRoomId  = data.roomId;
    myColor        = data.userColor;
    mySocketId     = socket.id;
    amIHost        = true;
    currentHostId  = socket.id;
    roomUsersCache[socket.id] = { name: myName, color: myColor };
    updateRoomUI(data.roomId, data.userCount);
    updateUrl(data.roomId);
    showApp();
    const locked = Boolean(pendingPassword);
    acceptPassword();
    setTimeout(() => showToast(locked ? '🔒 Room created! Share the link, and the password separately.' : '🎉 Room created! Share the link.'), 700);
});

socket.on('room-joined', (data) => {
    currentRoomId  = data.roomId;
    myColor        = data.userColor;
    mySocketId     = socket.id;
    amIHost        = data.isHost || false;
    currentHostId  = data.hostId;
    serverHasUndo  = false; // history-sync brings the real state
    serverHasRedo  = false;
    updateRoomUI(data.roomId, data.userCount);
    updateUndoRedoButtons();
    requestChatHistory();
    requestHistorySync();
    if (!rejoining) acceptPassword();
    if (rejoining) {
        rejoining = false;
        // the server copy wins over anything drawn while offline
        if (data.canvasState) {
            loadCanvasState(data.canvasState);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvasImage = null;
        }
        showToast('🔄 Reconnected');
        return;
    }
    showApp();
    setTimeout(() => {
        showToast(`🚪 Joined room ${data.roomId}`);
        if (data.canvasState) loadCanvasState(data.canvasState);
    }, 700);
});

socket.on('join-banned', (roomId) => {
    if (rejoining) returnToLanding();
    showLandingError(`You can't join room "${roomId}": the host removed you or someone on your network.`);
    window.history.pushState({}, '', '/');
});

socket.on('join-password', (data) => {
    if (!data) return;
    if (rejoining) returnToLanding();
    roomCodeInput.value = data.roomId;
    const messages = {
        required: '🔒 This room needs a password.',
        wrong:    'Wrong password. Try again.',
        wait:     `Too many wrong passwords. Wait ${data.retryIn} s.`
    };
    showLandingError(messages[data.reason] || messages.required);
    roomPasswordInput.focus();
});

socket.on('password-set', (data) => {
    showToast(data && data.locked ? '🔒 New password set. Share it with new people.' : '🔓 Password removed');
});

socket.on('room-not-found', (roomId) => {
    if (rejoining) returnToLanding();
    showLandingError(`Room "${roomId}" not found. Check the code!`);
    window.history.pushState({}, '', '/');
});

socket.on('user-count-update', (count) => { userCountDisplay.textContent = count; });

socket.on('user-joined', (data) => {
    showToast(`👋 ${data.name} joined`);
    roomUsersCache[data.socketId] = { name: data.name, color: data.color };
    renderMembersList();
});

socket.on('user-left', (socketId) => {
    removeCursor(socketId);
    if (roomUsersCache[socketId]) {
        showToast(`👋 ${roomUsersCache[socketId].name} left`);
        delete roomUsersCache[socketId];
    } else {
        showToast('👋 A user left');
    }
    renderMembersList();
});

socket.on('users-update', (data) => {
    roomUsersCache = data.users || {};
    currentHostId  = data.hostId;
    amIHost        = (data.hostId === mySocketId);
    renderMembersList();
    updateHostBadge();
});

socket.on('host-changed', (data) => {
    currentHostId = data.newHostId;
    amIHost = (data.newHostId === mySocketId);
    if (amIHost) showToast('👑 You are now the host!');
    updateHostBadge();
    renderMembersList();
});

socket.on('kicked', () => {
    wasKicked = true;
    returnToLanding('✕ You were kicked from the room');
});

// leave the room screen; message (optional) shows as a toast on the landing screen
function returnToLanding(message) {
    rejoining = false;
    currentRoomId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasImage = null;
    localUndoStack = [];
    localRedoStack = [];
    chatMessages.innerHTML = '';
    roomUsersCache = {};
    amIHost = false;
    Object.keys(remoteCursors).forEach(id => removeCursor(id));
    window.history.pushState({}, '', '/');
    appScreen.classList.remove('visible');
    setTimeout(() => {
        appScreen.style.display = 'none';
        landingScreen.style.display = 'flex';
        landingScreen.classList.remove('fade-out');
        animateSplash();
        if (message) showToast(message, 4000);
    }, 400);
}

socket.on('existing-users', (users) => {
    roomUsersCache = { ...users };
    roomUsersCache[mySocketId] = { name: myName, color: myColor };
    Object.entries(users).forEach(([socketId, info]) => {
        if (socketId !== socket.id) ensureCursorExists(socketId, info.color, info.name);
    });
    renderMembersList();
});

// UI HELPERS

function updateRoomUI(roomId, userCount) {
    roomIdDisplay.textContent    = roomId;
    userCountDisplay.textContent = userCount;
    roomInfo.style.visibility    = 'visible';
    myNameBadge.textContent      = `👤 ${myName}`;
    renderMembersList();
}

function updateUrl(roomId) {
    window.history.pushState({}, '', `${window.location.origin}/?room=${roomId}`);
}

function updateHostBadge() {
    myNameBadge.textContent = amIHost ? `👑 ${myName}` : `👤 ${myName}`;
}

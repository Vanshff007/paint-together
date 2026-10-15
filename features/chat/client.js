// Chat feature: room chat popup.

// DOM ELEMENTS
const chatBtn          = document.getElementById('chatBtn');
const chatPopup        = document.getElementById('chatPopup');
const chatMessages     = document.getElementById('chatMessages');
const chatInput        = document.getElementById('chatInput');
const chatSendBtn      = document.getElementById('chatSendBtn');
const chatNotification = document.getElementById('chatNotification');

// CHAT FUNCTIONS

let chatIsOpen = false;

chatBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chatIsOpen = !chatIsOpen;
    chatPopup.classList.toggle('show', chatIsOpen);
    if (chatIsOpen) {
        chatNotification.classList.remove('show');
        chatInput.focus();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

document.addEventListener('click', (e) => {
    if (chatIsOpen && !chatPopup.contains(e.target) && e.target !== chatBtn) {
        chatIsOpen = false;
        chatPopup.classList.remove('show');
    }
});

chatPopup.addEventListener('click', (e) => e.stopPropagation());

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !currentRoomId) return;
    socket.emit('chat-message', { roomId: currentRoomId, text: message });
    addMessageToChat(myName, message, true);
    chatInput.value = '';
}

chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

function addMessageToChat(author, text, isOwn = false, fromHistory = false) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isOwn ? 'own' : ''}`;
    const authorEl = document.createElement('div');
    authorEl.className = 'chat-message-author';
    authorEl.textContent = isOwn ? 'You' : author;
    const textEl = document.createElement('div');
    textEl.className = 'chat-message-text';
    textEl.textContent = text;
    messageEl.appendChild(authorEl);
    messageEl.appendChild(textEl);
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (!chatIsOpen && !isOwn && !fromHistory) chatNotification.classList.add('show');
}

socket.on('chat-message', (data) => {
    addMessageToChat(data.author, data.text, false);
});

// Earlier messages, asked for after every join (also after a reconnect);
// replaces the list so a rejoin does not show messages twice
function requestChatHistory() {
    if (currentRoomId) socket.emit('chat-history', currentRoomId);
}

socket.on('chat-history', (messages) => {
    if (!Array.isArray(messages)) return;
    chatMessages.innerHTML = '';
    messages.forEach(m => addMessageToChat(m.author, m.text, m.own, true));
});

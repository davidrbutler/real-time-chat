document.addEventListener('DOMContentLoaded', () => {
    const loginPage = document.getElementById('login-page');
    const chatPage = document.getElementById('chat-page');
    const usernameInput = document.getElementById('input-username');
    const joinButton = document.getElementById('send-username-btn');
    const loginError = document.getElementById('login-error');
    const messageInput = document.getElementById('input-msg');
    const sendButton = document.getElementById('send-msg-btn');
    const messagesContainer = document.getElementById('messages');
    const usersList = document.getElementById('users');
    const chatWithDisplay = document.getElementById('chat-with');
    const publicChatButton = document.getElementById('public-chat-btn');

    let stompClient = null;
    let username = null;
    let currentChatTarget = 'public';

    function sendLogToServer(level, message) {
        if (stompClient && stompClient.connected && username) {
            try {
                const logMessage = { sender: username, type: 'LOG', content: `[${level}] ${message}` };
                stompClient.send("/app/chat.log", {}, JSON.stringify(logMessage));
            } catch (e) { console.error("Failed to send log message to server:", e, "Original message:", message); }
        } else { console.log(`[Log Skip - Not Connected] [${level}] ${message}`); }
    }


    function setActiveUserIndicator(targetUsername) {
        document.querySelectorAll('#users .user-container, #public-chat-btn').forEach(el => {
            el.classList.remove('active-chat');
        });

        if (targetUsername === 'public') {
            if (publicChatButton) { publicChatButton.classList.add('active-chat'); }
            else { sendLogToServer('ERROR', '[setActiveUserIndicator] publicChatButton is null!'); }
        } else {
            if (!usersList) { sendLogToServer('ERROR', '[setActiveUserIndicator] usersList is null!'); return; }
            const userContainer = findUserContainer(targetUsername);
            if (userContainer) {
                userContainer.classList.add('active-chat');
            } else {
                sendLogToServer('WARN', `[setActiveUserIndicator] User container for ${targetUsername} not found.`);
            }
        }
    }

    function findUserContainer(targetUsername) {
        if (!usersList) return null;
        for (let container of usersList.children) {
            if (container.classList.contains('user-container')) {
                const userDiv = container.querySelector('.user');
                if (userDiv && userDiv.textContent === targetUsername) {
                    return container;
                }
            }
        }
        return null;
    }


    function createMessageHtml(msg) {
        if (!msg || typeof msg !== 'object') return '';
        let messageHtml = '';
        if (msg.type === 'JOIN' || msg.type === 'LEAVE') { messageHtml = `<div class="event-message">${msg.sender} ${msg.type === 'JOIN' ? 'joined' : 'left'}!</div>`; }
        else if (msg.type === 'CHAT') {
            let dateString = '';
            try { dateString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { dateString = msg.timestamp || ""; }
            messageHtml = `
                <div class="message-container">
                    <span class="sender">${msg.sender}</span>
                    <span class="message">${msg.content}</span>
                    <span class="date">${dateString}</span>
                </div>`;
        }
        return messageHtml;
    }


    function switchToPublicChat() {
        sendLogToServer('DEBUG', 'Entering switchToPublicChat function.');
        if (!chatWithDisplay) sendLogToServer('ERROR', 'chatWithDisplay is null at start of switchToPublicChat!');
        if (!messagesContainer) sendLogToServer('ERROR', 'messagesContainer is null at start of switchToPublicChat!');


        sendLogToServer('INFO', "[ChatSwitch] Switching to Public Chat");
        currentChatTarget = 'public';

        if(chatWithDisplay) { chatWithDisplay.textContent = 'Public chat'; }
        else { sendLogToServer('ERROR', 'Cannot set chatWithDisplay.textContent, element is null.'); }
        if(messagesContainer) {
            messagesContainer.innerHTML = '';
            sendLogToServer('DEBUG', `[ChatSwitch] Cleared messages for Public Chat`);
        } else { sendLogToServer('ERROR', 'Cannot clear messagesContainer.innerHTML, element is null.'); }

        setActiveUserIndicator('public');


        fetchPublicHistory();
        sendLogToServer('DEBUG', 'Exiting switchToPublicChat function.');
    }

    function switchToPrivateChat(targetUsername) {
        sendLogToServer('DEBUG', `Entering switchToPrivateChat for target: ${targetUsername}.`);
        if (!chatWithDisplay) sendLogToServer('ERROR', 'chatWithDisplay is null at start of switchToPrivateChat!');
        if (!messagesContainer) sendLogToServer('ERROR', 'messagesContainer is null at start of switchToPrivateChat!');

        if (targetUsername === username || targetUsername === currentChatTarget) {
            sendLogToServer('DEBUG', `Not switching chat. Target: ${targetUsername}, Current: ${currentChatTarget}, Self: ${username}`);
            return;
        }
        sendLogToServer('INFO', `[ChatSwitch] Switching to Private Chat with ${targetUsername}`);
        currentChatTarget = targetUsername;

        if (chatWithDisplay) { chatWithDisplay.textContent = targetUsername; }
        else { sendLogToServer('ERROR', 'Cannot set chatWithDisplay.textContent, element is null.'); }
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
            sendLogToServer('DEBUG', `[ChatSwitch] Cleared messages for ${targetUsername}`);
        } else { sendLogToServer('ERROR', 'Cannot clear messagesContainer.innerHTML, element is null.'); }

        setActiveUserIndicator(targetUsername);

        const userContainer = findUserContainer(targetUsername);
        if (userContainer) {
            const counter = userContainer.querySelector('.new-message-counter');
            if (counter) {
                counter.textContent = '0';
                counter.style.display = 'none';
                sendLogToServer('DEBUG', `Reset counter for ${targetUsername}`);
            }
        } else {
            sendLogToServer('WARN', `Could not find user container to reset counter for ${targetUsername}`);
        }

        fetchPrivateHistory(username, targetUsername);
        sendLogToServer('DEBUG', `Exiting switchToPrivateChat for target: ${targetUsername}.`);
    }


    function addUserToList(userToAdd) {
        if (userToAdd === username || !usersList) return;

        if (findUserContainer(userToAdd)) {
            sendLogToServer('DEBUG', `[UserList] User container for ${userToAdd} already exists.`);
            return;
        }

        const userContainer = document.createElement('div');
        userContainer.classList.add('user-container');

        const userDiv = document.createElement('div');
        userDiv.classList.add('user');
        userDiv.textContent = userToAdd;

        const counterSpan = document.createElement('span');
        counterSpan.classList.add('new-message-counter');
        counterSpan.textContent = '0';
        counterSpan.style.display = 'none';

        userContainer.appendChild(userDiv);
        userContainer.appendChild(counterSpan);

        userContainer.addEventListener('click', () => switchToPrivateChat(userToAdd));

        usersList.appendChild(userContainer);
        sendLogToServer('INFO', `[UserList] Added user container for ${userToAdd} to list.`);
    }

    function removeUserFromList(userToRemove) {
        if (!usersList) { sendLogToServer('ERROR', '[removeUserFromList] usersList is null!'); return; }
        const userContainer = findUserContainer(userToRemove);
        if (userContainer) {
            userContainer.remove();
            sendLogToServer('INFO', `[UserList] Removed user container for ${userToRemove} from list.`);
            if(currentChatTarget === userToRemove) {
                sendLogToServer('INFO', `[UserList] Current chat target ${userToRemove} disconnected. Switching to public chat.`);
                switchToPublicChat();
            }
        } else {
            sendLogToServer('WARN', `[removeUserFromList] Could not find user container for ${userToRemove}.`);
        }
    }

    function displayMessage(messagePayload) {
        let msg;
        try { msg = JSON.parse(messagePayload); }
        catch (e) { sendLogToServer('ERROR', `Failed to parse message payload: ${messagePayload} - Error: ${e}`); return; }
        let shouldDisplay = false; let messageHtml = '';
        let isPrivateAndDisplayed = false;
        let otherUser = null;

        if (msg.type === 'JOIN') { shouldDisplay = true; addUserToList(msg.sender); messageHtml = createMessageHtml(msg); }
        else if (msg.type === 'LEAVE') { shouldDisplay = true; removeUserFromList(msg.sender); messageHtml = createMessageHtml(msg); }
        else if (msg.type === 'CHAT') {
            const isPublic = !msg.recipient || msg.recipient.toLowerCase() === 'public';
            if (isPublic && currentChatTarget === 'public') {
                shouldDisplay = true;
            } else if (!isPublic &&
                ((msg.sender === username && msg.recipient === currentChatTarget) ||
                    (msg.sender === currentChatTarget && msg.recipient === username))) {
                shouldDisplay = true;
                isPrivateAndDisplayed = true;
                otherUser = (msg.sender === username) ? msg.recipient : msg.sender;
            } else {
                console.log(`[DisplayMessage] Received ${isPublic ? 'public' : 'private'} message for/from ${msg.sender}/${msg.recipient} while viewing ${currentChatTarget}. Ignored for display.`);
                shouldDisplay = false;

                const counterTargetUser = isPublic ? null : msg.sender;
                if (counterTargetUser) {
                    const userContainer = findUserContainer(counterTargetUser);
                    if (userContainer) {
                        const counter = userContainer.querySelector('.new-message-counter');
                        if (counter) {
                            let currentCount = parseInt(counter.textContent) || 0;
                            currentCount++;
                            counter.textContent = currentCount;
                            counter.style.display = 'inline-block';
                            sendLogToServer('DEBUG', `Incremented counter for ${counterTargetUser} to ${currentCount}`);
                        }
                    } else {
                        sendLogToServer('WARN', `Could not find user container to increment counter for ${counterTargetUser}`);
                    }
                }
            }
            if (shouldDisplay) { messageHtml = createMessageHtml(msg); }
        } else if (msg.type === 'LOG') { shouldDisplay = false; }
        else { sendLogToServer('WARN', `Unknown message type received: ${msg.type}`); return; }
        if (shouldDisplay && messageHtml) {
            if(messagesContainer) {
                messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                if (isPrivateAndDisplayed && otherUser && usersList) {
                    const otherUserContainer = findUserContainer(otherUser);
                    if (otherUserContainer && usersList.firstChild !== otherUserContainer) {
                        sendLogToServer('DEBUG', `Moving user ${otherUser} to top of list.`);
                        usersList.insertBefore(otherUserContainer, usersList.firstChild);
                    }
                }
            }
            else { sendLogToServer('ERROR', '[displayMessage] messagesContainer is null, cannot append message.'); }
        }
    }

    function sendChatMessage() {
        const messageContent = messageInput.value.trim();
        if (messageContent && stompClient && stompClient.connected && username) {
            const recipient = (currentChatTarget === 'public') ? 'public' : currentChatTarget;
            const chatMessage = { sender: username, content: messageContent, type: 'CHAT', recipient: recipient };
            sendLogToServer('DEBUG', `[sendChatMessage] Sending: ${JSON.stringify(chatMessage)}`);
            stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(chatMessage));
            messageInput.value = '';

            if (recipient !== 'public' && usersList) {
                const recipientContainer = findUserContainer(recipient);
                if (recipientContainer && usersList.firstChild !== recipientContainer) {
                    sendLogToServer('DEBUG', `Moving user ${recipient} to top of list after sending.`);
                    usersList.insertBefore(recipientContainer, usersList.firstChild);
                }
            }
        } else { sendLogToServer('WARN', `[sendChatMessage] Cannot send message. Content: ${messageContent}, StompConnected: ${stompClient?.connected}, Username: ${username}`); }
    }


    async function fetchPublicHistory() {
        sendLogToServer('DEBUG', 'Entering fetchPublicHistory');
        try {
            sendLogToServer('INFO', "[fetchHistory] Fetching public history from /history...");
            const response = await fetch('/history');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const history = await response.json();
            if (Array.isArray(history)) {
                sendLogToServer('INFO', `[fetchHistory] Public history is array. Length: ${history.length}`);
                if (history.length > 0) {
                    let historyHtml = '';
                    history.forEach(msg => { historyHtml += createMessageHtml(msg); });
                    if(messagesContainer) { messagesContainer.innerHTML = historyHtml; sendLogToServer('INFO', `[fetchHistory] Displayed ${history.length} public history messages.`); }
                    else { sendLogToServer('ERROR', '[fetchPublicHistory] messagesContainer is null, cannot display history.'); }
                } else { sendLogToServer('INFO', `[fetchHistory] Public history is empty.`); }
                if(messagesContainer) { messagesContainer.scrollTop = messagesContainer.scrollHeight; }
            } else { sendLogToServer('WARN', `[fetchHistory] Received public history is not an array: ${history}`); }
        } catch (error) { sendLogToServer('ERROR', `[fetchHistory] Failed to fetch public history: ${error}`); }
    }

    async function fetchPrivateHistory(user1, user2) {
        sendLogToServer('DEBUG', `Entering fetchPrivateHistory for ${user1}/${user2}`);
        const endpointUsers = [user1, user2].sort();
        const endpoint = `/history/${endpointUsers[0]}/${endpointUsers[1]}`;
        try {
            sendLogToServer('INFO', `[fetchPrivateHistory] Fetching private history from ${endpoint}...`);
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const history = await response.json();
            if (Array.isArray(history)) {
                sendLogToServer('INFO', `[fetchPrivateHistory] Private history is array. Length: ${history.length}`);
                if (history.length > 0) {
                    let historyHtml = '';
                    history.forEach(msg => { historyHtml += createMessageHtml(msg); });
                    if(messagesContainer) { messagesContainer.innerHTML = historyHtml; sendLogToServer('INFO', `[fetchPrivateHistory] Displayed ${history.length} private messages.`); }
                    else { sendLogToServer('ERROR', '[fetchPrivateHistory] messagesContainer is null, cannot display history.'); }
                } else { sendLogToServer('INFO', `[fetchPrivateHistory] Private history is empty.`); }
                if(messagesContainer) { messagesContainer.scrollTop = messagesContainer.scrollHeight; }
            } else { sendLogToServer('WARN', `[fetchPrivateHistory] Received private history is not an array: ${history}`); }
        } catch (error) { sendLogToServer('ERROR', `[fetchPrivateHistory] Failed to fetch private history for ${endpointUsers.join('/')}: ${error}`); }
    }


    async function fetchOnlineUsers() {
        sendLogToServer('DEBUG', 'Entering fetchOnlineUsers');
        try {
            sendLogToServer('INFO', "[fetchOnlineUsers] Fetching user list...");
            const response = await fetch('/users');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const users = await response.json();
            if(usersList) {
                usersList.innerHTML = '';
                if (Array.isArray(users)) {
                    users.forEach(user => addUserToList(user));
                } else {
                    sendLogToServer('WARN', `[fetchOnlineUsers] Received user list is not an array: ${users}`);
                }
            } else {
                sendLogToServer('ERROR', '[fetchOnlineUsers] usersList is null, cannot display users.');
            }
        } catch (error) {
            sendLogToServer('ERROR', `[fetchOnlineUsers] Failed to fetch online users: ${error}`);
        }
    }

    function connect(event) {
        if(event) event.preventDefault();
        username = usernameInput.value.trim();
        if (username) {
            console.log("[Connect] Attempting to connect as:", username);
            sendLogToServer('INFO', `[Connect] Attempting to connect as: ${username}`);
            loginPage.classList.remove('active'); loginPage.style.display = 'none';
            chatPage.style.display = 'block'; chatPage.classList.add('active');
            const socket = new SockJS('/ws');
            stompClient = Stomp.over(socket);
            stompClient.debug = null;
            stompClient.connect({}, onConnected, onError);
        } else { loginError.textContent = "Please enter a username."; loginError.style.display = 'block'; }
    }

    function onConnected() {
        sendLogToServer('DEBUG', 'Entering onConnected');
        messageInput.disabled = false; sendButton.disabled = false; loginError.style.display = 'none';
        try {
            stompClient.subscribe('/topic/public', onMessageReceived);
            sendLogToServer('INFO','[onConnected] Subscribed to /topic/public');
            switchToPublicChat();
            fetchOnlineUsers();
            const joinMessage = { sender: username, type: 'JOIN' };
            stompClient.send("/app/chat.addUser", {}, JSON.stringify(joinMessage));
            sendLogToServer('INFO','[onConnected] JOIN message sent.');
        } catch(e) { sendLogToServer('ERROR', `[onConnected] Error during subscriptions/fetch/JOIN: ${e}`); onError(e); }
        sendLogToServer('DEBUG', 'Exiting onConnected');
    }

    function onError(error) {
        console.error('Could not connect to WebSocket server. Please refresh and try again!', error);
        sendLogToServer('ERROR', `Could not connect to WebSocket server: ${error}`);
        loginError.textContent = 'Could not connect to WebSocket. Please refresh.';
        loginError.style.display = 'block';
        messageInput.disabled = true; sendButton.disabled = true;
        chatPage.style.display = 'none'; chatPage.classList.remove('active');
        loginPage.style.display = 'block'; loginPage.classList.add('active');
        stompClient = null;
    }

    function onMessageReceived(payload) {
        console.log("[onMessageReceived] Received message payload:", payload.body);
        displayMessage(payload.body);
    }

    joinButton.addEventListener('click', connect, true);
    usernameInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { connect(event); } });
    sendButton.addEventListener('click', sendChatMessage);
    messageInput.addEventListener('keypress', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChatMessage(); } });
    publicChatButton.addEventListener('click', switchToPublicChat);

});
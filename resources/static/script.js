// Wait for the HTML document to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get element references
    const loginPage = document.getElementById('login-page');
    const chatPage = document.getElementById('chat-page');
    const usernameInput = document.getElementById('input-username');
    const joinButton = document.getElementById('send-username-btn');
    const loginError = document.getElementById('login-error');
    const messageInput = document.getElementById('input-msg');
    const sendButton = document.getElementById('send-msg-btn');
    const messagesContainer = document.getElementById('messages');
    const usersList = document.getElementById('users'); // The <div> containing user containers
    const chatWithDisplay = document.getElementById('chat-with');
    const publicChatButton = document.getElementById('public-chat-btn');
    // Optional: Get reference if you add a public counter
    // const publicChatCounter = document.getElementById('public-chat-counter');

    let stompClient = null;
    let username = null;
    let currentChatTarget = 'public'; // 'public' or a username

    // Function to send logs to backend
    function sendLogToServer(level, message) {
        if (stompClient && stompClient.connected && username) {
            try {
                const logMessage = { sender: username, type: 'LOG', content: `[${level}] ${message}` };
                stompClient.send("/app/chat.log", {}, JSON.stringify(logMessage));
            } catch (e) { console.error("Failed to send log message to server:", e, "Original message:", message); }
        } else { console.log(`[Log Skip - Not Connected] [${level}] ${message}`); }
    }


    // --- Helper Functions ---
    function setActiveUserIndicator(targetUsername) {
        // Remove active class from all user containers and public button
        document.querySelectorAll('#users .user-container, #public-chat-btn').forEach(el => {
            el.classList.remove('active-chat');
        });

        if (targetUsername === 'public') {
            if (publicChatButton) { publicChatButton.classList.add('active-chat'); }
            else { sendLogToServer('ERROR', '[setActiveUserIndicator] publicChatButton is null!'); }
        } else {
            if (!usersList) { sendLogToServer('ERROR', '[setActiveUserIndicator] usersList is null!'); return; }
            // Find the user container and add active class
            const userContainer = findUserContainer(targetUsername);
            if (userContainer) {
                userContainer.classList.add('active-chat');
            } else {
                sendLogToServer('WARN', `[setActiveUserIndicator] User container for ${targetUsername} not found.`);
            }
        }
    }

    // Helper to find the specific user-container element by username
    function findUserContainer(targetUsername) {
        if (!usersList) return null;
        for (let container of usersList.children) {
            // Check if it's a user container and find the inner .user div
            if (container.classList.contains('user-container')) {
                const userDiv = container.querySelector('.user');
                if (userDiv && userDiv.textContent === targetUsername) {
                    return container;
                }
            }
        }
        return null; // Not found
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

    // --- Chat Switching Functions ---

    function switchToPublicChat() {
        sendLogToServer('DEBUG', 'Entering switchToPublicChat function.');
        if (!chatWithDisplay) sendLogToServer('ERROR', 'chatWithDisplay is null at start of switchToPublicChat!');
        if (!messagesContainer) sendLogToServer('ERROR', 'messagesContainer is null at start of switchToPublicChat!');

        // Removed the check: if (currentChatTarget === 'public') return;

        sendLogToServer('INFO', "[ChatSwitch] Switching to Public Chat");
        currentChatTarget = 'public';

        if(chatWithDisplay) { chatWithDisplay.textContent = 'Public chat'; }
        else { sendLogToServer('ERROR', 'Cannot set chatWithDisplay.textContent, element is null.'); }
        if(messagesContainer) {
            messagesContainer.innerHTML = '';
            sendLogToServer('DEBUG', `[ChatSwitch] Cleared messages for Public Chat`);
        } else { sendLogToServer('ERROR', 'Cannot clear messagesContainer.innerHTML, element is null.'); }

        setActiveUserIndicator('public');

        // *** Reset and hide public chat counter (if implemented) ***
        // if (publicChatCounter) {
        //     publicChatCounter.textContent = '0';
        //     publicChatCounter.style.display = 'none';
        // }

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

        // *** Reset and hide the counter for this user ***
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


    // --- User List Management ---
    function addUserToList(userToAdd) {
        if (userToAdd === username || !usersList) return; // Don't add self, check usersList exists

        // Check if user container already exists
        if (findUserContainer(userToAdd)) {
            sendLogToServer('DEBUG', `[UserList] User container for ${userToAdd} already exists.`);
            return;
        }

        // Create elements with the new structure
        const userContainer = document.createElement('div');
        userContainer.classList.add('user-container');

        const userDiv = document.createElement('div');
        userDiv.classList.add('user');
        userDiv.textContent = userToAdd;

        const counterSpan = document.createElement('span');
        counterSpan.classList.add('new-message-counter');
        counterSpan.textContent = '0';
        counterSpan.style.display = 'none'; // Hide initially

        // Add elements to container
        userContainer.appendChild(userDiv);
        userContainer.appendChild(counterSpan);

        // Add click listener to the container
        userContainer.addEventListener('click', () => switchToPrivateChat(userToAdd));

        // Append container to the list
        usersList.appendChild(userContainer);
        sendLogToServer('INFO', `[UserList] Added user container for ${userToAdd} to list.`);
    }

    function removeUserFromList(userToRemove) {
        if (!usersList) { sendLogToServer('ERROR', '[removeUserFromList] usersList is null!'); return; }
        const userContainer = findUserContainer(userToRemove); // Find the container
        if (userContainer) {
            userContainer.remove(); // Remove the whole container
            sendLogToServer('INFO', `[UserList] Removed user container for ${userToRemove} from list.`);
            if(currentChatTarget === userToRemove) {
                sendLogToServer('INFO', `[UserList] Current chat target ${userToRemove} disconnected. Switching to public chat.`);
                switchToPublicChat();
            }
        } else {
            sendLogToServer('WARN', `[removeUserFromList] Could not find user container for ${userToRemove}.`);
        }
    }

    // --- Display & Message Handling ---
    function displayMessage(messagePayload) {
        let msg;
        try { msg = JSON.parse(messagePayload); }
        catch (e) { sendLogToServer('ERROR', `Failed to parse message payload: ${messagePayload} - Error: ${e}`); return; }
        let shouldDisplay = false; let messageHtml = '';
        let isPrivateAndDisplayed = false; // Flag for reordering later
        let otherUser = null; // Store the other user for reordering

        if (msg.type === 'JOIN') { shouldDisplay = true; addUserToList(msg.sender); messageHtml = createMessageHtml(msg); }
        else if (msg.type === 'LEAVE') { shouldDisplay = true; removeUserFromList(msg.sender); messageHtml = createMessageHtml(msg); }
        else if (msg.type === 'CHAT') {
            const isPublic = !msg.recipient || msg.recipient.toLowerCase() === 'public';
            // Determine if the message should be displayed based on current view
            if (isPublic && currentChatTarget === 'public') {
                shouldDisplay = true; // Show public message in public view
            } else if (!isPublic && // It's a private message
                ((msg.sender === username && msg.recipient === currentChatTarget) || // Sent by me to current target
                    (msg.sender === currentChatTarget && msg.recipient === username))) { // Sent by current target to me
                shouldDisplay = true; // Show private message if it involves the currently active private chat
                isPrivateAndDisplayed = true; // Mark for reordering
                // Identify the other user in this private chat
                otherUser = (msg.sender === username) ? msg.recipient : msg.sender;
            } else {
                // Message is not for the current view - INCREMENT COUNTER
                console.log(`[DisplayMessage] Received ${isPublic ? 'public' : 'private'} message for/from ${msg.sender}/${msg.recipient} while viewing ${currentChatTarget}. Ignored for display.`);
                shouldDisplay = false;

                // Find the relevant container and increment counter
                const counterTargetUser = isPublic ? null : msg.sender; // Counter belongs to the sender if private msg not shown
                if (counterTargetUser) {
                    const userContainer = findUserContainer(counterTargetUser);
                    if (userContainer) {
                        const counter = userContainer.querySelector('.new-message-counter');
                        if (counter) {
                            let currentCount = parseInt(counter.textContent) || 0;
                            currentCount++;
                            counter.textContent = currentCount;
                            counter.style.display = 'inline-block'; // Show counter
                            sendLogToServer('DEBUG', `Incremented counter for ${counterTargetUser} to ${currentCount}`);
                        }
                    } else {
                        sendLogToServer('WARN', `Could not find user container to increment counter for ${counterTargetUser}`);
                    }
                }
                // Optional: Handle public counter increment here
                // else if (isPublic && publicChatCounter) { ... }
            }
            // Generate HTML only if it should be displayed
            if (shouldDisplay) { messageHtml = createMessageHtml(msg); }
        } else if (msg.type === 'LOG') { shouldDisplay = false; }
        else { sendLogToServer('WARN', `Unknown message type received: ${msg.type}`); return; }
        // Append and scroll if the message should be displayed
        if (shouldDisplay && messageHtml) {
            if(messagesContainer) {
                messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                // *** Reorder user list if a private message was just displayed ***
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

    // Function to send a chat message via WebSocket
    function sendChatMessage() {
        const messageContent = messageInput.value.trim();
        if (messageContent && stompClient && stompClient.connected && username) {
            const recipient = (currentChatTarget === 'public') ? 'public' : currentChatTarget;
            const chatMessage = { sender: username, content: messageContent, type: 'CHAT', recipient: recipient };
            sendLogToServer('DEBUG', `[sendChatMessage] Sending: ${JSON.stringify(chatMessage)}`);
            stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(chatMessage));
            messageInput.value = '';

            // *** Reorder user list after sending a private message ***
            if (recipient !== 'public' && usersList) {
                const recipientContainer = findUserContainer(recipient);
                if (recipientContainer && usersList.firstChild !== recipientContainer) {
                    sendLogToServer('DEBUG', `Moving user ${recipient} to top of list after sending.`);
                    usersList.insertBefore(recipientContainer, usersList.firstChild);
                }
            }
        } else { sendLogToServer('WARN', `[sendChatMessage] Cannot send message. Content: ${messageContent}, StompConnected: ${stompClient?.connected}, Username: ${username}`); }
    }


    // --- History Fetching ---
    async function fetchPublicHistory() { /* ... keep existing (using createMessageHtml and innerHTML) ... */
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

    async function fetchPrivateHistory(user1, user2) { /* ... keep existing (using createMessageHtml and innerHTML) ... */
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


    // Fetches the current list of online users via HTTP GET
    async function fetchOnlineUsers() { /* ... keep existing ... */
        sendLogToServer('DEBUG', 'Entering fetchOnlineUsers');
        try {
            sendLogToServer('INFO', "[fetchOnlineUsers] Fetching user list...");
            const response = await fetch('/users');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const users = await response.json();
            if(usersList) {
                usersList.innerHTML = ''; // Clear current list first
                if (Array.isArray(users)) {
                    // Add users, creating the new container structure
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

    // Function to connect to WebSocket and subscribe
    function connect(event) { /* ... keep existing ... */
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

    // Callback function for successful WebSocket connection
    function onConnected() { /* ... keep existing (subscribes only to /topic/public) ... */
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

    // Callback function for WebSocket connection errors
    function onError(error) { /* ... keep existing ... */
        console.error('Could not connect to WebSocket server. Please refresh and try again!', error);
        sendLogToServer('ERROR', `Could not connect to WebSocket server: ${error}`);
        loginError.textContent = 'Could not connect to WebSocket. Please refresh.';
        loginError.style.display = 'block';
        messageInput.disabled = true; sendButton.disabled = true;
        chatPage.style.display = 'none'; chatPage.classList.remove('active');
        loginPage.style.display = 'block'; loginPage.classList.add('active');
        stompClient = null;
    }

    // Callback function for receiving messages from public topic
    function onMessageReceived(payload) { /* ... keep existing ... */
        console.log("[onMessageReceived] Received message payload:", payload.body);
        displayMessage(payload.body);
    }

    // --- Event Listeners ---
    /* ... keep existing ... */
    joinButton.addEventListener('click', connect, true);
    usernameInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { connect(event); } });
    sendButton.addEventListener('click', sendChatMessage);
    messageInput.addEventListener('keypress', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChatMessage(); } });
    publicChatButton.addEventListener('click', switchToPublicChat);

});
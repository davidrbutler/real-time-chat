package chat.controller;

import chat.listener.WebSocketEventListener;
import chat.model.ChatMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
// Removed @SendTo import as we manually route everything now
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable; // Import PathVariable
import org.springframework.web.bind.annotation.ResponseBody;

import java.security.Principal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map; // Import Map
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap; // Import ConcurrentHashMap
import java.util.stream.Stream; // Import Stream

@Controller
public class ChatController {

    private static final Logger logger = LoggerFactory.getLogger(ChatController.class);

    // Public history
    private final List<ChatMessage> publicMessageHistory = Collections.synchronizedList(new ArrayList<>());
    private static final int MAX_PUBLIC_HISTORY_SIZE = 100;

    // *** NEW: Private History Storage ***
    // Key: Sorted concatenation of user1:user2, Value: List of messages
    private final Map<String, List<ChatMessage>> privateMessageHistory = new ConcurrentHashMap<>();
    private static final int MAX_PRIVATE_HISTORY_SIZE = 100; // Per conversation pair

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private WebSocketEventListener eventListener;

    private static final DateTimeFormatter formatter = DateTimeFormatter.ISO_DATE_TIME;

    // --- WebSocket Mappings ---

    @MessageMapping("/chat.sendMessage")
    // No @SendTo - we route manually based on recipient
    public void sendMessage(@Payload ChatMessage chatMessage, SimpMessageHeaderAccessor headerAccessor) {
        String sender = chatMessage.getSender();
        String recipient = chatMessage.getRecipient(); // Get recipient from payload
        chatMessage.setTimestamp(LocalDateTime.now().format(formatter));
        chatMessage.setType(ChatMessage.MessageType.CHAT); // Ensure type is CHAT

        // Use Objects.requireNonNullElse to handle null recipient, defaulting to "public"
        String effectiveRecipient = Objects.requireNonNullElse(recipient, "public").isBlank() ? "public" : recipient;

        if (effectiveRecipient.equalsIgnoreCase("public")) {
            // --- Public Message ---
            chatMessage.setRecipient("public"); // Explicitly mark as public
            synchronized (publicMessageHistory) {
                if (publicMessageHistory.size() >= MAX_PUBLIC_HISTORY_SIZE) {
                    publicMessageHistory.remove(0);
                }
                publicMessageHistory.add(chatMessage);
                logger.info("Added PUBLIC message to history. History size: {}", publicMessageHistory.size());
            }
            logger.info("Broadcasting PUBLIC CHAT from {}: {}", sender, chatMessage.getContent());
            messagingTemplate.convertAndSend("/topic/public", chatMessage); // Send to public topic

        } else {
            // --- Private Message ---
            logger.info("Processing PRIVATE CHAT from {} to {}: {}", sender, effectiveRecipient, chatMessage.getContent());

            // Generate private history key (consistent order)
            String historyKey = generatePrivateHistoryKey(sender, effectiveRecipient);

            // Add to private history for this pair
            privateMessageHistory.compute(historyKey, (key, history) -> {
                if (history == null) {
                    // Use Collections.synchronizedList for thread safety on the list itself
                    history = Collections.synchronizedList(new ArrayList<>());
                }
                // Synchronize access when modifying the list
                synchronized (history) {
                    if (history.size() >= MAX_PRIVATE_HISTORY_SIZE) {
                        history.remove(0);
                    }
                    history.add(chatMessage);
                }
                logger.info("Added PRIVATE message to history key '{}'. Size: {}", key, history.size());
                return history;
            });

            // *** CHANGED: Send PRIVATE messages also to the public topic ***
            // The frontend's displayMessage function will filter based on recipient
            logger.info("Sending PRIVATE message from {} to {} via /topic/public for client-side filtering", sender, effectiveRecipient);
            messagingTemplate.convertAndSend("/topic/public", chatMessage); // Send to public topic
            // We no longer use convertAndSendToUser here
        }
    }

    // Helper to generate consistent key for private history
    private String generatePrivateHistoryKey(String user1, String user2) {
        // Sort usernames alphabetically to ensure consistency
        return Stream.of(user1, user2)
                .sorted()
                .reduce((u1, u2) -> u1 + ":" + u2)
                .orElseThrow(() -> new IllegalArgumentException("Cannot generate history key without two users"));
    }


    @MessageMapping("/chat.addUser")
    public void addUser(@Payload ChatMessage chatMessage, SimpMessageHeaderAccessor headerAccessor) {
        String username = chatMessage.getSender();
        // Store username in WebSocket session attributes
        Objects.requireNonNull(headerAccessor.getSessionAttributes()).put("username", username);
        // Associate username with the STOMP session for user-specific messaging
        headerAccessor.setUser(new Principal() {
            @Override public String getName() { return username; }
        });
        logger.info("User JOINED intent received for: {}", username);
        eventListener.userJoined(username); // Add user to the list of online users

        // History is now fetched via HTTP by the client upon joining/switching

        // Broadcast JOIN message to public topic
        chatMessage.setTimestamp(LocalDateTime.now().format(formatter));
        chatMessage.setType(ChatMessage.MessageType.JOIN);
        logger.info("Broadcasting JOIN message for {}", username);
        messagingTemplate.convertAndSend("/topic/public", chatMessage);
    }

    // Endpoint to receive logs from frontend
    @MessageMapping("/chat.log")
    public void handleLog(@Payload ChatMessage logMessage) {
        // Log frontend messages with a clear prefix
        // Check if type is LOG to avoid logging regular messages if they somehow hit this endpoint
        if (logMessage.getType() == ChatMessage.MessageType.LOG) {
            logger.info("[FRONTEND LOG {}]: {}", logMessage.getSender(), logMessage.getContent());
        } else {
            logger.warn("[WEIRD LOG MSG RECEIVED] Type was not LOG: {}", logMessage);
        }
    }


    // --- REST Endpoints for History ---

    @GetMapping("/history") // Public history endpoint
    @ResponseBody
    public List<ChatMessage> getPublicHistory() {
        List<ChatMessage> historyToSend;
        // Synchronize access during copy creation
        synchronized (publicMessageHistory) {
            historyToSend = new ArrayList<>(publicMessageHistory);
        }
        logger.info("GET /history (public) request received. Returning {} messages.", historyToSend.size());
        return historyToSend;
    }

    // *** NEW: Private History Endpoint ***
    @GetMapping("/history/{user1}/{user2}")
    @ResponseBody
    public List<ChatMessage> getPrivateHistory(@PathVariable String user1, @PathVariable String user2) {
        String historyKey = generatePrivateHistoryKey(user1, user2);
        // Get the list, or an empty synchronized list if no history exists yet
        List<ChatMessage> history = privateMessageHistory.getOrDefault(historyKey, Collections.synchronizedList(new ArrayList<>()));

        List<ChatMessage> historyToSend;
        // Return a copy, synchronizing access during copy creation
        synchronized (history) {
            historyToSend = new ArrayList<>(history);
        }
        logger.info("GET /history/{}/{} request received. Returning {} messages for key '{}'.", user1, user2, historyToSend.size(), historyKey);
        return historyToSend;
    }
}
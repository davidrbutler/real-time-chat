package chat.listener;

import chat.model.ChatMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
// import org.springframework.web.socket.messaging.SessionSubscribeEvent; // Not currently used
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList; // Import ArrayList if returning a copy as List
import java.util.Collections;
import java.util.LinkedHashSet; // *** Import LinkedHashSet ***
import java.util.Objects;
import java.util.Set;
// Removed ConcurrentHashMap import

@Component
@RestController
public class WebSocketEventListener {

    private static final Logger logger = LoggerFactory.getLogger(WebSocketEventListener.class);

    @Autowired
    private SimpMessageSendingOperations messagingTemplate;

    // *** CHANGE: Use a synchronized LinkedHashSet to maintain insertion order ***
    private final Set<String> onlineUsers = Collections.synchronizedSet(new LinkedHashSet<>());
    private static final DateTimeFormatter formatter = DateTimeFormatter.ISO_DATE_TIME;


    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String username = (String) Objects.requireNonNull(headerAccessor.getSessionAttributes()).get("username");

        if (username != null) {
            logger.info("User Disconnected: {}", username);
            boolean removed = onlineUsers.remove(username); // remove() is thread-safe on synchronizedSet
            if (removed) {
                logger.info("Removed {} from online users. Current online count: {}", username, onlineUsers.size()); // size() is thread-safe
                // Broadcast LEAVE message
                ChatMessage chatMessage = new ChatMessage();
                chatMessage.setType(ChatMessage.MessageType.LEAVE);
                chatMessage.setSender(username);
                chatMessage.setTimestamp(LocalDateTime.now().format(formatter));
                messagingTemplate.convertAndSend("/topic/public", chatMessage);
                logger.info("Broadcasting LEAVE message for {}", username);
            } else {
                logger.warn("Disconnect event for user {} who was not in onlineUsers set.", username);
            }
        } else {
            logger.warn("Disconnect event received, but no username found in session attributes.");
        }
    }

    @GetMapping("/users")
    @ResponseBody
    public Set<String> getOnlineUsers() {
        // Return a copy to avoid issues if the set is modified while being serialized
        // The copy iteration order will reflect the LinkedHashSet's insertion order
        Set<String> usersCopy;
        synchronized (onlineUsers) { // Synchronize access during copy creation
            usersCopy = new LinkedHashSet<>(onlineUsers);
        }
        logger.info("GET /users request received. Returning {} users in join order.", usersCopy.size());
        return usersCopy; // Returns a LinkedHashSet copy (preserves order)
    }

    public void userJoined(String username) {
        if (username == null || username.isBlank()) return;
        // add() is thread-safe on synchronizedSet
        boolean added = onlineUsers.add(username);
        if (added) {
            logger.info("Added {} to online users (join order maintained). Current online count: {}", username, onlineUsers.size()); // size() is thread-safe
        } else {
            logger.warn("User {} tried to join but was already in the onlineUsers set.", username);
        }
    }
}
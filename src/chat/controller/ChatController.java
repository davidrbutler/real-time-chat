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

    private final List<ChatMessage> publicMessageHistory = Collections.synchronizedList(new ArrayList<>());
    private static final int MAX_PUBLIC_HISTORY_SIZE = 100;

    private final Map<String, List<ChatMessage>> privateMessageHistory = new ConcurrentHashMap<>();
    private static final int MAX_PRIVATE_HISTORY_SIZE = 100;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private WebSocketEventListener eventListener;

    private static final DateTimeFormatter formatter = DateTimeFormatter.ISO_DATE_TIME;


    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Payload ChatMessage chatMessage, SimpMessageHeaderAccessor headerAccessor) {
        String sender = chatMessage.getSender();
        String recipient = chatMessage.getRecipient();
        chatMessage.setTimestamp(LocalDateTime.now().format(formatter));
        chatMessage.setType(ChatMessage.MessageType.CHAT);

        String effectiveRecipient = Objects.requireNonNullElse(recipient, "public").isBlank() ? "public" : recipient;

        if (effectiveRecipient.equalsIgnoreCase("public")) {
            chatMessage.setRecipient("public");
            synchronized (publicMessageHistory) {
                if (publicMessageHistory.size() >= MAX_PUBLIC_HISTORY_SIZE) {
                    publicMessageHistory.remove(0);
                }
                publicMessageHistory.add(chatMessage);
                logger.info("Added PUBLIC message to history. History size: {}", publicMessageHistory.size());
            }
            logger.info("Broadcasting PUBLIC CHAT from {}: {}", sender, chatMessage.getContent());
            messagingTemplate.convertAndSend("/topic/public", chatMessage);

        } else {
            logger.info("Processing PRIVATE CHAT from {} to {}: {}", sender, effectiveRecipient, chatMessage.getContent());

            String historyKey = generatePrivateHistoryKey(sender, effectiveRecipient);

            privateMessageHistory.compute(historyKey, (key, history) -> {
                if (history == null) {
                    history = Collections.synchronizedList(new ArrayList<>());
                }
                synchronized (history) {
                    if (history.size() >= MAX_PRIVATE_HISTORY_SIZE) {
                        history.remove(0);
                    }
                    history.add(chatMessage);
                }
                logger.info("Added PRIVATE message to history key '{}'. Size: {}", key, history.size());
                return history;
            });

            logger.info("Sending PRIVATE message from {} to {} via /topic/public for client-side filtering", sender, effectiveRecipient);
            messagingTemplate.convertAndSend("/topic/public", chatMessage);
        }
    }

    private String generatePrivateHistoryKey(String user1, String user2) {
        return Stream.of(user1, user2)
                .sorted()
                .reduce((u1, u2) -> u1 + ":" + u2)
                .orElseThrow(() -> new IllegalArgumentException("Cannot generate history key without two users"));
    }


    @MessageMapping("/chat.addUser")
    public void addUser(@Payload ChatMessage chatMessage, SimpMessageHeaderAccessor headerAccessor) {
        String username = chatMessage.getSender();
        Objects.requireNonNull(headerAccessor.getSessionAttributes()).put("username", username);
        headerAccessor.setUser(new Principal() {
            @Override public String getName() { return username; }
        });
        logger.info("User JOINED intent received for: {}", username);
        eventListener.userJoined(username);


        chatMessage.setTimestamp(LocalDateTime.now().format(formatter));
        chatMessage.setType(ChatMessage.MessageType.JOIN);
        logger.info("Broadcasting JOIN message for {}", username);
        messagingTemplate.convertAndSend("/topic/public", chatMessage);
    }

    @MessageMapping("/chat.log")
    public void handleLog(@Payload ChatMessage logMessage) {
        if (logMessage.getType() == ChatMessage.MessageType.LOG) {
            logger.info("[FRONTEND LOG {}]: {}", logMessage.getSender(), logMessage.getContent());
        } else {
            logger.warn("[WEIRD LOG MSG RECEIVED] Type was not LOG: {}", logMessage);
        }
    }



    @GetMapping("/history")
    @ResponseBody
    public List<ChatMessage> getPublicHistory() {
        List<ChatMessage> historyToSend;
        synchronized (publicMessageHistory) {
            historyToSend = new ArrayList<>(publicMessageHistory);
        }
        logger.info("GET /history (public) request received. Returning {} messages.", historyToSend.size());
        return historyToSend;
    }

    @GetMapping("/history/{user1}/{user2}")
    @ResponseBody
    public List<ChatMessage> getPrivateHistory(@PathVariable String user1, @PathVariable String user2) {
        String historyKey = generatePrivateHistoryKey(user1, user2);
        List<ChatMessage> history = privateMessageHistory.getOrDefault(historyKey, Collections.synchronizedList(new ArrayList<>()));

        List<ChatMessage> historyToSend;
        synchronized (history) {
            historyToSend = new ArrayList<>(history);
        }
        logger.info("GET /history/{}/{} request received. Returning {} messages for key '{}'.", user1, user2, historyToSend.size(), historyKey);
        return historyToSend;
    }
}
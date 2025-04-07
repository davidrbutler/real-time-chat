package chat; // Ensure this package matches your project structure

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Prefix for messages handled by @MessageMapping methods (e.g., /app/chat.sendMessage)
        registry.setApplicationDestinationPrefixes("/app");

        // Prefixes for broker destinations (both public topics and private user queues)
        registry.enableSimpleBroker("/topic", "/queue"); // ADDED /queue

        // Prefix for user-specific destinations (used by convertAndSendToUser)
        registry.setUserDestinationPrefix("/user"); // ADDED THIS LINE
    }
}
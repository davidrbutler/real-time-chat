package chat.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {

    private String content;
    private String sender;
    private MessageType type;
    private String timestamp;
    private String recipient;

    public enum MessageType {
        CHAT,
        JOIN,
        LEAVE,
        LOG,
        PRIVATE
    }
}
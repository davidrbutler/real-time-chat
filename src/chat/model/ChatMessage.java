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
    private String recipient; // NEW: Add recipient field

    public enum MessageType {
        CHAT,
        JOIN,
        LEAVE,
        LOG,
        PRIVATE // Optional: Add specific type for private? Or just use recipient field with CHAT? Let's use recipient field with CHAT type.
    }
}
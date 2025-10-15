import React from "react";
import { MessageInputProps } from "../types";
import { DEFAULT_EMOJIS } from "../constants";

const MessageInput: React.FC<MessageInputProps> = ({
  newMessage,
  showEmojiPicker,
  selectedConversation,
  onMessageChange,
  onSendMessage,
  onToggleEmojiPicker,
  onEmojiSelect,
  onMarkRead,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSendMessage();
    }
  };

  const handleFocus = () => {
    if (selectedConversation) {
      onMarkRead(selectedConversation);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    onToggleEmojiPicker();
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", position: "relative" }}>
      <input
        type="text"
        placeholder="Type a message..."
        value={newMessage}
        onChange={(e) => onMessageChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        style={{
          flexGrow: 1,
          padding: "10px",
          borderRadius: "6px",
          border: "1px solid #444",
          background: "#1c1c1c",
          color: "#fff",
        }}
        aria-label="Message input"
      />
      <button
        onClick={onToggleEmojiPicker}
        style={{ background: "none", border: "none", cursor: "pointer" }}
        aria-label="Toggle emoji picker"
      >
        😊
      </button>
      {showEmojiPicker && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 60,
            background: "#333",
            padding: 5,
            borderRadius: 8,
            display: "flex",
            gap: 4,
          }}
        >
          {DEFAULT_EMOJIS.map((em) => (
            <span
              key={em}
              style={{ cursor: "pointer" }}
              onClick={() => handleEmojiClick(em)}
            >
              {em}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={onSendMessage}
        style={{
          padding: "10px 15px",
          background: "#FA3356",
          border: "none",
          borderRadius: "6px",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Send it
      </button>
    </div>
  );
};

export default MessageInput;









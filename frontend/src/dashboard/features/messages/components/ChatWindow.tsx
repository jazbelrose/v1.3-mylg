import React from "react";
import { ChatWindowProps } from "../types";
import { ChatMessage } from "../MessageItem";
import { DMFile, ChatFile } from "@/shared/utils/messageUtils";
import MessageItem from "../MessageItem";
import MessageInput from "./MessageInput";
import FileUpload from "./FileUpload";
import SpinnerOverlay from "@/shared/ui/SpinnerOverlay";
import { renderFilePreview } from "../utils/filePreview";
import { getFileNameFromUrl } from "@/shared/utils/fileUtils";

const ChatWindow: React.FC<ChatWindowProps & {
  onDelete: (msg: ChatMessage) => void;
  onEditRequest: (msg: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  openPreviewModal: (file: ChatFile | DMFile) => void;
}> = ({
  selectedConversation,
  displayMessages,
  chatTitle,
  chatIcon,
  newMessage,
  showEmojiPicker,
  isLoading,
  errorMessage,
  isDragging,
  isMobile,
  showConversation,
  messagesEndRef,
  userData,
  allUsers,
  folderKey,
  onMessageChange,
  onSendMessage,
  onToggleEmojiPicker,
  onEmojiSelect,
  onMarkRead,
  onDrop,
  onDragOver,
  onDragLeave,
  onBack,
  setIsDragging,
  onDelete,
  onEditRequest,
  onReact,
  openPreviewModal,
}) => {
  if (isMobile && !showConversation) {
    return null;
  }

  const handleMarkRead = () => {
    if (selectedConversation) {
      onMarkRead(selectedConversation);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    onEmojiSelect(emoji);
  };

  return (
    <FileUpload
      isDragging={isDragging}
      selectedConversation={selectedConversation}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      setIsDragging={setIsDragging}
    >
      {isMobile && showConversation && (
        <button
          onClick={onBack}
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "none",
            border: "none",
            color: "#fff",
            fontSize: "18px",
            zIndex: 10,
          }}
          aria-label="Back to conversations"
        >
          ←
        </button>
      )}

      {isLoading && <SpinnerOverlay />}
      {errorMessage && <div className="error-message">{errorMessage}</div>}

      <div
        className="chat-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "5px",
          marginBottom: "10px",
        }}
      >
        <h2 style={{ fontSize: 18 }}>{chatTitle}</h2>
        {chatIcon}
      </div>

      <div
        className="chat-messages"
        style={{
          flexGrow: 1,
          overflowY: isLoading ? "hidden" : "auto",
          padding: "10px",
          background: "#222",
          borderRadius: "5px",
          marginBottom: "10px",
          display: "flex",
          flexDirection: "column",
          justifyContent: displayMessages.length === 0 ? "center" : "flex-start",
          alignItems: displayMessages.length === 0 ? "center" : "stretch",
        }}
        onClick={handleMarkRead}
      >
        {displayMessages.length === 0 && !isLoading ? (
          <div style={{ color: "#aaa", fontSize: 16, textAlign: "center" }}>
            Looks quiet. Drop your first idea here.
          </div>
        ) : (
          displayMessages.map((msg, index) => (
            <MessageItem
              key={msg.optimisticId || msg.messageId || String(msg.timestamp)}
              msg={msg as ChatMessage}
              prevMsg={displayMessages[index - 1] as ChatMessage}
              userData={userData}
              allUsers={allUsers}
              openPreviewModal={openPreviewModal}
              folderKey={folderKey}
              renderFilePreview={renderFilePreview}
              getFileNameFromUrl={getFileNameFromUrl}
              onDelete={onDelete}
              onEditRequest={onEditRequest}
              onReact={onReact}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput
        newMessage={newMessage}
        showEmojiPicker={showEmojiPicker}
        selectedConversation={selectedConversation}
        onMessageChange={onMessageChange}
        onSendMessage={onSendMessage}
        onToggleEmojiPicker={onToggleEmojiPicker}
        onEmojiSelect={handleEmojiSelect}
        onMarkRead={onMarkRead}
      />
    </FileUpload>
  );
};

export default ChatWindow;









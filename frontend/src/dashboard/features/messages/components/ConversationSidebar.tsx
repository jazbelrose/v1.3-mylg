import React from "react";
import { ConversationSidebarProps } from "../types";
import { useOnlineStatus } from "@/app/contexts/OnlineStatusContext";
import { getFileUrl } from "@/shared/utils/api";
import { LIST_ITEM_STYLE } from "../constants";
import User from "@/assets/svg/user.svg?react";

const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  dmConversations,
  selectedConversation,
  threadMap,
  userData,
  isMobile,
  showConversation,
  onConversationOpen,
}) => {
  const { isOnline } = useOnlineStatus() as { isOnline: (id?: string | null) => boolean };

  if (isMobile && showConversation) {
    return null;
  }

  return (
    <div
      className="sidebar"
      style={{
        width: isMobile ? "100%" : "25%",
        borderRight: isMobile ? "none" : "1px solid #444",
        background: "#0c0c0c",
      }}
    >
      <div className="sidebar-section">
        <h3
          style={{
            fontSize: "18px",
            background: "linear-gradient(30deg, #181818, #0c0c0c)",
            padding: "15px",
            margin: 0,
          }}
        >
          # Direct Messages
        </h3>
        <div
          style={{
            maxHeight: isMobile ? "calc(100vh - 150px)" : "400px",
            overflowY: "auto",
          }}
        >
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {dmConversations.map((conv, index) => {
              const onlinePeerId = conv.id
                .replace("dm#", "")
                .split("___")
                .find((id) => id !== userData.userId);
              const online = onlinePeerId ? isOnline(onlinePeerId) : false;

              return (
                <li
                  key={`${conv.id}-${conv.userId}-${index}`}
                  onClick={() => onConversationOpen(conv.id)}
                  style={{
                    ...LIST_ITEM_STYLE,
                    background: selectedConversation === conv.id ? "#252525" : undefined,
                    color: selectedConversation === conv.id ? "#fff" : "#bbb",
                    padding: "10px 15px",
                    position: "relative",
                  }}
                >
                  <div className="avatar-wrapper" style={{ marginRight: 8 }}>
                    <>
                      {conv.profilePicture ? (
                        <img
                          src={getFileUrl(conv.profilePicture)}
                          alt={conv.title}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <User style={{ width: 32, height: 32, opacity: 0.5 }} />
                      )}
                      {online && <span className="online-indicator" />}
                    </>
                  </div>
                  <span style={{ flexGrow: 1, textAlign: "right" }}>{conv.title}</span>
                  {threadMap[conv.id] && (
                    <span
                      style={{
                        background: "#FA3356",
                        color: "#fff",
                        borderRadius: "12px",
                        padding: "2px 6px",
                        fontSize: "12px",
                        marginLeft: "4px",
                      }}
                    >
                      NEW
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ConversationSidebar;









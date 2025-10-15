import React, { useMemo } from "react";
import HQLayout from "../components/HQLayout";
import styles from "./HQMessagesPage.module.css";
import { useData } from "@/app/contexts/useData";

type InboxThread = {
  id?: string;
  conversationId?: string;
  createdAt?: string;
  updatedAt?: string;
  subject?: string;
  title?: string;
  preview?: string;
  lastMessage?: { body?: string };
  unreadCount?: number;
  participants?: Array<{ name?: string | null; email?: string | null }>;
};

const HQMessagesPage: React.FC = () => {
  const { inbox } = useData() as { inbox: InboxThread[] };

  const threads = useMemo(() => {
    return (inbox ?? []).slice().sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });
  }, [inbox]);

  const hasThreads = threads.length > 0;

  return (
    <HQLayout
      title="Messages"
      description="Keep on top of approvals, vendor threads, and internal conversations without leaving HQ."
    >
      <div className={styles.page}>
        {hasThreads ? (
          <ul className={styles.threadList}>
            {threads.map((thread, index) => (
              <li
                key={thread.id ?? thread.conversationId ?? `thread-${index}`}
                className={styles.threadCard}
              >
                <div className={styles.threadHeader}>
                  <h3>{thread.subject ?? thread.title ?? "Untitled conversation"}</h3>
                  {thread.unreadCount && thread.unreadCount > 0 ? (
                    <span className={styles.unreadBadge}>{thread.unreadCount} new</span>
                  ) : null}
                </div>
                <p className={styles.threadPreview}>
                  {thread.preview ?? thread.lastMessage?.body ?? "No messages yet."}
                </p>
                <div className={styles.threadMeta}>
                  <span>{thread.participants?.map((p) => p.name ?? p.email).filter(Boolean).join(", ")}</span>
                  <span aria-hidden>•</span>
                  <span>{new Date(thread.updatedAt ?? thread.createdAt ?? Date.now()).toLocaleString()}</span>
                </div>
                <div className={styles.threadActions}>
                  <button type="button">Open thread</button>
                  <button type="button">Mark read</button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.emptyState} role="status">
            No messages yet. Start a conversation to collaborate with your team and vendors.
          </div>
        )}
      </div>
    </HQLayout>
  );
};

export default HQMessagesPage;

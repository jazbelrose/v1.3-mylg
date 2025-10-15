import React from "react";
import { useData } from "@/app/contexts/useData";
import { Bell, FileText } from "lucide-react";

// ---- Types ---------------------------------------------------------------

interface LeftSideBarProps {
  setActiveView: (view: string) => void;
  setDmUserSlug: (slug: string) => void;
}

interface UseData {
  userData: {
    invoices?: Array<{ status?: string }>;
  } | null;
}

// ---- Component -----------------------------------------------------------

const LeftSideBar: React.FC<LeftSideBarProps> = () => {
  const { userData } = useData() as UseData;

  const invoicesDue = userData?.invoices?.filter((i) => i.status === "due").length || 0;

  return (
    <div className="quick-stats-container-column">
      <div className="left-sidebar-grid">
        <div className="stat-item left-stat-large">
          <div className="stat-item-header">
            <Bell className="stat-icon" />
            <div className="stats-header">
              <span className="stats-title">Notifications &amp; Inbox</span>
            </div>
          </div>
          <div className="progress-text">
            Open the bell icon in the header to view notifications and direct messages in the
            notifications drawer. Pin it to keep updates visible while you work.
          </div>
        </div>

        <div className="stat-item left-stat-small">
          <div className="stat-item-header">
            <FileText className="stat-icon" />
            <div className="stats-header">
              <span className="stats-title">Invoices Due</span>
              <span className="stats-count">{invoicesDue}</span>
            </div>
          </div>
          <div className="progress-text">{invoicesDue} Due Invoices</div>
        </div>
      </div>
    </div>
  );
};

export default LeftSideBar;










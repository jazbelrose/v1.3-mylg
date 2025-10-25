import React from "react";
import { Bell, Search, X } from "lucide-react";
import GlobalSearch from "@/dashboard/home/components/GlobalSearch";
import Modal from "@/shared/ui/ModalWithStack";
import NavBadge from "@/shared/ui/NavBadge";
import { useNotifications } from "@/app/contexts/useNotifications";
import { useNotificationsDrawer } from "@/app/contexts/useNotificationsDrawer";
import styles from "./MobileQuickActions.module.css";
import searchModalStyles from "./dashboard-nav-search-modal.module.css";
import "@/dashboard/home/styles/components/welcome-header.css";

interface MobileQuickActionsProps {
  className?: string;
  iconSize?: number;
}

const MobileQuickActions: React.FC<MobileQuickActionsProps> = ({
  className = "",
  iconSize = 20,
}) => {
  const { notifications } = useNotifications();
  const { open: openNotificationsDrawer, isOpen: isNotificationsDrawerOpen } =
    useNotificationsDrawer();
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);

  const unreadCount = React.useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  const handleOpenSearch = () => setIsSearchOpen(true);
  const handleCloseSearch = () => setIsSearchOpen(false);

  const containerClassName = [styles.container, className]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className={containerClassName}>
        <button
          type="button"
          className={`header-icon-btn ${styles.iconButton}`}
          onClick={handleOpenSearch}
          aria-label="Open search"
        >
          <span className={styles.iconWrapper}>
            <Search size={iconSize} />
            <span className={styles.dotBadge} aria-hidden />
          </span>
        </button>
        <button
          type="button"
          className={`header-icon-btn ${styles.iconButton}`}
          onClick={openNotificationsDrawer}
          aria-label="Open notifications"
          aria-expanded={isNotificationsDrawerOpen}
        >
          <span className={styles.iconWrapper}>
            <Bell size={iconSize} />
            {unreadCount > 0 ? (
              <NavBadge
                count={unreadCount}
                label="notification"
                className={styles.badge}
              />
            ) : (
              <span className={styles.dotBadge} aria-hidden />
            )}
          </span>
        </button>
      </div>

      <Modal
        isOpen={isSearchOpen}
        onRequestClose={handleCloseSearch}
        shouldCloseOnOverlayClick
        overlayClassName={searchModalStyles.overlay}
        className={searchModalStyles.modal}
        contentLabel="Dashboard search"
      >
        <div className={searchModalStyles.modalContent}>
          <div className={searchModalStyles.modalHeader}>
            <div className={searchModalStyles.modalTitleGroup}>
              <div className={searchModalStyles.modalIcon} aria-hidden>
                <Search size={20} />
              </div>
              <div>
                <h2 className={searchModalStyles.modalTitle}>Search</h2>
                <p className={searchModalStyles.modalSubtitle}>
                  Find projects, messages, collaborators, and more.
                </p>
              </div>
            </div>
            <button
              type="button"
              className={searchModalStyles.closeButton}
              onClick={handleCloseSearch}
              aria-label="Close search"
            >
              <X size={18} />
            </button>
          </div>
          <GlobalSearch
            className={searchModalStyles.search}
            onNavigate={handleCloseSearch}
            autoFocus={isSearchOpen}
          />
        </div>
      </Modal>
    </>
  );
};

export default MobileQuickActions;

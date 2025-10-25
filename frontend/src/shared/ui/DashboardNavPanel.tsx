import React from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import GlobalSearch from "@/dashboard/home/components/GlobalSearch";
import Modal from "@/shared/ui/ModalWithStack";
import NavBadge from "./NavBadge";
import useDashboardNavigation, {
  type DashboardNavItem,
  type UseDashboardNavigationArgs,
} from "./useDashboardNavigation";
import "./navigation-drawer.css";
import searchModalStyles from "./dashboard-nav-search-modal.module.css";

type Variant = "persistent" | "overlay";

type DashboardNavPanelProps = UseDashboardNavigationArgs & {
  variant?: Variant;
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

function renderNavItem(item: DashboardNavItem, isCollapsed: boolean) {
  const hasBadge = typeof item.badgeCount === "number" && item.badgeCount > 0 && item.badgeLabel;
  const keyClass = item.key ? `nav-item--${item.key}` : "";
  const className = [
    "nav-item",
    keyClass,
    item.isAction ? "nav-item--action" : "",
    item.isActive ? "nav-item--active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const accessibilityProps = isCollapsed
    ? {
        "aria-label": item.shortLabel || item.label,
        title: item.shortLabel || item.label,
      }
    : {};
  const labelClass = ["nav-item__label", isCollapsed ? "nav-item__label--hidden" : ""]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
      <span className="nav-item__icon" aria-hidden>
        {item.icon}
        {hasBadge ? (
          <NavBadge
            count={item.badgeCount ?? 0}
            label={item.badgeLabel ?? "item"}
            className="nav-item__badge"
          />
        ) : null}
      </span>
      <span className={labelClass}>{item.label}</span>
    </>
  );

  const activeProps = item.isActive ? { "aria-current": "page" as const } : {};

  if (item.href) {
    return (
      <li key={item.key}>
        <a
          className={className}
          href={item.href}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          onClick={item.onClick}
          {...accessibilityProps}
          {...activeProps}
        >
          {inner}
        </a>
      </li>
    );
  }

  return (
    <li key={item.key}>
      <button
        type="button"
        className={className}
        onClick={item.onClick}
        {...(item.isActive ? { "aria-pressed": true } : {})}
        {...accessibilityProps}
      >
        {inner}
      </button>
    </li>
  );
}

const DashboardNavPanel: React.FC<DashboardNavPanelProps> = ({
  setActiveView,
  onClose,
  variant = "persistent",
  className,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const { navItems, bottomItems } = useDashboardNavigation({ setActiveView, onClose });
  const isOverlay = variant === "overlay";
  const isPersistent = variant === "persistent";
  const [isSearchModalOpen, setIsSearchModalOpen] = React.useState(false);

  const handleOpenSearch = React.useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  const handleCloseSearch = React.useCallback(() => {
    setIsSearchModalOpen(false);
  }, []);

  const handleSearchNavigate = React.useCallback(() => {
    setIsSearchModalOpen(false);
  }, []);

  const primaryNavItems = React.useMemo(() => {
    if (!isPersistent) {
      return navItems;
    }

    const searchNavItem: DashboardNavItem = {
      key: "search",
      icon: <Search size={24} />,
      label: "Search",
      onClick: handleOpenSearch,
      isActive: isSearchModalOpen,
      shortLabel: "Search",
    };

    if (navItems.length === 0) {
      return [searchNavItem];
    }

    const [firstItem, ...rest] = navItems;
    return [firstItem, searchNavItem, ...rest];
  }, [handleOpenSearch, isPersistent, isSearchModalOpen, navItems]);

  const containerClass = [
    "dashboard-nav-panel",
    `dashboard-nav-panel--${variant}`,
    isCollapsed ? "dashboard-nav-panel--collapsed" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const topSection = isOverlay ? (
    <div className="navigation-drawer-search">
      <GlobalSearch onNavigate={onClose} />
    </div>
  ) : onClose ? (
    <div className="navigation-drawer-header">
      <button
        type="button"
        className="close-button"
        onClick={onClose}
        aria-label="Close navigation"
      >
        <X size={24} />
      </button>
    </div>
  ) : null;

  return (
    <div className={containerClass}>
      {topSection}

      <div className="navigation-drawer-content">
        {isPersistent ? (
          <div className="dashboard-nav-panel__brand-row">
            <Link
              to="/"
              className="dashboard-nav-panel__brand-button"
              aria-label="Go to marketing home"
            >
              <span className="dashboard-nav-panel__brand-mark">M!</span>
              <span className="dashboard-nav-panel__brand-text">MYLG!</span>
            </Link>
            {onToggleCollapse ? (
              <button
                type="button"
                className="dashboard-nav-panel__collapse-toggle"
                onClick={onToggleCollapse}
                aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
                title={isCollapsed ? "Expand navigation" : "Collapse navigation"}
              >
                {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            ) : null}
          </div>
        ) : null}

        <ul className="nav-list nav-list--primary">
          {(isPersistent ? primaryNavItems : navItems).map((item) =>
            renderNavItem(item, isCollapsed)
          )}
        </ul>
        <ul className="nav-list nav-list--secondary">
          {bottomItems.map((item) => renderNavItem(item, isCollapsed))}
        </ul>
      </div>

      {isPersistent ? (
        <Modal
          isOpen={isSearchModalOpen}
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
            <GlobalSearch className={searchModalStyles.search} onNavigate={handleSearchNavigate} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

export default DashboardNavPanel;













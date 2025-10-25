import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, X, User as UserIcon } from "lucide-react";
import { Link } from "react-router-dom";
import GlobalSearch from "@/dashboard/home/components/GlobalSearch";
import NavBadge from "./NavBadge";
import useDashboardNavigation, {
  type DashboardNavItem,
  type UseDashboardNavigationArgs,
} from "./useDashboardNavigation";
import "./navigation-drawer.css";
import { useData } from "@/app/contexts/useData";
import { getFileUrl } from "@/shared/utils/api";
import { useOnlineStatus } from "@/app/contexts/OnlineStatusContext";

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
  const { userData } = useData();
  const { isOnline } = useOnlineStatus();
  const { navItems, bottomItems, userNavItem } = useDashboardNavigation({
    setActiveView,
    onClose,
  });
  const isOverlay = variant === "overlay";
  const isPersistent = variant === "persistent";

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
        <X size={24} color="white" />
      </button>
    </div>
  ) : null;

  const userDisplayName = useMemo(() => {
    const first = userData?.firstName?.trim();
    const last = userData?.lastName?.trim();
    if (first || last) {
      return [first, last].filter(Boolean).join(" ");
    }

    return userData?.email ?? "My Account";
  }, [userData?.email, userData?.firstName, userData?.lastName]);

  const userOccupation = useMemo(() => {
    return userData?.occupation?.trim() || userData?.role?.trim() || "";
  }, [userData?.occupation, userData?.role]);

  const userInitials = useMemo(() => {
    const first = userData?.firstName?.trim();
    const last = userData?.lastName?.trim();
    const initials = [first?.[0], last?.[0]].filter(Boolean).join("");
    if (initials) return initials.toUpperCase();

    const fallback = userDisplayName?.trim()?.[0];
    return fallback ? fallback.toUpperCase() : "";
  }, [userData?.firstName, userData?.lastName, userDisplayName]);

  const userAvatarUrl = userData?.thumbnail ? getFileUrl(userData.thumbnail) : "";

  const isUserOnline = isOnline?.(userData?.userId);

  const handleUserClick = () => {
    userNavItem.onClick?.();
  };

  const userAriaLabel = userOccupation
    ? `${userDisplayName}, ${userOccupation}`
    : userDisplayName;

  const userButtonClassName = [
    "nav-item",
    "dashboard-nav-panel__user",
    userNavItem.isActive ? "nav-item--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
          {navItems.map((item) => renderNavItem(item, isCollapsed))}
        </ul>
        <ul className="nav-list nav-list--secondary">
          <li>
            <button
              type="button"
              className={userButtonClassName}
              onClick={handleUserClick}
              title={userDisplayName}
              aria-label={userAriaLabel}
            >
              <span className="nav-item__icon dashboard-nav-panel__user-avatar">
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt="" />
                ) : userInitials ? (
                  <span className="dashboard-nav-panel__user-initials" aria-hidden>
                    {userInitials}
                  </span>
                ) : (
                  <UserIcon size={20} aria-hidden />
                )}
                {userData?.userId ? (
                  <span
                    className="dashboard-nav-panel__user-status"
                    data-online={isUserOnline ? "true" : undefined}
                    aria-hidden
                  />
                ) : null}
              </span>
              <span className="dashboard-nav-panel__user-details">
                <span className="dashboard-nav-panel__user-name">{userDisplayName}</span>
                {userOccupation ? (
                  <span className="dashboard-nav-panel__user-occupation">{userOccupation}</span>
                ) : null}
              </span>
            </button>
          </li>
          {bottomItems.map((item) => renderNavItem(item, isCollapsed))}
        </ul>
      </div>
    </div>
  );
};

export default DashboardNavPanel;













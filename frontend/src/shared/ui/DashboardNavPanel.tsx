import React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Link } from "react-router-dom";
import GlobalSearch from "@/dashboard/home/components/GlobalSearch";
import "@/dashboard/home/components/GlobalSearch.css";
import NavBadge from "./NavBadge";
import useDashboardNavigation, {
  type DashboardNavItem,
  type UseDashboardNavigationArgs,
} from "./useDashboardNavigation";
import "./navigation-drawer.css";

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

  return (
    <div className={containerClass}>
      {topSection}

      <div className="navigation-drawer-content">
        {isPersistent ? (
          <div className="dashboard-nav-panel__brand-section">
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
            {!isCollapsed ? (
              <div className="dashboard-nav-panel__search">
                <GlobalSearch
                  className="dashboard-nav-panel__search-input"
                  onNavigate={onClose}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <ul className="nav-list nav-list--primary">
          {navItems.map((item) => renderNavItem(item, isCollapsed))}
        </ul>
        <ul className="nav-list nav-list--secondary">
          {bottomItems.map((item) => renderNavItem(item, isCollapsed))}
        </ul>
      </div>
    </div>
  );
};

export default DashboardNavPanel;













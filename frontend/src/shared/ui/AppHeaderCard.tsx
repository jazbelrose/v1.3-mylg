import React, { useMemo } from "react";
import { Bell, ChevronLeft, Menu, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import memryLogoUrl from "@/assets/svg/memry logo.svg";
import { UserContext } from "@/app/contexts/UserContext";
import { OnlineStatusContext } from "@/app/contexts/OnlineStatusContext";
import { NotificationContext } from "@/app/contexts/NotificationProvider";
import { NotificationsDrawerContext } from "@/app/contexts/NotificationsDrawerContext";
import { getFileUrl } from "@/shared/utils/api";
import GlobalSearch from "@/dashboard/home/components/GlobalSearch";
import styles from "./AppHeaderCard.module.css";

export type AppHeaderLeftMode = "menu" | "back" | "none";
export type AppHeaderCenterMode = "search" | "title";

export interface AppHeaderCardProps {
  leftMode?: AppHeaderLeftMode;
  onLeftAction?: () => void;
  leftAriaLabel?: string;
  navigationDrawerId?: string;
  isNavigationOpen?: boolean;
  centerMode?: AppHeaderCenterMode;
  title?: string;
  secondary?: React.ReactNode;
  showBrand?: boolean;
  brandAriaLabel?: string;
  onBrandClick?: () => void;
}

const AppHeaderCard: React.FC<AppHeaderCardProps> = ({
  leftMode = "menu",
  onLeftAction,
  leftAriaLabel,
  navigationDrawerId,
  isNavigationOpen,
  secondary,
  showBrand = true,
  brandAriaLabel = "Go home",
  onBrandClick,
}) => {
  const navigate = useNavigate();
  const userCtx = React.useContext(UserContext);
  const userData = userCtx?.userData ?? null;
  const onlineStatus = React.useContext(OnlineStatusContext);
  const notificationsCtx = React.useContext(NotificationContext);
  const notificationsDrawer = React.useContext(NotificationsDrawerContext);

  const isOnline = onlineStatus?.isOnline ?? (() => false);
  const notifications = notificationsCtx?.notifications ?? [];
  const openNotificationsDrawer = notificationsDrawer?.open ?? (() => {});
  const isNotificationsOpen = notificationsDrawer?.isOpen ?? false;

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const thumbnailKey = userData?.thumbnail?.trim();
  const thumbnailUrl = userData?.thumbnailUrl?.trim();
  const avatarSrc = useMemo(() => {
    if (!thumbnailKey && !thumbnailUrl) return undefined;
    if (thumbnailKey) {
      try {
        return getFileUrl(thumbnailKey);
      } catch {
        return thumbnailUrl;
      }
    }
    return thumbnailUrl;
  }, [thumbnailKey, thumbnailUrl]);

  const rawAvatarInitial =
    userData?.firstName?.trim()?.[0] ||
    userData?.lastName?.trim()?.[0] ||
    userData?.email?.trim()?.[0] ||
    "";
  const avatarInitial = rawAvatarInitial.toUpperCase();
  const userId = userData?.userId;
  const isUserOnline = !!userId && isOnline(String(userId));

  const handleBrandClick = () => {
    if (onBrandClick) return onBrandClick();
    navigate("/dashboard/projects");
  };

  const handleAvatarClick = () => {
    if (userData?.userId) {
      navigate("/dashboard/settings");
      return;
    }
    navigate("/");
  };

  const leftButton =
    leftMode === "none" ? null : (
      <button
        type="button"
        className={styles.iconBtn}
        onClick={onLeftAction}
        aria-label={
          leftAriaLabel ?? (leftMode === "back" ? "Go back" : "Open navigation")
        }
        aria-controls={leftMode === "menu" ? navigationDrawerId : undefined}
        aria-expanded={leftMode === "menu" ? Boolean(isNavigationOpen) : undefined}
        disabled={!onLeftAction}
      >
        {leftMode === "back" ? <ChevronLeft size={20} /> : <Menu size={20} />}
      </button>
    );

  return (
    <div className={styles.header} data-app-header-card role="banner">
      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.left}>
            {showBrand ? (
              <button
                type="button"
                className={styles.brandBtn}
                onClick={handleBrandClick}
                aria-label={brandAriaLabel}
              >
                <img
                  src={memryLogoUrl}
                  alt=""
                  className={styles.brandMark}
                  aria-hidden
                  draggable={false}
                />
              </button>
            ) : null}
            {leftButton}
          </div>

          <div className={styles.center}>
            <div className={styles.search}>
              <GlobalSearch className={undefined} />
            </div>
          </div>

          <div className={styles.right}>
            <div className={styles.rightGroup}>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.bell}`}
                onClick={openNotificationsDrawer}
                aria-label="Open notifications"
                aria-expanded={isNotificationsOpen}
              >
                <Bell size={20} />
                {unreadCount > 0 ? (
                  <span className={styles.badge} aria-label={`${unreadCount} unread`}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                className={styles.avatarBtn}
                onClick={handleAvatarClick}
                aria-label="Open profile"
              >
                <span className={styles.avatar}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" className={styles.avatarImg} />
                  ) : avatarInitial ? (
                    <span className={styles.avatarPlaceholder} aria-hidden>
                      {avatarInitial}
                    </span>
                  ) : (
                    <UserIcon size={18} />
                  )}
                  {isUserOnline ? (
                    <span className={styles.onlineDot} aria-label="Online" />
                  ) : null}
                </span>
              </button>
            </div>
          </div>
        </div>

        {secondary ? <div className={styles.secondary}>{secondary}</div> : null}
      </div>
    </div>
  );
};

export default AppHeaderCard;

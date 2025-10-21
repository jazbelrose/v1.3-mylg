import React, { useEffect, useMemo, useState } from 'react';
import { User, Bell, Menu, Plus } from "lucide-react";
import { useData } from '@/app/contexts/useData';
import { useNavigate } from 'react-router-dom';
import { useOnlineStatus } from '@/app/contexts/OnlineStatusContext';
import NotificationsDrawer from '../../../shared/ui/NotificationsDrawer';
import { useNotifications } from "../../../app/contexts/useNotifications";
import NavBadge from "../../../shared/ui/NavBadge";
import GlobalSearch from './GlobalSearch';
import './GlobalSearch.css';
import { getFileUrl } from '../../../shared/utils/api';

interface WelcomeHeaderProps {
  userName?: string;
  setActiveView?: (view: string) => void;
  onToggleNavigation?: () => void;
  isNavigationOpen?: boolean;
  navigationDrawerId?: string;
  isDesktopLayout?: boolean;
  showDesktopGreeting?: boolean;
}

const WelcomeHeader: React.FC<WelcomeHeaderProps> = ({
  userName: propUserName,
  setActiveView,
  onToggleNavigation,
  isNavigationOpen,
  navigationDrawerId,
  isDesktopLayout,
  showDesktopGreeting = true,
}) => {
  const { userData } = useData();
  const { isOnline } = useOnlineStatus(); // <-- only need this now
  const navigate = useNavigate();

  const userName = propUserName || userData?.firstName || userData?.email || 'User';
  const fallbackEmailName = userData?.email?.split('@')[0];
  const firstName =
    userData?.firstName?.trim() ||
    propUserName?.trim().split(/\s+/)[0] ||
    fallbackEmailName?.trim() ||
    'there';
  const normalizedFirstName = firstName
    ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
    : 'there';
  const userThumbnail = userData?.thumbnail;
  const userId = userData?.userId;

  // notifications drawer
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsPinned, setNotificationsPinned] = useState(false);

  // notifications count
  const { notifications } = useNotifications();
  const unreadNotifications = notifications.filter((n) => !n.read).length;

  // online status (derived from presenceChanged events via OnlineStatusContext)
  const isUserOnline = !!userId && isOnline(String(userId));

  const baseDrawerId = navigationDrawerId;
  const isDrawerOpen = isNavigationOpen ?? false;
  const isDesktopShell = isDesktopLayout ?? false;
  const hasNavigationToggle = Boolean(onToggleNavigation);
  const showHamburger = Boolean(setActiveView && hasNavigationToggle && !isDesktopShell);
  const showBrandInHeader = !isDesktopShell;

  const greetingMessage = useMemo(() => {
    if (!isDesktopShell || !showDesktopGreeting) return null;

    const hour = new Date().getHours();
    let baseGreeting = 'Good evening';

    if (hour < 12) baseGreeting = 'Good morning';
    else if (hour < 18) baseGreeting = 'Good afternoon';

    return `${baseGreeting}, ${normalizedFirstName}!`;
  }, [isDesktopShell, normalizedFirstName, showDesktopGreeting]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showGlobalSearchInHeader = !isMobile;

  const handleHomeClick = () => navigate('/');
  const handleNotificationsToggle = () => setNotificationsOpen(!notificationsOpen);
  const handleNotificationsPinToggle = () => setNotificationsPinned(!notificationsPinned);
  const handleNavigationToggle = () => {
    if (onToggleNavigation) {
      onToggleNavigation();
    }
  };

  const handleAvatarKeyDown: React.KeyboardEventHandler<HTMLDivElement | SVGElement | HTMLImageElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleHomeClick();
    }
  };

  const handleLogoKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleHomeClick();
    }
  };

  const handleNotificationKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNotificationsToggle();
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNavigationToggle();
    }
  };

  const brandClassName = [
    'welcome-header__brand',
    'squircle',
    isMobile ? 'welcome-header__brand--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className="welcome-header-desktop">
        {/* Left: Logo + Hamburger */}
        <div className="welcome-header-left">
          {showBrandInHeader ? (
            <div
              className="header-icon-btn welcome-header__brand-button"
              onClick={handleHomeClick}
              role="button"
              tabIndex={0}
              aria-label="Go to Home"
              onKeyDown={handleLogoKeyDown}
            >
              <span className={brandClassName}>M!</span>
            </div>
          ) : null}

          {showHamburger && (
            <button
              type="button"
              className="header-icon-btn"
              onClick={handleNavigationToggle}
              aria-label="Toggle navigation"
              aria-controls={baseDrawerId}
              aria-expanded={isDrawerOpen}
              onKeyDown={handleMenuKeyDown}
              style={{ cursor: 'pointer' }}
            >
              <Menu size={isMobile ? 20 : 24} color="white" />
            </button>
          )}
        </div>

        {greetingMessage ? (
          <div className="welcome-header-greeting" aria-live="polite">
            {greetingMessage}
          </div>
        ) : null}

        {/* Right: Global Search + Create, Notifications, Avatar (+ online dot) */}
        <div className="welcome-header-right">
          {showGlobalSearchInHeader ? (
            <div className="welcome-header-search">
              <GlobalSearch className="welcome-header-global-search" />
            </div>
          ) : null}

          <div className="welcome-header-actions">
            <div
              className="nav-item-style"
              onClick={() => navigate("/dashboard/new")}
              title="Start something"
            >
              <Plus size={isMobile ? 20 : 26} color="white" />
            </div>

            <div
              className="nav-icon-wrapper nav-icon-style"
              onClick={handleNotificationsToggle}
              role="button"
              tabIndex={0}
              aria-label="Open notifications"
              onKeyDown={handleNotificationKeyDown}
            >
              <Bell size={isMobile ? 24 : 26} color="white" />
              <NavBadge count={unreadNotifications} label="notification" className="nav-bar-badge" />
            </div>

            <div style={{ position: 'relative' }}>
              {userThumbnail ? (
                <img
                  src={getFileUrl(userThumbnail)}
                  alt={`${userName}'s Thumbnail`}
                  style={{
                    width: isMobile ? '32px' : '40px',
                    height: isMobile ? '32px' : '40px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    cursor: 'pointer',
                  }}
                  onClick={handleHomeClick}
                  role="button"
                  tabIndex={0}
                  aria-label="Go to Home"
                  onKeyDown={handleAvatarKeyDown}
                />
              ) : (
                <User
                  size={isMobile ? 24 : 30}
                  color="white"
                  style={{
                    borderRadius: '50%',
                    backgroundColor: '#333',
                    cursor: 'pointer',
                    padding: isMobile ? '4px' : '5px',
                  }}
                  onClick={handleHomeClick}
                  role="button"
                  tabIndex={0}
                  aria-label="Go to Home"
                  onKeyDown={handleAvatarKeyDown}
                />
              )}

              {isUserOnline && (
                <div
                  style={{
                    position: 'absolute',
                    top: isMobile ? '1px' : '2px',
                    right: isMobile ? '1px' : '2px',
                    width: isMobile ? '10px' : '12px',
                    height: isMobile ? '10px' : '12px',
                    borderRadius: '50%',
                    backgroundColor: '#00ff00',
                    border: '2px solid #000',
                  }}
                  aria-label="Online"
                />
              )}
            </div>
          </div>
        </div>
      </div>


      <NotificationsDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        pinned={notificationsPinned}
        onTogglePin={handleNotificationsPinToggle}
      />
    </>
  );
};

export default WelcomeHeader;










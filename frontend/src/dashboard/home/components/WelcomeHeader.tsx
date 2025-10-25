import React, { useEffect, useMemo, useState } from 'react';
import { User as UserIcon, Menu } from "lucide-react";
import { useData } from '@/app/contexts/useData';
import { useNavigate } from 'react-router-dom';
import { useOnlineStatus } from '@/app/contexts/OnlineStatusContext';
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
    normalizedFirstName?.[0] ||
    '';
  const avatarInitial = rawAvatarInitial.toUpperCase();
  const userId = userData?.userId;

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

  // Always show global search in the welcome header, regardless of viewport size
  const showGlobalSearchInHeader = true;

  const handleHomeClick = () => navigate('/');
  const handleNavigationToggle = () => {
    if (onToggleNavigation) {
      onToggleNavigation();
    }
  };

  const handleLogoKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleHomeClick();
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

  const avatarClassName = [
    'welcome-header-avatar',
    isMobile ? 'welcome-header-avatar--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const avatarStatusClassName = [
    'welcome-header-avatar__status',
    isMobile ? 'welcome-header-avatar__status--compact' : '',
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

        {/* Right: Global Search + Avatar (+ online dot) */}
        <div className="welcome-header-right">
          {showGlobalSearchInHeader ? (
            <div className="welcome-header-search">
              <GlobalSearch className="welcome-header-global-search" />
            </div>
          ) : null}

          <div className="welcome-header-actions">
            <button
              type="button"
              className="welcome-header-avatar-button"
              onClick={handleHomeClick}
              aria-label="Go to Home"
              title={userName}
            >
              <span className={avatarClassName}>
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt=""
                    className="welcome-header-avatar__img"
                  />
                ) : avatarInitial ? (
                  <span className="welcome-header-avatar__placeholder" aria-hidden>
                    {avatarInitial}
                  </span>
                ) : (
                  <span className="welcome-header-avatar__placeholder" aria-hidden>
                    <UserIcon size={isMobile ? 18 : 22} />
                  </span>
                )}
                {isUserOnline ? (
                  <span className={avatarStatusClassName} aria-label="Online" />
                ) : null}
              </span>
            </button>
          </div>
        </div>
      </div>

    </>
  );
};

export default WelcomeHeader;










import React, { useEffect, useState } from 'react';
import styles from './avatar-stack.module.css';
import { getFileUrl } from '../utils/api';

interface Member {
  userId: string;
  firstName?: string;
  lastName?: string;
  thumbnail?: string;
}

interface AvatarStackProps {
  members?: Member[];
  onClick?: () => void;
  size?: number; // avatar diameter in px (default 34)
}

const getMaxVisible = (): number => {
  if (typeof window !== 'undefined') {
    if (window.innerWidth < 480) return 2;
    if (window.innerWidth < 768) return 3;
  }
  return 4;
};

const AvatarStack: React.FC<AvatarStackProps> = ({ members = [], onClick, size }) => {
  const [maxVisible, setMaxVisible] = useState<number>(getMaxVisible());

  useEffect(() => {
    const handleResize = () => setMaxVisible(getMaxVisible());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const visibleMembers = members.slice(0, maxVisible);
  const remaining = members.length - visibleMembers.length;

  const avatarSize = typeof size === 'number' && size > 8 ? size : 34;
  const overlap = Math.floor(avatarSize / 2);

  return (
    <div
      className={styles.stack}
      aria-label="Project team members"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {visibleMembers.map((m, idx) => {
        const label = `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'User';
        const initials = ((m.firstName?.[0] || '') + (m.lastName?.[0] || '')).toUpperCase() || 'U';
        return (
          <div
            key={m.userId}
            className={styles.avatar}
            style={{
              zIndex: visibleMembers.length - idx,
              width: avatarSize,
              height: avatarSize,
              marginLeft: idx > 0 ? -overlap : 0,
            }}
            title={label}
            aria-label={label}
          >
            {m.thumbnail ? (
              <img src={getFileUrl(m.thumbnail)} alt={label} />
            ) : (
              <span className={styles.initials}>{initials}</span>
            )}
          </div>
        );
      })}
      {remaining > 0 && (
        <div
          className={styles.avatar}
          style={{ zIndex: 0, width: avatarSize, height: avatarSize, marginLeft: visibleMembers.length > 0 ? -overlap : 0 }}
          title={`${remaining} more`}
          aria-label={`${remaining} more users`}
        >
          <span className={styles.more}>+{remaining}</span>
        </div>
      )}
    </div>
  );
};

export default AvatarStack;










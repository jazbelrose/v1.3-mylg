import React from 'react';
import ProjectAvatar from '../../../shared/ui/ProjectAvatar';
import { getFileUrl } from '../../../shared/utils/api';
import styles from './Collaborators.module.css';

interface CurrentUserProfileProps {
  userData: { userId?: string; firstName?: string; lastName?: string; occupation?: string; thumbnail?: string; role?: string; [key: string]: unknown };
  isOnline: (id?: string | null) => boolean;
  isMobile: boolean;
  getUserProjects: (uid: string | undefined) => { projectId: string; thumbnails?: string[]; title?: string }[];
}

const CurrentUserProfile: React.FC<CurrentUserProfileProps> = ({
  userData,
  isOnline,
  isMobile,
  getUserProjects,
}) => {
  return (
    <div className={styles.profileBlock}>
      <div className={styles.avatarWrapper}>
        {userData?.thumbnail ? (
          <img src={getFileUrl(userData.thumbnail)} alt="Me" className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder} />
        )}
        {isOnline(userData?.userId) && (
          <span className={`${styles.statusDot} ${styles.online}`} />
        )}
      </div>
      <div className={styles.profileInfo}>
        <span className={styles.name}>
          {userData?.firstName} {userData?.lastName} (You)
        </span>
        <div className={styles.metaRow}>
          {userData.role && (
            <span
              className={`${styles.roleTag} ${
                styles[
                  'role' +
                    (userData.role || '')
                      .toLowerCase()
                      .replace(/^[a-z]/, (c) => c.toUpperCase())
                ] || ''
              }`}
            >
              {userData.role
                ? userData.role[0].toUpperCase() + userData.role.slice(1).toLowerCase()
                : ''}
            </span>
          )}
          {userData.occupation && (
            <span className={styles.occupationTag}>{userData.occupation}</span>
          )}
          <div className={styles.projectIcons}>
            {(() => {
              const userProjects = getUserProjects(userData?.userId);
              const visible = isMobile ? userProjects.slice(0, 3) : userProjects;
              return (
                <>
                  {visible.map((p) => (
                    <ProjectAvatar
                      key={p.projectId}
                      thumb={p.thumbnails && p.thumbnails[0]}
                      name={p.title}
                      className={styles.projectIcon}
                      shape="circle"
                    />
                  ))}
                  {isMobile && userProjects.length > 3 && (
                    <span className={styles.overflowBadge}>
                      +{userProjects.length - 3}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurrentUserProfile;











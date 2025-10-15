import React from 'react';
import { MessageCircle, ListPlus } from 'lucide-react';
import ProjectAvatar from '../../../shared/ui/ProjectAvatar';
import { slugify } from '../../../shared/utils/slug';
import { getFileUrl } from '../../../shared/utils/api';
import styles from './Collaborators.module.css';

interface User {
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  occupation?: string;
  thumbnail?: string;
}

interface CollaboratorListProps {
  users: User[];
  isAdmin: boolean;
  isMobile: boolean;
  isOnline: (uid: string) => boolean;
  getUserProjects: (uid: string) => { projectId: string; thumbnails?: string[]; title?: string }[];
  openModalForUser: (uid: string) => void;
  navigate: (path: string) => void;
  editValues: Record<string, unknown>;
  togglePending: (uid: string) => void;
}

const CollaboratorList: React.FC<CollaboratorListProps> = ({
  users,
  isAdmin,
  isMobile,
  isOnline,
  getUserProjects,
  openModalForUser,
  navigate,
  editValues,
  togglePending,
}) => {
  return (
    <ul className={styles.collabGrid}>
      {users.map((u) => {
        const slug = slugify(`${u.firstName || ''}-${u.lastName || ''}`);
        const online = isOnline(u.userId);
        return (
          <li
            key={u.username || u.userId}
            className={`${styles.collabCard} ${isAdmin ? styles.collabCardClickable : ''}`}
            onClick={isAdmin ? () => openModalForUser(u.userId) : undefined}
          >
            <div className={styles.cardInfo}>
              <div className={styles.cardLeft}>
                {u.thumbnail ? (
                  <img src={getFileUrl(u.thumbnail)} alt={u.firstName} className={styles.avatar} />
                ) : (
                  <div className={styles.avatarPlaceholder} />
                )}
                <span
                  className={`${styles.statusDot} ${online ? styles.online : styles.offline}`}
                />
              </div>
              <div className={styles.infoBlock}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>
                    {u.firstName} {u.lastName}
                  </span>
                </div>
                <div className={styles.metaRow}>
                  {u.role && (
                    <span
                      className={`${styles.roleTag} ${
                        styles[
                          'role' +
                            (u.role || '')
                              .toLowerCase()
                              .replace(/^[a-z]/, (c) => c.toUpperCase())
                        ] || ''
                      }`}
                      title={u.role}
                    >
                      {u.role
                        ? u.role[0].toUpperCase() + u.role.slice(1).toLowerCase()
                        : ''}
                    </span>
                  )}
                  {u.occupation && (
                    <span className={styles.occupationTag}>{u.occupation}</span>
                  )}
                  <div className={styles.projectIcons}>
                    {(() => {
                      const userProjects = getUserProjects(u.userId);
                      const visible = isMobile
                        ? userProjects.slice(0, 3)
                        : userProjects;
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
            <div className={`${styles.cardActions} flex items-center`}>
              <button
                aria-label="Message"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/dashboard/features/messages/${slug}`);
                }}
              >
                <MessageCircle size={18} />
              </button>
              {isAdmin && (
                <>
                  <button
                    aria-label="Assign Task"
                    onClick={(e) => {
                      e.stopPropagation();
                      alert('Assign task');
                    }}
                  >
                    <ListPlus size={18} />
                  </button>
                  <label className="switch" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={(editValues[u.userId] as { pending?: boolean })?.pending || false}
                      onChange={() => togglePending(u.userId)}
                    />
                    <span className="slider" />
                  </label>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default CollaboratorList;











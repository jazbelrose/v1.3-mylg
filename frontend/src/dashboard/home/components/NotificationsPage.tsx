/* eslint-disable */
import React, { useEffect, useState, ChangeEvent } from 'react';
import { useNotifications } from '../../../app/contexts/useNotifications';
import { useNotificationSocket } from '../../../app/contexts/useNotificationSocket';
import { useData } from '@/app/contexts/useData';
import { useLocation } from 'react-router-dom';
import { Check } from 'lucide-react';
import ProjectAvatar from '../../../shared/ui/ProjectAvatar';
import NotificationList, { formatNotification, type Notification } from '../../../shared/ui/NotificationList';
import { Select as AntSelect } from 'antd';

interface NotificationsProps {
  searchQuery?: string;
  showHeader?: boolean;
  showFilters?: boolean;
  onNotificationClick?: (id: string) => void;
  onNavigateToProject?: (projectId: string) => void;
}

const Notifications: React.FC<NotificationsProps> = ({
  searchQuery = '',
  showHeader = true,
  showFilters = true,
  onNotificationClick,
  onNavigateToProject,
}) => {
  const { notifications, removeNotifications } = useNotifications();
  const { emitNotificationRead } = useNotificationSocket();
  const { allUsers, projects } = useData();
  const location = useLocation();

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [selectedProjects, setSelectedProjects] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('notificationProjectFilter') || '[]');
      return Array.isArray(stored) ? stored.filter(p => p !== 'ALL') : [];
      
    } catch {
      return [];
    }
  });

  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('notificationTypeFilter');
      return stored ? JSON.parse(stored) : ['ALL'];
    } catch {
      return ['ALL'];
    }
  });

  useEffect(() => {
    const id = (location.state as { highlightId?: string })?.highlightId;
    if (!id) return;
    const timer = setTimeout(() => setHighlightId(id), 800);
    return () => clearTimeout(timer);
  }, [location.state]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 800);
    return () => clearTimeout(timer);
  }, [highlightId]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      
    }
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('notificationProjectFilter', JSON.stringify(selectedProjects));
  }, [selectedProjects]);

  useEffect(() => {
    localStorage.setItem('notificationTypeFilter', JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedProjects, selectedTypes]);

  const toggleSelectMode = () => {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return set;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map(n => n['timestamp#uuid'] as string)));
    }
  };

  const handleDeleteSelected = () => {
    const ids = Array.from(selectedIds);
    removeNotifications(ids);
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleProjectFilterChange = (values: string[]) => {
    if (!values || values.length === 0 || values.includes('ALL')) {
      setSelectedProjects([]);
    } else {
      setSelectedProjects(values);
    }
  };

  const handleTypeFilterChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map(o => o.value);
    if (values.length === 0 || values.includes('ALL')) {
      setSelectedTypes(['ALL']);
    } else {
      setSelectedTypes(values);
    }
  };

  const notificationTypes = Array.from(new Set(notifications.map((n: any) => n.type).filter(Boolean)));

  const projectOptions = [
    { value: 'ALL', label: 'All Projects', searchLabel: 'All Projects' },
    ...projects.map((p: any) => ({
      value: p.projectId,
      label: (
        <div className="project-option">
          <ProjectAvatar thumb={p.thumbnails?.[0]} name={p.title || 'Untitled'} className="dropdown-avatar" />
          {p.title || 'Untitled'}
        </div>
      ),
      searchLabel: p.title || 'Untitled'
    }))
  ];

  const filteredNotifications = notifications.filter((n) => {
    const projectMatch = selectedProjects.length === 0 || selectedProjects.includes(n.projectId);
    const typeMatch = showFilters ? (selectedTypes.includes('ALL') || selectedTypes.includes(n.type)) : true;
    const search = searchQuery.trim().toLowerCase();
    let searchMatch = true;
    if (search) {
      const sender = allUsers.find((u) => u.userId === n.senderId) || { firstName: '', lastName: '' };
      const project = projects.find((p) => p.projectId === n.projectId);
      const name = project ? project.title || 'Project' : (sender.firstName ? `${sender.firstName} ${sender.lastName ?? ''}` : 'User');
      const message = formatNotification(n.message);
      searchMatch = name.toLowerCase().includes(search) || message.toLowerCase().includes(search);
    }
    return projectMatch && typeMatch && searchMatch;
  });

  return (
    
      <div className="notifications">
        {showHeader && (
          <div className="notifications-header">
            <div className="notifications-title">Notifications</div>
            <div className="notifications-actions">
              {showFilters && (
                <div className="notifications-filter">
                  <label id="project-filter-label" className="notifications-filter-label">
                    Filter by Project
                  </label>
                  <AntSelect
                    aria-labelledby="project-filter-label"
                    className="project-select"
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="searchLabel"
                    filterOption={(input, option) =>
                      (option?.searchLabel ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    placeholder="All Projects"
                    value={selectedProjects}
                    onChange={handleProjectFilterChange}
                    options={projectOptions}
                    classNames={{ popup: { root: 'project-select-dropdown' } }}
                  />
                </div>
              )}
              {selectMode ? (
                <>
                  <button className="delete-selected-btn" disabled={selectedIds.size === 0} onClick={handleDeleteSelected}>
                    Delete Selected
                  </button>
                  {filteredNotifications.length > 0 && (
                    <button className="select-all-btn" onClick={handleSelectAll}>
                      {selectedIds.size === filteredNotifications.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                  <button className="cancel-select-btn" onClick={toggleSelectMode}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {filteredNotifications.some((n: any) => !n.read) && (
                    <button
                      className="mark-all-read-btn"
                      onClick={() =>
                        filteredNotifications.forEach((n: any) => !n.read && emitNotificationRead(n['timestamp#uuid']))
                      }
                    >
                      <Check size={16} />
                    </button>
                  )}
                  {filteredNotifications.length > 0 && (
                    <button className="select-mode-btn" onClick={toggleSelectMode}>
                      Select
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        <div className="notifications-feed">
          {showFilters && notificationTypes.length > 0 && (
            <select multiple value={selectedTypes} onChange={handleTypeFilterChange}>
              <option value="ALL">ALL</option>
              {notificationTypes.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <NotificationList
            notifications={filteredNotifications as Notification[]}
            selectMode={selectMode}
            selectedIds={selectedIds}
            toggleSelected={toggleSelected}
            highlightId={highlightId}
            onNotificationClick={() => onNotificationClick?.("")}
            onNavigateToProject={onNavigateToProject ? async ({ projectId }) => onNavigateToProject(projectId) : undefined}
          />
        </div>
      </div>
   
  );
};

export default Notifications;










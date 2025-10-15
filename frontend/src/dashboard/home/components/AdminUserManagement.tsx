import React, { useState, useEffect } from 'react';
import Modal from '../../../shared/ui/ModalWithStack';
import ConfirmModal from '@/shared/ui/ConfirmModal';
import { uploadData } from 'aws-amplify/storage';
import { useData } from "@/app/contexts/useData";
import type { UserLite } from "@/app/contexts/DataProvider";
import {
  updateUserProfile,
  fetchUserProfilesBatch,
  updateUserRole,
  POST_PROJECT_TO_USER_URL,
  apiFetch,
  UserProfile,
} from '../../../shared/utils/api';
import { resolveStoredFileUrl } from '../../../shared/utils/media';
import UserProfilePicture from '../../../shared/ui/UserProfilePicture';
import ProjectAvatar from '../../../shared/ui/ProjectAvatar';
import './AdminUserManagement.css';

if (typeof document !== 'undefined') {
  Modal.setAppElement('#root');
}

/** ——— Types (minimal, based on usage) ——— */
type RoleValue = 'admin' | 'designer' | 'builder' | 'vendor' | 'client';

interface ProjectLite {
  projectId: string;
  title?: string;
  thumbnails?: string[];
  team?: { userId: string }[];
}

type EditValuesMap = Record<
  string,
  {
    email: string;
    firstName: string;
    lastName: string;
    role: string; // stored as lowercase
    pending: boolean;
    phoneNumber: string;
    company: string;
    occupation: string;
    thumbnail: string;
    collaborators: string; // CSV in the form
    projects: string; // CSV in the form
  }
>;

type IDMap = Record<string, string[]>; // userId -> array of IDs (projects or collaborators)
type PreviewMap = Record<string, string | undefined>; // userId -> objectUrl

/** ——— Role options ——— */
const ROLES: { label: string; value: RoleValue }[] = [
  { label: 'Admin', value: 'admin' },
  { label: 'Designer', value: 'designer' },
  { label: 'Builder', value: 'builder' },
  { label: 'Vendor', value: 'vendor' },
  { label: 'Client', value: 'client' },
];

export default function AdminUserManagement() {
  const {
    allUsers,
    refreshUsers,
    isAdmin,
    projects,
    fetchProjects,
  }: {
    allUsers: UserLite[];
    refreshUsers: () => Promise<unknown> | void;
    isAdmin: boolean;
    projects: ProjectLite[];
    fetchProjects: () => Promise<unknown> | void;
  } = useData();

  const [editValues, setEditValues] = useState<EditValuesMap>({});
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<PreviewMap>({});
  const [assignedProjects, setAssignedProjects] = useState<IDMap>({});
  const [assignedCollaborators, setAssignedCollaborators] = useState<IDMap>({});
  const [projectFilter, setProjectFilter] = useState('');
  const [collabFilter, setCollabFilter] = useState('');
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);

  const selectedUser = selectedUserId
    ? allUsers.find((u) => u.userId === selectedUserId)
    : null;

  const openModalForUser = (userId: string) => {
    const ids = projects
      .filter((p) => Array.isArray(p.team) && p.team.some((m) => m.userId === userId))
      .map((p) => p.projectId);
    setAssignedProjects((prev) => ({ ...prev, [userId]: ids }));

    const user = allUsers.find((u) => u.userId === userId);
    const collabs = Array.isArray(user?.collaborators) ? user!.collaborators! : [];
    setAssignedCollaborators((prev) => ({ ...prev, [userId]: collabs }));

    setProjectFilter('');
    setCollabFilter('');
    setSelectedUserId(userId);
  };

  const closeModal = () => setSelectedUserId(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    if (selectedUserId) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedUserId]);

  useEffect(() => {
    const values: EditValuesMap = {};
    allUsers.forEach((u) => {
      values[u.userId] = {
        email: u.email || '',
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        role: (u.role || '').toLowerCase(),
        pending: typeof u.pending === 'boolean' ? u.pending : false,
        phoneNumber: u.phoneNumber || '',
        company: u.company || '',
        occupation: u.occupation || '',
        thumbnail: u.thumbnail || '',
        collaborators: Array.isArray(u.collaborators) ? u.collaborators.join(',') : '',
        projects: Array.isArray(u.projects) ? u.projects.join(',') : '',
      };
    });
    setEditValues(values);
  }, [allUsers]);

  useEffect(() => {
    return () => {
      Object.values(localPreviews).forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [localPreviews]);

  if (!isAdmin) {
    return <div>Access Denied</div>;
  }

  const handleChange = (userId: string, field: keyof EditValuesMap[string], value: string | boolean) => {
    const normalized = field === 'role' && typeof value === 'string' ? value.toLowerCase() : value;
    setEditValues((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: normalized as string | boolean },
    }));
  };

  const toggleProjectSelection = (userId: string, projectId: string) => {
    setAssignedProjects((prev) => {
      const current = new Set(prev[userId] || []);
      if (current.has(projectId)) {
        current.delete(projectId);
      } else {
        current.add(projectId);
      }
      return { ...prev, [userId]: Array.from(current) };
    });
  };

  const toggleCollaboratorSelection = (userId: string, collaboratorId: string) => {
    setAssignedCollaborators((prev) => {
      const current = new Set(prev[userId] || []);
      if (current.has(collaboratorId)) {
        current.delete(collaboratorId);
      } else {
        current.add(collaboratorId);
      }
      return { ...prev, [userId]: Array.from(current) };
    });
  };

  const handleFileUpload = async (userId: string, file: File) => {
    const filename = `userData-thumbnails/${userId}/${file.name}`;
    const result = await (uploadData as (params: { key: string; data: File; options: { accessLevel: string } }) => Promise<unknown>)({
      key: filename,
      data: file,
      options: { accessLevel: 'guest' },
    });
    console.log('Thumbnail uploaded:', result);
    return filename;
  };

  const handleThumbnailChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    if (!selectedUserId) return;
    const userId = selectedUserId;
    const file = e.target.files?.[0];
    if (!file) return;

    const previewURL = URL.createObjectURL(file);
    setLocalPreviews((p) => {
      const prevUrl = p[userId];
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return { ...p, [userId]: previewURL };
    });

    try {
      const uploadedKey = await handleFileUpload(userId, file);
      handleChange(userId, 'thumbnail', `${uploadedKey}?t=${Date.now()}`);
    } catch (err) {
      console.error('Failed to upload thumbnail', err);
      alert('Failed to upload thumbnail');
    }
  };

  const handleSaveClick = () => setIsSaveConfirmOpen(true);
  const confirmSaveChanges = () => {
    setIsSaveConfirmOpen(false);
    if (selectedUserId) saveChanges(selectedUserId);
  };

  const saveChanges = async (userId: string) => {
    const vals = editValues[userId];
    if (!vals) return;

    const collaboratorIds =
      assignedCollaborators[userId] ||
      (vals.collaborators
        ? vals.collaborators.split(',').map((s) => s.trim()).filter(Boolean)
        : []);

    const payload = {
      userId,
      ...vals,
      thumbnail: vals.thumbnail ? vals.thumbnail.split('?')[0] : '',
      collaborators: collaboratorIds,
    };

    const originalIds = projects
      .filter((p) => Array.isArray(p.team) && p.team.some((m) => m.userId === userId))
      .map((p) => p.projectId);
    const newIds = assignedProjects[userId] || [];
    const toAdd = newIds.filter((id) => !originalIds.includes(id));
    const toRemove = originalIds.filter((id) => !newIds.includes(id));

    setLoadingUserId(userId);
    try {
      await updateUserProfile(payload as UserProfile);
      if (toAdd.length || toRemove.length) {
        await Promise.all([
          ...toAdd.map((projectId) =>
            apiFetch(`${POST_PROJECT_TO_USER_URL}?userId=${userId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newProjectId: projectId }),
            })
          ),
          ...toRemove.map((projectId) =>
            apiFetch(
              `${POST_PROJECT_TO_USER_URL}?userId=${userId}&projectId=${projectId}`,
              {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
              }
            )
          ),
        ]);
      }
      await refreshUsers();
      await fetchProjects();
      setEditValues((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          projects: newIds.join(','),
          collaborators: collaboratorIds.join(','),
        },
      }));
    } catch (err) {
      console.error('Failed to update user', err);
      alert('Failed to update user');
    } finally {
      setLoadingUserId(null);
      setSelectedUserId(null);
    }
  };

  const togglePending = async (userId: string) => {
    setLoadingUserId(userId);
    try {
      const [profile] = await fetchUserProfilesBatch([userId]);
      if (!profile) throw new Error('User not found');
      const newVal = !profile.pending;
      await updateUserProfile({ ...profile, pending: newVal });
      setEditValues((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], pending: newVal },
      }));
      await refreshUsers();
    } catch (err) {
      console.error('Failed to update pending flag', err);
      alert('Failed to update user');
    } finally {
      setLoadingUserId(null);
    }
  };

  const changeRole = async (userId: string, role: string) => {
    setLoadingUserId(userId);
    try {
      const updated = await updateUserRole(userId, role as RoleValue);
      setEditValues((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], role: updated.role || role },
      }));
      await refreshUsers();
    } catch (err) {
      console.error('Failed to update user role', err);
      alert('Failed to update user role');
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <div className="admin-users-container">
      <table className="admin-users-table">
        <thead>
          <tr>
            <th className="sortable">Email</th>
            <th className="sortable">First</th>
            <th className="sortable">Last</th>
            <th className="sortable">Role</th>
            <th className="sortable">Phone</th>
            <th className="sortable">Company</th>
            <th className="sortable">Pending</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {allUsers.map((u) => (
            <tr key={u.userId}>
              <td>{u.email}</td>
              <td>{u.firstName}</td>
              <td>{u.lastName}</td>
              <td>
                <select
                  value={editValues[u.userId]?.role || ''}
                  onChange={(e) => changeRole(u.userId, e.target.value)}
                  disabled={loadingUserId === u.userId}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>{u.phoneNumber}</td>
              <td>{u.company}</td>
              <td>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={editValues[u.userId]?.pending || false}
                    onChange={() => togglePending(u.userId)}
                  />
                  <span className="slider" />
                </label>
              </td>
              <td>
                <button className="edit-button" onClick={() => openModalForUser(u.userId)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal
        isOpen={!!selectedUserId}
        onRequestClose={closeModal}
        contentLabel="Edit User"
        className="admin-modal-content"
        overlayClassName="admin-modal-overlay"
      >
        {selectedUserId && (
          <div className="admin-modal-form">
            <UserProfilePicture
              thumbnail={editValues[selectedUserId]?.thumbnail || ''}
              thumbnailUrl={selectedUser?.thumbnailUrl || undefined}
              localPreview={localPreviews[selectedUserId]}
              onChange={handleThumbnailChange}
            />

            <div className="form-row">
              <label htmlFor={`email-${selectedUserId}`} className="admin-form-label">
                Email
              </label>
              <input
                id={`email-${selectedUserId}`}
                className="admin-form-input"
                value={editValues[selectedUserId]?.email || ''}
                onChange={(e) => handleChange(selectedUserId, 'email', e.target.value)}
              />
            </div>

            <div className="form-row">
              <label htmlFor={`first-${selectedUserId}`} className="admin-form-label">
                First Name
              </label>
              <input
                id={`first-${selectedUserId}`}
                className="admin-form-input"
                value={editValues[selectedUserId]?.firstName || ''}
                onChange={(e) => handleChange(selectedUserId, 'firstName', e.target.value)}
              />
            </div>

            <div className="form-row">
              <label htmlFor={`last-${selectedUserId}`} className="admin-form-label">
                Last Name
              </label>
              <input
                id={`last-${selectedUserId}`}
                className="admin-form-input"
                value={editValues[selectedUserId]?.lastName || ''}
                onChange={(e) => handleChange(selectedUserId, 'lastName', e.target.value)}
              />
            </div>

            <div className="form-row">
              <label htmlFor={`phone-${selectedUserId}`} className="admin-form-label">
                Phone
              </label>
              <input
                id={`phone-${selectedUserId}`}
                className="admin-form-input"
                value={editValues[selectedUserId]?.phoneNumber || ''}
                onChange={(e) => handleChange(selectedUserId, 'phoneNumber', e.target.value)}
              />
            </div>

            <div className="form-row">
              <label htmlFor={`company-${selectedUserId}`} className="admin-form-label">
                Company
              </label>
              <input
                id={`company-${selectedUserId}`}
                className="admin-form-input"
                value={editValues[selectedUserId]?.company || ''}
                onChange={(e) => handleChange(selectedUserId, 'company', e.target.value)}
              />
            </div>

            <div className="form-row">
              <label htmlFor={`occupation-${selectedUserId}`} className="admin-form-label">
                Occupation
              </label>
              <input
                id={`occupation-${selectedUserId}`}
                className="admin-form-input"
                value={editValues[selectedUserId]?.occupation || ''}
                onChange={(e) => handleChange(selectedUserId, 'occupation', e.target.value)}
              />
            </div>

            <div className="assigned-collaborators-section">
              <label className="admin-form-label">Collaborators</label>
              {allUsers.length > 10 && (
                <input
                  type="text"
                  placeholder="Search users..."
                  className="admin-form-input"
                  value={collabFilter}
                  onChange={(e) => setCollabFilter(e.target.value)}
                />
              )}
              <div className="assigned-collaborators-grid">
                {allUsers
                  .filter((u) => u.userId !== selectedUserId)
                  .filter((u) => {
                    const search = collabFilter.toLowerCase();
                    if (!search) return true;
                    return (
                      (u.firstName || '').toLowerCase().includes(search) ||
                      (u.lastName || '').toLowerCase().includes(search) ||
                      (u.email || '').toLowerCase().includes(search) ||
                      (u.username || '').toLowerCase().includes(search)
                    );
                  })
                  .map((u) => {
                    const checked = (assignedCollaborators[selectedUserId] || []).includes(u.userId);
                    return (
                      <label className="collaborator-option" key={u.userId}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCollaboratorSelection(selectedUserId, u.userId)}
                        />
                        {u.thumbnail || u.thumbnailUrl ? (
                          <img
                            src={resolveStoredFileUrl(u.thumbnail, u.thumbnailUrl as string | undefined)}
                            alt=""
                            className="collaborator-thumb"
                          />
                        ) : (
                          <div className="collaborator-thumb" />
                        )}
                        <span className="collaborator-name">
                          {u.firstName} {u.lastName}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            {isAdmin && (
              <div className="assigned-projects-section">
                <label className="admin-form-label">Assigned Projects</label>
                {projects.length > 10 && (
                  <input
                    type="text"
                    placeholder="Search projects..."
                    className="admin-form-input"
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                  />
                )}
                <div className="assigned-projects-grid">
                  {projects
                    .filter((p) => p.title.toLowerCase().includes(projectFilter.toLowerCase()))
                    .map((p) => {
                      const checked = (assignedProjects[selectedUserId] || []).includes(p.projectId);
                      return (
                        <label className="project-option" key={p.projectId}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProjectSelection(selectedUserId, p.projectId)}
                          />
                          <ProjectAvatar
                            thumb={p.thumbnails && p.thumbnails[0]}
                            name={p.title}
                            className="project-thumb"
                          />
                          <span className="project-name">{p.title}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="modal-button secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="modal-button primary"
                onClick={handleSaveClick}
                disabled={loadingUserId === selectedUserId}
              >
                {loadingUserId === selectedUserId ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={isSaveConfirmOpen}
        onRequestClose={() => setIsSaveConfirmOpen(false)}
        onConfirm={confirmSaveChanges}
        message="Save changes to this user?"
        confirmLabel="Save"
        cancelLabel="Cancel"
        className="admin-modal-content"
        overlayClassName="admin-modal-overlay"
      />
    </div>
  );
}










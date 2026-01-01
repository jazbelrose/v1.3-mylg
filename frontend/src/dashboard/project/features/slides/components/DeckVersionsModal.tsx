// DeckVersionsModal.tsx - Modal for managing slide deck versions
import React, { useState, useCallback } from "react";
import {
  X,
  Plus,
  Star,
  Users,
  Trash2,
  Copy,
  Edit3,
  Check,
  MoreVertical,
} from "lucide-react";
import { DeckVersion, DeckVersionStatus, Role } from "@/app/contexts/DataProvider";
import { ConfirmModal } from "@/shared/ui";
import "./DeckVersionsModal.css";

export interface DeckVersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: DeckVersion[];
  activeVersionId: string | null;
  onCreateVersion: (options: CreateVersionOptions) => Promise<DeckVersion | null>;
  onUpdateVersion: (
    versionId: string,
    updates: UpdateVersionOptions
  ) => Promise<DeckVersion | null>;
  onDeleteVersion: (versionId: string) => Promise<boolean>;
  onSetDefault: (versionId: string) => Promise<boolean>;
  onSetClientDefault: (versionId: string) => Promise<boolean>;
  onDuplicateVersion: (versionId: string, name?: string) => Promise<DeckVersion | null>;
  onSwitchVersion: (versionId: string) => void;
  /** Accent color derived from project color (hex format, e.g., "#FA3356") */
  accentColor?: string;
}

interface CreateVersionOptions {
  name: string;
  status?: DeckVersionStatus;
  notes?: string;
  allowedRoles?: Role[];
  duplicateFromVersionId?: string;
}

interface UpdateVersionOptions {
  name?: string;
  status?: DeckVersionStatus;
  notes?: string;
  allowedRoles?: Role[];
}

type EditingVersion = {
  versionId: string;
  name: string;
  status: DeckVersionStatus;
  notes: string;
  allowedRoles: Role[];
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "designer", label: "Designer" },
  { value: "builder", label: "Builder" },
  { value: "vendor", label: "Vendor" },
  { value: "client", label: "Client" },
];

export const DeckVersionsModal: React.FC<DeckVersionsModalProps> = ({
  isOpen,
  onClose,
  versions,
  activeVersionId,
  onCreateVersion,
  onUpdateVersion,
  onDeleteVersion,
  onSetDefault,
  onSetClientDefault,
  onDuplicateVersion,
  onSwitchVersion,
  accentColor,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingVersion, setEditingVersion] = useState<EditingVersion | null>(null);
  const [newVersionName, setNewVersionName] = useState("");
  const [newVersionStatus, setNewVersionStatus] = useState<DeckVersionStatus>("draft");
  const [newVersionNotes, setNewVersionNotes] = useState("");
  const [newVersionRoles, setNewVersionRoles] = useState<Role[]>([]);
  const [duplicateFromId, setDuplicateFromId] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Helper to convert hex to RGB string
  const hexToRgb = useCallback((hex: string): string => {
    const cleaned = hex.replace("#", "");
    const bigint = parseInt(cleaned, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  }, []);

  // Compute accent color CSS variable style
  const accentStyle = accentColor
    ? ({ "--version-accent": accentColor, "--version-accent-rgb": hexToRgb(accentColor) } as React.CSSProperties)
    : undefined;

  const resetNewVersionForm = useCallback(() => {
    setNewVersionName("");
    setNewVersionStatus("draft");
    setNewVersionNotes("");
    setNewVersionRoles([]);
    setDuplicateFromId("");
    setIsCreating(false);
  }, []);

  const handleCreateVersion = useCallback(async () => {
    if (!newVersionName.trim()) return;

    setIsSaving(true);
    try {
      const result = await onCreateVersion({
        name: newVersionName.trim(),
        status: newVersionStatus,
        notes: newVersionNotes,
        allowedRoles: newVersionRoles,
        duplicateFromVersionId: duplicateFromId || undefined,
      });

      if (result) {
        resetNewVersionForm();
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    newVersionName,
    newVersionStatus,
    newVersionNotes,
    newVersionRoles,
    duplicateFromId,
    onCreateVersion,
    resetNewVersionForm,
  ]);

  const handleStartEditing = useCallback((version: DeckVersion) => {
    setEditingVersion({
      versionId: version.versionId,
      name: version.name,
      status: version.status,
      notes: version.notes || "",
      allowedRoles: version.allowedRoles || [],
    });
    setOpenMenuId(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingVersion) return;

    setIsSaving(true);
    try {
      await onUpdateVersion(editingVersion.versionId, {
        name: editingVersion.name.trim(),
        status: editingVersion.status,
        notes: editingVersion.notes,
        allowedRoles: editingVersion.allowedRoles,
      });
      setEditingVersion(null);
    } finally {
      setIsSaving(false);
    }
  }, [editingVersion, onUpdateVersion]);

  const handleDeleteVersion = useCallback(async () => {
    if (!deleteConfirmId) return;

    const success = await onDeleteVersion(deleteConfirmId);
    if (success) {
      setDeleteConfirmId(null);
    }
  }, [deleteConfirmId, onDeleteVersion]);

  const handleDuplicate = useCallback(
    async (versionId: string) => {
      const version = versions.find((v) => v.versionId === versionId);
      if (!version) return;

      setOpenMenuId(null);
      await onDuplicateVersion(versionId, `${version.name} (Copy)`);
    },
    [versions, onDuplicateVersion]
  );

  const toggleRole = useCallback((role: Role, isEditing: boolean) => {
    if (isEditing) {
      setEditingVersion((prev) => {
        if (!prev) return prev;
        const hasRole = prev.allowedRoles.includes(role);
        return {
          ...prev,
          allowedRoles: hasRole
            ? prev.allowedRoles.filter((r) => r !== role)
            : [...prev.allowedRoles, role],
        };
      });
    } else {
      setNewVersionRoles((prev) =>
        prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
      );
    }
  }, []);

  const getStatusLabel = (status: DeckVersionStatus) => {
    switch (status) {
      case "approved":
        return "Approved";
      case "archived":
        return "Archived";
      default:
        return "Draft";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="deck-versions-modal-overlay" onClick={onClose}>
      <div
        className="deck-versions-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-versions-modal-title"
        style={accentStyle}
      >
        <div className="deck-versions-modal__header">
          <h2 id="deck-versions-modal-title">Manage Versions</h2>
          <button
            type="button"
            className="deck-versions-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="deck-versions-modal__content">
          {/* Version list */}
          <div className="deck-versions-modal__list">
            {versions.map((version) => {
              const isEditing = editingVersion?.versionId === version.versionId;
              const isActive = version.versionId === activeVersionId;
              const canDelete = !version.isDefault && versions.length > 1;

              return (
                <div
                  key={version.versionId}
                  className={`deck-versions-modal__version ${isActive ? "deck-versions-modal__version--active" : ""}`}
                >
                  {isEditing ? (
                    <div className="deck-versions-modal__edit-form">
                      <input
                        type="text"
                        className="deck-versions-modal__input"
                        value={editingVersion.name}
                        onChange={(e) =>
                          setEditingVersion((prev) =>
                            prev ? { ...prev, name: e.target.value } : prev
                          )
                        }
                        placeholder="Version name"
                        autoFocus
                      />
                      <select
                        className="deck-versions-modal__select"
                        value={editingVersion.status}
                        onChange={(e) =>
                          setEditingVersion((prev) =>
                            prev
                              ? { ...prev, status: e.target.value as DeckVersionStatus }
                              : prev
                          )
                        }
                      >
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="archived">Archived</option>
                      </select>
                      <textarea
                        className="deck-versions-modal__textarea"
                        value={editingVersion.notes}
                        onChange={(e) =>
                          setEditingVersion((prev) =>
                            prev ? { ...prev, notes: e.target.value } : prev
                          )
                        }
                        placeholder="Notes (optional)"
                        rows={2}
                      />
                      <div className="deck-versions-modal__roles">
                        <label className="deck-versions-modal__roles-label">
                          Visible to:
                        </label>
                        <div className="deck-versions-modal__role-chips">
                          {ROLE_OPTIONS.map((role) => (
                            <button
                              key={role.value}
                              type="button"
                              className={`deck-versions-modal__role-chip ${
                                editingVersion.allowedRoles.includes(role.value)
                                  ? "deck-versions-modal__role-chip--selected"
                                  : ""
                              }`}
                              onClick={() => toggleRole(role.value, true)}
                            >
                              {role.label}
                              {editingVersion.allowedRoles.includes(role.value) && (
                                <Check size={12} />
                              )}
                            </button>
                          ))}
                        </div>
                        <span className="deck-versions-modal__roles-hint">
                          {editingVersion.allowedRoles.length === 0
                            ? "All roles can view"
                            : `Only ${editingVersion.allowedRoles.join(", ")} can view`}
                        </span>
                      </div>
                      <div className="deck-versions-modal__edit-actions">
                        <button
                          type="button"
                          className="deck-versions-modal__btn deck-versions-modal__btn--secondary"
                          onClick={() => setEditingVersion(null)}
                          disabled={isSaving}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="deck-versions-modal__btn deck-versions-modal__btn--primary"
                          onClick={handleSaveEdit}
                          disabled={isSaving || !editingVersion.name.trim()}
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className="deck-versions-modal__version-info"
                        onClick={() => onSwitchVersion(version.versionId)}
                      >
                        <div className="deck-versions-modal__version-header">
                          <span className="deck-versions-modal__version-name">
                            {version.name}
                          </span>
                          <div className="deck-versions-modal__version-badges">
                            {version.isDefault && (
                              <span
                                className="deck-versions-modal__badge deck-versions-modal__badge--default"
                                title="Default version"
                              >
                                <Star size={10} fill="currentColor" />
                                Default
                              </span>
                            )}
                            {version.isClientDefault && (
                              <span
                                className="deck-versions-modal__badge deck-versions-modal__badge--client"
                                title="Client default version"
                              >
                                <Users size={10} />
                                Client
                              </span>
                            )}
                            <span
                              className={`deck-versions-modal__badge deck-versions-modal__badge--${version.status}`}
                            >
                              {getStatusLabel(version.status)}
                            </span>
                          </div>
                        </div>
                        {version.notes && (
                          <p className="deck-versions-modal__version-notes">
                            {version.notes}
                          </p>
                        )}
                        <div className="deck-versions-modal__version-meta">
                          <span>
                            {version.slides?.length || 0} slide
                            {(version.slides?.length || 0) !== 1 ? "s" : ""}
                          </span>
                          <span>
                            Created{" "}
                            {new Date(version.createdAt).toLocaleDateString()}
                          </span>
                          {version.createdByName && (
                            <span>by {version.createdByName}</span>
                          )}
                        </div>
                      </div>

                      <div className="deck-versions-modal__version-actions">
                        <button
                          type="button"
                          className="deck-versions-modal__action-btn"
                          onClick={() => setOpenMenuId(
                            openMenuId === version.versionId ? null : version.versionId
                          )}
                          aria-label="More actions"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {openMenuId === version.versionId && (
                          <div className="deck-versions-modal__action-menu">
                            <button
                              type="button"
                              onClick={() => handleStartEditing(version)}
                            >
                              <Edit3 size={14} />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicate(version.versionId)}
                            >
                              <Copy size={14} />
                              Duplicate
                            </button>
                            {!version.isDefault && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSetDefault(version.versionId);
                                  setOpenMenuId(null);
                                }}
                              >
                                <Star size={14} />
                                Set as Default
                              </button>
                            )}
                            {!version.isClientDefault && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSetClientDefault(version.versionId);
                                  setOpenMenuId(null);
                                }}
                              >
                                <Users size={14} />
                                Set as Client Default
                              </button>
                            )}
                            {canDelete && (
                              <>
                                <div className="deck-versions-modal__menu-divider" />
                                <button
                                  type="button"
                                  className="deck-versions-modal__action-delete"
                                  onClick={() => {
                                    setDeleteConfirmId(version.versionId);
                                    setOpenMenuId(null);
                                  }}
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create new version form */}
          {isCreating ? (
            <div className="deck-versions-modal__create-form">
              <h3>Create New Version</h3>
              <input
                type="text"
                className="deck-versions-modal__input"
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                placeholder="Version name"
                autoFocus
              />
              <div className="deck-versions-modal__form-row">
                <div className="deck-versions-modal__form-group">
                  <label>Status</label>
                  <select
                    className="deck-versions-modal__select"
                    value={newVersionStatus}
                    onChange={(e) =>
                      setNewVersionStatus(e.target.value as DeckVersionStatus)
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="approved">Approved</option>
                  </select>
                </div>
                <div className="deck-versions-modal__form-group">
                  <label>Duplicate from</label>
                  <select
                    className="deck-versions-modal__select"
                    value={duplicateFromId}
                    onChange={(e) => setDuplicateFromId(e.target.value)}
                  >
                    <option value="">Start empty</option>
                    {versions.map((v) => (
                      <option key={v.versionId} value={v.versionId}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <textarea
                className="deck-versions-modal__textarea"
                value={newVersionNotes}
                onChange={(e) => setNewVersionNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
              />
              <div className="deck-versions-modal__roles">
                <label className="deck-versions-modal__roles-label">
                  Visible to:
                </label>
                <div className="deck-versions-modal__role-chips">
                  {ROLE_OPTIONS.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      className={`deck-versions-modal__role-chip ${
                        newVersionRoles.includes(role.value)
                          ? "deck-versions-modal__role-chip--selected"
                          : ""
                      }`}
                      onClick={() => toggleRole(role.value, false)}
                    >
                      {role.label}
                      {newVersionRoles.includes(role.value) && <Check size={12} />}
                    </button>
                  ))}
                </div>
                <span className="deck-versions-modal__roles-hint">
                  {newVersionRoles.length === 0
                    ? "All roles can view"
                    : `Only ${newVersionRoles.join(", ")} can view`}
                </span>
              </div>
              <div className="deck-versions-modal__form-actions">
                <button
                  type="button"
                  className="deck-versions-modal__btn deck-versions-modal__btn--secondary"
                  onClick={resetNewVersionForm}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="deck-versions-modal__btn deck-versions-modal__btn--primary"
                  onClick={handleCreateVersion}
                  disabled={isSaving || !newVersionName.trim()}
                >
                  {isSaving ? "Creating..." : "Create Version"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="deck-versions-modal__add-btn"
              onClick={() => setIsCreating(true)}
            >
              <Plus size={16} />
              Create New Version
            </button>
          )}
        </div>

        <div className="deck-versions-modal__footer">
          <button
            type="button"
            className="deck-versions-modal__btn deck-versions-modal__btn--primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onRequestClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDeleteVersion}
        message="Delete this version? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
};

export default DeckVersionsModal;

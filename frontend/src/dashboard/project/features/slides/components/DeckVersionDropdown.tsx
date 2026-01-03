// DeckVersionDropdown.tsx - Version selector dropdown for slides toolbar
import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { ChevronDown, Plus, Settings, Check, Star, Users, Copy, Trash2, Edit2, UserCheck, StarIcon } from "lucide-react";
import { DeckVersion } from "@/app/contexts/DataProvider";
import "./DeckVersionDropdown.css";

export interface DeckVersionDropdownProps {
  versions: DeckVersion[];
  activeVersion: DeckVersion | null;
  onVersionSelect: (versionId: string) => void;
  onCreateVersion: () => void;
  onManageVersions: () => void;
  canManageVersions: boolean;
  disabled?: boolean;
  /** Accent color derived from project color (hex format, e.g., "#FA3356") */
  accentColor?: string;
  /** Quick action callbacks for context menu */
  onDuplicateVersion?: (versionId: string) => void;
  onDeleteVersion?: (versionId: string) => void;
  onSetDefault?: (versionId: string) => void;
  onSetClientDefault?: (versionId: string) => void;
  onRenameVersion?: (version: DeckVersion) => void;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  version: DeckVersion | null;
}

export const DeckVersionDropdown: React.FC<DeckVersionDropdownProps> = ({
  versions,
  activeVersion,
  onVersionSelect,
  onCreateVersion,
  onManageVersions,
  canManageVersions,
  disabled = false,
  accentColor,
  onDuplicateVersion,
  onDeleteVersion,
  onSetDefault,
  onSetClientDefault,
  onRenameVersion,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    version: null,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Compute accent color CSS variable style
  const accentStyle = accentColor
    ? ({ "--version-accent": accentColor, "--version-accent-rgb": hexToRgb(accentColor) } as React.CSSProperties)
    : undefined;

  // Helper to convert hex to RGB string
  function hexToRgb(hex: string): string {
    const cleaned = hex.replace("#", "");
    const bigint = parseInt(cleaned, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Close dropdown if clicking outside
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        // Don't close if clicking inside context menu
        if (contextMenuRef.current && contextMenuRef.current.contains(target)) {
          return;
        }
        setIsOpen(false);
      }
      
      // Close context menu if clicking outside (context menu is portaled to body)
      if (contextMenu.isOpen && contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu((prev) => ({ ...prev, isOpen: false }));
      }
    };

    if (isOpen || contextMenu.isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, contextMenu.isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setContextMenu((prev) => ({ ...prev, isOpen: false }));
      }
    };

    if (isOpen || contextMenu.isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, contextMenu.isOpen]);

  const handleVersionClick = useCallback(
    (versionId: string) => {
      onVersionSelect(versionId);
      setIsOpen(false);
    },
    [onVersionSelect]
  );

  const handleCreateClick = useCallback(() => {
    onCreateVersion();
    setIsOpen(false);
  }, [onCreateVersion]);

  const handleManageClick = useCallback(() => {
    onManageVersions();
    setIsOpen(false);
  }, [onManageVersions]);

  // Context menu handlers
  const handleContextMenu = useCallback(
    (event: React.MouseEvent, version: DeckVersion) => {
      if (!canManageVersions) return;
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        isOpen: true,
        x: event.clientX,
        y: event.clientY,
        version,
      });
    },
    [canManageVersions]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleContextAction = useCallback(
    (action: () => void) => {
      action();
      closeContextMenu();
      setIsOpen(false);
    },
    [closeContextMenu]
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <span className="version-badge version-badge--approved">Approved</span>;
      case "archived":
        return <span className="version-badge version-badge--archived">Archived</span>;
      default:
        return <span className="version-badge version-badge--draft">Draft</span>;
    }
  };

  // Don't show dropdown if only one version and can't manage
  if (versions.length <= 1 && !canManageVersions) {
    return null;
  }

  return (
    <div className="deck-version-dropdown" ref={dropdownRef} style={accentStyle}>
      <button
        type="button"
        className={`deck-version-dropdown__trigger ${isOpen ? "deck-version-dropdown__trigger--open" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="deck-version-dropdown__label">
          {activeVersion?.name || "Select Version"}
        </span>
        <ChevronDown className="deck-version-dropdown__chevron" size={14} />
      </button>

      {isOpen && (
        <div className="deck-version-dropdown__menu" role="listbox">
          <div className="deck-version-dropdown__list">
            {versions.map((version) => (
              <button
                key={version.versionId}
                type="button"
                className={`deck-version-dropdown__item ${
                  version.versionId === activeVersion?.versionId
                    ? "deck-version-dropdown__item--active"
                    : ""
                }`}
                onClick={() => handleVersionClick(version.versionId)}
                onContextMenu={(e) => handleContextMenu(e, version)}
                role="option"
                aria-selected={version.versionId === activeVersion?.versionId}
                title={canManageVersions ? "Right-click for quick actions" : undefined}
              >
                <div className="deck-version-dropdown__item-content">
                  <div className="deck-version-dropdown__item-name">
                    {version.name}
                    {version.isDefault && (
                      <Star
                        className="deck-version-dropdown__default-icon"
                        size={12}
                        fill="currentColor"
                      />
                    )}
                    {version.isClientDefault && (
                      <Users
                        className="deck-version-dropdown__client-icon"
                        size={12}
                      />
                    )}
                  </div>
                  {getStatusBadge(version.status)}
                </div>
                {version.versionId === activeVersion?.versionId && (
                  <Check className="deck-version-dropdown__check" size={14} />
                )}
              </button>
            ))}
          </div>

          {canManageVersions && (
            <>
              <div className="deck-version-dropdown__divider" />
              <div className="deck-version-dropdown__actions">
                <button
                  type="button"
                  className="deck-version-dropdown__action"
                  onClick={handleCreateClick}
                >
                  <Plus size={14} />
                  <span>New Version</span>
                </button>
                <button
                  type="button"
                  className="deck-version-dropdown__action"
                  onClick={handleManageClick}
                >
                  <Settings size={14} />
                  <span>Manage Versions…</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Context Menu - portaled to body for proper z-index stacking */}
      {contextMenu.isOpen && contextMenu.version && canManageVersions &&
        ReactDOM.createPortal(
          <div
            ref={contextMenuRef}
            className="deck-version-dropdown__context-menu"
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
            }}
          >
            {onRenameVersion && (
              <button
                type="button"
                className="deck-version-dropdown__context-item"
                onClick={() =>
                  handleContextAction(() => onRenameVersion(contextMenu.version!))
                }
              >
                <Edit2 size={14} />
                <span>Rename</span>
              </button>
            )}
            {onDuplicateVersion && (
              <button
                type="button"
                className="deck-version-dropdown__context-item"
                onClick={() =>
                  handleContextAction(() =>
                    onDuplicateVersion(contextMenu.version!.versionId)
                  )
                }
              >
                <Copy size={14} />
                <span>Duplicate</span>
              </button>
            )}
            {onSetDefault && !contextMenu.version.isDefault && (
              <button
                type="button"
                className="deck-version-dropdown__context-item"
                onClick={() =>
                  handleContextAction(() =>
                    onSetDefault(contextMenu.version!.versionId)
                  )
                }
              >
                <StarIcon size={14} />
                <span>Set as Default</span>
              </button>
            )}
            {onSetClientDefault && !contextMenu.version.isClientDefault && (
              <button
                type="button"
                className="deck-version-dropdown__context-item"
                onClick={() =>
                  handleContextAction(() =>
                    onSetClientDefault(contextMenu.version!.versionId)
                  )
                }
              >
                <UserCheck size={14} />
                <span>Set as Client Default</span>
              </button>
            )}
            {onDeleteVersion && versions.length > 1 && (
              <>
                <div className="deck-version-dropdown__context-divider" />
                <button
                  type="button"
                  className="deck-version-dropdown__context-item deck-version-dropdown__context-item--danger"
                  onClick={() =>
                    handleContextAction(() =>
                      onDeleteVersion(contextMenu.version!.versionId)
                    )
                  }
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default DeckVersionDropdown;

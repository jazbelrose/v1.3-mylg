// DeckVersionDropdown.tsx - Version selector dropdown for slides toolbar
import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Plus, Settings, Check, Star, Users } from "lucide-react";
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
}

export const DeckVersionDropdown: React.FC<DeckVersionDropdownProps> = ({
  versions,
  activeVersion,
  onVersionSelect,
  onCreateVersion,
  onManageVersions,
  canManageVersions,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

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
    <div className="deck-version-dropdown" ref={dropdownRef}>
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
                role="option"
                aria-selected={version.versionId === activeVersion?.versionId}
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
    </div>
  );
};

export default DeckVersionDropdown;

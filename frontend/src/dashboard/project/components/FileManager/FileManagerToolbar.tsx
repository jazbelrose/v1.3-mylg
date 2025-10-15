import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolderPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import Dropdown from "./Dropdown";
import type { FilterValue, SortOption } from "./FileManagerTypes";
import styles from "./file-manager.module.css";

interface FileManagerToolbarProps {
  folderKey: string;
  activeFolderName: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterOption: FilterValue;
  filterOptions: Array<{ value: FilterValue; label: string }>;
  onFilterChange: (value: FilterValue) => void;
  sortOption: SortOption;
  sortOptions: Array<{ value: SortOption; label: string }>;
  onSortChange: (value: SortOption) => void;
  onToggleView: () => void;
  layoutIcon: IconDefinition;
  onClose: () => void;
  renderFolderIcon: (key: string, size?: number) => React.ReactNode;
  onCreateFolder: () => void;
  canCreateFolder: boolean;
}

export const FileManagerToolbar = ({
  folderKey,
  activeFolderName,
  searchTerm,
  onSearchChange,
  filterOption,
  filterOptions,
  onFilterChange,
  sortOption,
  sortOptions,
  onSortChange,
  onToggleView,
  layoutIcon,
  onClose,
  renderFolderIcon,
  onCreateFolder,
  canCreateFolder,
}: FileManagerToolbarProps) => {
  return (
    <div className={styles.modalHeader}>
      <div className={styles.modalTitle}>
        <div className={styles.titleText}>
          {renderFolderIcon("uploads", 18)}
          <h2>Project Files</h2>
        </div>
        {folderKey !== "uploads" && (
          <span className={styles.activeFolderBadge}>{activeFolderName}</span>
        )}
      </div>

      <div className={styles.actions}>
        {canCreateFolder && (
          <button className={styles.primaryButton} onClick={onCreateFolder} type="button">
            <FontAwesomeIcon icon={faFolderPlus} />
            <span className={styles.buttonLabel}>New Folder</span>
          </button>
        )}
        <input
          type="text"
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
        />
        <Dropdown
          label="Filter files"
          options={filterOptions}
          value={filterOption}
          onChange={onFilterChange}
        />
        <Dropdown label="Sort files" options={sortOptions} value={sortOption} onChange={onSortChange} />
        <button className={styles.iconButton} onClick={onToggleView} aria-label="Toggle view">
          <FontAwesomeIcon icon={layoutIcon} />
        </button>
        <button className={styles.iconButton} onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
    </div>
  );
};

export default FileManagerToolbar;










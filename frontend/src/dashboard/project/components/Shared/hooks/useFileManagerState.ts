import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { faList, faThLarge } from "@fortawesome/free-solid-svg-icons";
import type {
  FileItem,
  FileManagerProps,
  FilterValue,
  FolderOption,
  Project,
  SortOption,
  ViewMode,
} from "../../FileManager/FileManagerTypes";

interface UseFileManagerStateParams
  extends Pick<FileManagerProps, "folder" | "displayName" | "isOpen" | "onRequestClose"> {
  activeProject?: Project;
}

const parseCustomFolders = (value: unknown): FolderOption[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((folder) => {
      if (!folder) return null;
      if (typeof folder === "string") {
        return { key: folder, name: folder } satisfies FolderOption;
      }
      if (typeof folder === "object" && "key" in folder) {
        const key = String((folder as { key: unknown }).key || "").trim();
        if (!key) return null;
        const name =
          typeof (folder as { name?: unknown }).name === "string"
            ? ((folder as { name?: string }).name || key)
            : key;
        return { key, name } satisfies FolderOption;
      }
      return null;
    })
    .filter((folder): folder is FolderOption => Boolean(folder?.key));
};

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "date-desc", label: "Newest" },
  { value: "date-asc", label: "Oldest" },
  { value: "kind-asc", label: "Type (A-Z)" },
  { value: "kind-desc", label: "Type (Z-A)" },
];

export const useFileManagerState = ({
  folder = "uploads",
  displayName,
  isOpen,
  onRequestClose,
  activeProject,
}: UseFileManagerStateParams) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [folderKey, setFolderKey] = useState<string>(folder);
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [isFilesModalOpen, setFilesModalOpen] = useState<boolean>(Boolean(isOpen));
  const [isImageModalOpen, setImageModalOpen] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined"
      ? ((localStorage.getItem("fileManagerViewMode") as ViewMode) || "grid")
      : "grid"
  );
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [filterOption, setFilterOption] = useState<FilterValue>("all");
  const [localActiveProject, setLocalActiveProject] = useState<Project>(activeProject || {});
  const [customFolders, setCustomFolders] = useState<FolderOption[]>(
    () => parseCustomFolders((activeProject as { customFolders?: unknown })?.customFolders)
  );

  const renderedName = useMemo(
    () => {
      if (displayName) return displayName;
      if (folderKey === "uploads") return "Project Files";
      return folderKey.charAt(0).toUpperCase() + folderKey.slice(1);
    },
    [displayName, folderKey]
  );

  useEffect(() => {
    setFolderKey(folder);
  }, [folder]);

  useEffect(() => {
    setLocalActiveProject(activeProject || {});
  }, [activeProject]);

  useEffect(() => {
    setCustomFolders(parseCustomFolders((localActiveProject as { customFolders?: unknown })?.customFolders));
  }, [localActiveProject]);

  useEffect(() => {
    if (typeof isOpen === "boolean") {
      if (isOpen) setFilesModalOpen(true);
      else {
        setFilesModalOpen(false);
        onRequestClose?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    return () => {
      selectedFiles.forEach((f) => {
        if (f.url && f.url.startsWith("blob:")) {
          URL.revokeObjectURL(f.url);
        }
      });
    };
  }, [selectedFiles]);

  useLayoutEffect(() => {
    const y = sessionStorage.getItem("files.scrollY");
    if (y && scrollerRef.current) scrollerRef.current.scrollTop = +y;
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    const onScroll = () => sessionStorage.setItem("files.scrollY", String(el?.scrollTop ?? 0));
    el?.addEventListener("scroll", onScroll);
    return () => el?.removeEventListener("scroll", onScroll);
  }, []);

  const kindOptions = useMemo(() => {
    const kinds = new Set(selectedFiles.map((f) => f.kind));
    return Array.from(kinds).sort();
  }, [selectedFiles]);

  const filterOptionsList = useMemo(
    () => [
      { value: "all", label: "All types" },
      ...kindOptions.map((kind) => ({
        value: kind,
        label: kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "Unknown",
      })),
    ],
    [kindOptions]
  );

  const sortFiles = useCallback(
    (files: FileItem[]) => {
      return [...files].sort((a, b) => {
        switch (sortOption) {
          case "name-desc":
            return a.fileName.localeCompare(b.fileName) * -1;
          case "date-asc":
            return (a.lastModified || 0) - (b.lastModified || 0);
          case "date-desc":
            return (b.lastModified || 0) - (a.lastModified || 0);
          case "kind-asc":
            return (a.kind || "").localeCompare(b.kind || "");
          case "kind-desc":
            return (b.kind || "").localeCompare(a.kind || "");
          case "name-asc":
          default:
            return a.fileName.localeCompare(b.fileName);
        }
      });
    },
    [sortOption]
  );

  const displayedFiles = useMemo(() => {
    const filtered = selectedFiles.filter(
      (f) =>
        f.fileName.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (filterOption === "all" || f.kind === filterOption)
    );
    return sortFiles(filtered);
  }, [selectedFiles, searchTerm, filterOption, sortFiles]);

  const toggleViewMode = useCallback(() => {
    const newMode: ViewMode = viewMode === "grid" ? "list" : "grid";
    setViewMode(newMode);
    if (typeof window !== "undefined") {
      localStorage.setItem("fileManagerViewMode", newMode);
    }
  }, [viewMode]);

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((s) => {
      if (s) setSelectedItems(new Set());
      return !s;
    });
  }, []);

  const handleSelectionChange = useCallback(
    (url: string) => {
      setSelectedItems((prev) => {
        const newSelected = new Set(prev);
        if (newSelected.has(url)) newSelected.delete(url);
        else newSelected.add(url);
        return newSelected;
      });
    },
    []
  );

  const handleSelectAll = useCallback(() => {
    setSelectedItems((prev) => {
      if (prev.size === selectedFiles.length) return new Set();
      return new Set(selectedFiles.map((u) => u.url));
    });
  }, [selectedFiles]);

  const isSelected = useCallback((url: string) => selectedItems.has(url), [selectedItems]);

  const closeFilesModal = useCallback(() => {
    setFilesModalOpen(false);
    onRequestClose?.();
  }, [onRequestClose]);

  const closeImageModal = useCallback(() => setImageModalOpen(false), []);

  const handleNextImage = useCallback(() => {
    if (!displayedFiles.length || currentIndex === null) return;
    const nextIndex = (currentIndex + 1) % displayedFiles.length;
    setCurrentIndex(nextIndex);
    setSelectedImage(displayedFiles[nextIndex].url);
  }, [displayedFiles, currentIndex]);

  const handlePrevImage = useCallback(() => {
    if (!displayedFiles.length || currentIndex === null) return;
    const prevIndex = (currentIndex - 1 + displayedFiles.length) % displayedFiles.length;
    setCurrentIndex(prevIndex);
    setSelectedImage(displayedFiles[prevIndex].url);
  }, [displayedFiles, currentIndex]);

  const handleFileClick = useCallback(
    (file: FileItem, index: number) => {
      if (isSelectMode) {
        handleSelectionChange(file.url);
      } else {
        const extension = file.fileName.split(".").pop()?.toLowerCase();
        if (extension === "html") {
          window.open(file.url, "_blank", "noopener,noreferrer");
          return;
        }
        setCurrentIndex(index);
        setSelectedImage(file.url);
        setImageModalOpen(true);
      }
    },
    [handleSelectionChange, isSelectMode]
  );

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isImageModalOpen) closeImageModal();
      else if (isFilesModalOpen) closeFilesModal();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isFilesModalOpen, isImageModalOpen, closeFilesModal, closeImageModal]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isImageModalOpen) return;
      if (e.key === "ArrowRight") handleNextImage();
      else if (e.key === "ArrowLeft") handlePrevImage();
      else if (e.key === "Escape") closeImageModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImageModalOpen, handleNextImage, handlePrevImage, closeImageModal]);

  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const SWIPE_THRESHOLD = 50;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touchX = e.touches[0]?.clientX ?? 0;
    setTouchStartX(touchX);
    setTouchEndX(touchX);
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => setTouchEndX(e.touches[0]?.clientX ?? 0), []);
  const handleTouchEnd = useCallback(() => {
    if (touchStartX - touchEndX > SWIPE_THRESHOLD) handleNextImage();
    else if (touchEndX - touchStartX > SWIPE_THRESHOLD) handlePrevImage();
  }, [touchStartX, touchEndX, handleNextImage, handlePrevImage]);

  const layoutIconToUse = viewMode === "grid" ? faList : faThLarge;

  const addCustomFolder = useCallback(
    (folder: FolderOption) => {
      setCustomFolders((prev) => {
        if (prev.some((existing) => existing.key === folder.key)) {
          return prev;
        }
        return [...prev, folder];
      });

      setLocalActiveProject((prevProject: Project) => {
        const currentFolders = parseCustomFolders((prevProject as { customFolders?: unknown })?.customFolders);
        if (currentFolders.some((existing) => existing.key === folder.key)) {
          return prevProject;
        }
        return {
          ...prevProject,
          customFolders: [...currentFolders, folder],
          [folder.key]: (prevProject as Record<string, unknown>)[folder.key] ?? [],
        } as Project;
      });
    },
    [setLocalActiveProject]
  );

  return {
    fileInputRef,
    scrollerRef,
    folderKey,
    setFolderKey,
    renderedName,
    selectedFiles,
    setSelectedFiles,
    isFilesModalOpen,
    setFilesModalOpen,
    closeFilesModal,
    isImageModalOpen,
    setImageModalOpen,
    selectedImage,
    setSelectedImage,
    currentIndex,
    setCurrentIndex,
    selectedItems,
    setSelectedItems,
    isSelectMode,
    setIsSelectMode,
    toggleSelectMode,
    isConfirmingDelete,
    setIsConfirmingDelete,
    isDragging,
    setIsDragging,
    isLoading,
    setIsLoading,
    searchTerm,
    setSearchTerm,
    viewMode,
    toggleViewMode,
    layoutIconToUse,
    sortOption,
    setSortOption,
    filterOption,
    setFilterOption,
    filterOptionsList,
    displayedFiles,
    sortFiles,
    handleSelectionChange,
    handleSelectAll,
    isSelected,
    handleFileClick,
    handleNextImage,
    handlePrevImage,
    closeImageModal,
    selectedFilesCount: selectedFiles.length,
    localActiveProject,
    setLocalActiveProject,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    setFilesModalOpenDirect: setFilesModalOpen,
    sortOptionsList: SORT_OPTIONS,
    customFolders,
    addCustomFolder,
  };
};

export type UseFileManagerStateReturn = ReturnType<typeof useFileManagerState>;










import type {
  ChangeEventHandler,
  DragEventHandler,
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

export interface ImageObj {
  url?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  [k: string]: unknown;
}

export interface Gallery {
  // identifiers
  galleryId?: string;
  id?: string;
  slug?: string;
  name?: string;

  // links / sources
  url?: string;
  link?: string;
  svgUrl?: string;
  updatedSvgUrl?: string;
  updatedPdfUrl?: string;
  updatedUrl?: string;
  originalSvgUrl?: string;
  originalPdfUrl?: string;
  originalUrl?: string;

  // auth / config
  password?: string;
  passwordHash?: string;
  passwordEnabled?: boolean;
  passwordTimeout?: number;

  // images
  coverImageUrl?: string;
  pageImageUrls?: string[];
  imageUrls?: string[];
  images?: Array<string | ImageObj>;

  // UI/optimistic
  uploading?: boolean;
  processing?: boolean;
  optimisticId?: string;
  progress?: number;

  // legacy passthrough
  [key: string]: unknown;
}

export interface ProjectLite {
  projectId?: string;
  title?: string;
  // legacy
  gallery?: Gallery[];
  // current
  galleries?: Gallery[];
  clientGallerySlug?: string;
  [k: string]: unknown;
}

export interface PendingCover {
  index: number;
  isLegacy: boolean;
  gallery: Gallery;
}

export interface CoverOptions extends PendingCover {
  urls: string[];
}

export interface GalleryController {
  saving: boolean;
  isAdmin: boolean;
  isBuilder: boolean;
  isDesigner: boolean;
  galleries: Gallery[];
  legacyGalleries: Gallery[];
  combinedGalleries: Gallery[];
  clientGallerySlug: string | null;
  clientGallery: Gallery | null;
  hasClientGallerySelection: boolean;
  displayedGalleries: Gallery[];
  recentlyCreated: string[];
  legacyCount: number;
  hasGalleries: boolean;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  showForm: boolean;
  setShowForm: Dispatch<SetStateAction<boolean>>;
  editingIndex: number | null;
  setEditingIndex: Dispatch<SetStateAction<number | null>>;
  editingCombinedIndex: number | null;
  isEditing: boolean;
  isCreating: boolean;
  handleTriggerClick: () => Promise<void> | void;
  handleGalleryNavigate: (galleryItem: Gallery, slug: string) => Promise<void>;
  handleModalDragOver: DragEventHandler<HTMLDivElement>;
  handleModalDragLeave: DragEventHandler<HTMLDivElement>;
  handleModalDrop: DragEventHandler<HTMLDivElement>;
  handleFileChange: ChangeEventHandler<HTMLInputElement>;
  handleCoverFileChange: ChangeEventHandler<HTMLInputElement>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  coverInputRef: MutableRefObject<HTMLInputElement | null>;
  handleDragOver: DragEventHandler<HTMLDivElement>;
  handleDragLeave: DragEventHandler<HTMLDivElement>;
  handleDrop: DragEventHandler<HTMLDivElement>;
  isDragging: boolean;
  isModalDragging: boolean;
  setIsModalDragging: Dispatch<SetStateAction<boolean>>;
  selectedFile: File | null;
  setSelectedFile: Dispatch<SetStateAction<File | null>>;
  uploading: boolean;
  uploadProgress: number;
  galleryName: string;
  setGalleryName: Dispatch<SetStateAction<string>>;
  gallerySlug: string;
  setGallerySlug: Dispatch<SetStateAction<string>>;
  galleryPassword: string;
  setGalleryPassword: Dispatch<SetStateAction<string>>;
  galleryPasswordEnabled: boolean;
  setGalleryPasswordEnabled: Dispatch<SetStateAction<boolean>>;
  showPassword: boolean;
  setShowPassword: Dispatch<SetStateAction<boolean>>;
  galleryTimeout: number;
  setGalleryTimeout: Dispatch<SetStateAction<number>>;
  galleryUrl: string;
  setGalleryUrl: Dispatch<SetStateAction<string>>;
  handleUpload: () => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  startEdit: (combinedIndex: number) => void;
  handleDeleteGallery: (combinedIndex: number) => void;
  confirmDeleteGallery: () => Promise<void>;
  isConfirmingDelete: boolean;
  setIsConfirmingDelete: Dispatch<SetStateAction<boolean>>;
  deleteIndex: number | null;
  setDeleteIndex: Dispatch<SetStateAction<number | null>>;
  coverOptions: CoverOptions | null;
  setCoverOptions: Dispatch<SetStateAction<CoverOptions | null>>;
  handleChangeCover: (combinedIndex: number) => void;
  chooseCoverUrl: (url: string) => void;
  handleUploadNewCover: () => void;
  currentCoverUrls: string[];
  totalCoverPages: number;
  coverStartIndex: number;
  coverPage: number;
  setCoverPage: Dispatch<SetStateAction<number>>;
  coverUploadingIndex: number | null;
  pendingCover: PendingCover | null;
  setPendingCover: Dispatch<SetStateAction<PendingCover | null>>;
  selectClientGallery: (gallery: Gallery) => Promise<void>;
}

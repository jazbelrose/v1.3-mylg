import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
  DragEvent,
  ChangeEvent,
  KeyboardEvent,
} from 'react';
import Modal from '@/shared/ui/ModalWithStack';
import {
  FaFilePdf,
  FaFileExcel,
  FaFileAlt,
  FaDraftingCompass,
  FaCube,
} from 'react-icons/fa';
import { SiAdobe, SiSvg, SiHtml5 } from 'react-icons/si';
import styles from './new-project-upload-files.module.css';

interface NewProjectUploadFilesProps {
  selectedFiles: File[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  selectedFileNames: string;
  setSelectedFileNames: (names: string) => void;
}

const NewProjectUploadFiles: React.FC<NewProjectUploadFilesProps> = ({
  selectedFiles,
  setSelectedFiles,
  selectedFileNames,
  setSelectedFileNames,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [ariaMessage, setAriaMessage] = useState('');
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);

  const openModal = () => setShowModal(true);
  const closeModal = () => setShowModal(false);

  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      setSelectedFiles(prev => [...prev, ...files]);
      setAriaMessage(`${files.length} file${files.length > 1 ? 's' : ''} added`);
    },
    [setSelectedFiles, setAriaMessage]
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLDivElement>,
    ref: React.RefObject<HTMLInputElement>,
    onClick?: () => void
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onClick) {
        onClick();
      } else {
        ref.current?.click();
      }
    }
  };

  const handleCancel = () => {
    setSelectedFiles([]);
    setSelectedFileNames('');
    closeModal();
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const names = selectedFiles.map(f => f.name).join(', ');
    if (names !== selectedFileNames) {
      setSelectedFileNames(names);
    }
  }, [selectedFiles, selectedFileNames, setSelectedFileNames]);

  const previews = useMemo(
    () => selectedFiles.map(file => ({ file, url: URL.createObjectURL(file) })),
    [selectedFiles]
  );

  useEffect(() => {
    return () => {
      previews.forEach(p => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const truncateName = (name: string, max = 12) => {
    if (name.length <= max) return name;
    const extIndex = name.lastIndexOf('.');
    if (extIndex === -1) return name.slice(0, max) + '...';
    const base = name.slice(0, extIndex);
    const ext = name.slice(extIndex + 1);
    if (base.length > max) return base.slice(0, max) + '(..).' + ext;
    return name;
  };

  const renderFileIcon = (p: { file: File; url: string }) => {
    const ext = p.file.name.split('.').pop()?.toLowerCase();
    if (!ext) return <FaFileAlt size={40} color="white" />;
    if (["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext)) {
      return <img src={p.url} alt={p.file.name} className={styles.previewImage} />;
    }
    if (ext === "pdf") return <FaFilePdf size={40} color="#FA3356" />;
    if (ext === "svg") return <SiSvg size={40} color="purple" />;
    if (ext === "html" || ext === "htm") return <SiHtml5 size={40} color="orange" />;
    if (ext === "txt") return <FaFileAlt size={40} color="gray" />;
    if (["xls", "xlsx", "csv"].includes(ext)) return <FaFileExcel size={40} color="green" />;
    if (["dwg", "vwx"].includes(ext)) return <FaDraftingCompass size={40} color="brown" />;
    if (["c4d", "obj"].includes(ext)) return <FaCube size={40} color="purple" />;
    if (["ai", "afdesign"].includes(ext)) return <SiAdobe size={40} color="orange" />;
    return <FaFileAlt size={40} color="white" />;
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData.files.length) {
        addFiles(Array.from(e.clipboardData.files));
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFiles]);

  const renderDropZone = (
    ref: React.RefObject<HTMLInputElement>,
    onClick?: () => void
  ) => (
    <div
      className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
      onClick={() => (onClick ? onClick() : ref.current?.click())}
      onKeyDown={e => handleKeyDown(e, ref, onClick)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      tabIndex={0}
      role="button"
      aria-label="Project files upload dropzone"
    >
      {selectedFiles.length === 0 ? (
        <p className={styles.dropZoneLabel}>Click or drag a SVG or PDF file here</p>
      ) : (
        <ul className={styles.fileGrid}>
          {previews.map((p, index) => (
            <li key={index} className={styles.fileItem}>
              <div className={styles.filePreview}>
                {renderFileIcon(p)}
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeFile(index)}
                  aria-label="Remove file"
                >
                  &times;
                </button>
              </div>
              <div className={styles.fileName}>{truncateName(p.file.name)}</div>
            </li>
          ))}
        </ul>
      )}
      <input
        type="file"
        multiple
        accept=".pdf,.svg"
        ref={ref}
        onChange={handleFileChange}
        className={styles.hiddenInput}
        aria-hidden="true"
      />
    </div>
  );

  return (
    <>
      {renderDropZone(inlineInputRef, openModal)}
      <Modal
        isOpen={showModal}
        onRequestClose={closeModal}
        contentLabel="File Upload Modal"
        overlayClassName={styles.fileModalOverlay}
        className={styles.fileModalContent}
      >
        {renderDropZone(modalInputRef)}
        <div className={styles.modalFooter}>
          <button className={`modal-button primary ${styles.iconButton}`} onClick={closeModal}>
            Upload
          </button>
          <button className={`modal-button secondary ${styles.iconButton}`} onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </Modal>
      <div aria-live="polite" className={styles.srOnly}>
        {ariaMessage}
      </div>
    </>
  );
};

export default NewProjectUploadFiles;












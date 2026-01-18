/**
 * FileIconByType - Renders a proper type tile for non-image files
 * 
 * Features:
 * - Never shows broken image icon
 * - Displays file type icon with extension pill
 * - Uses subtle gradient backgrounds
 * - Supports various file types (PDF, DOC, XLS, CAD, etc.)
 */

import React from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  File,
  Presentation,
  FileType2,
} from 'lucide-react';
import { FaDraftingCompass, FaCube } from 'react-icons/fa';
import { SiAdobe, SiSvg } from 'react-icons/si';
import styles from './file-thumb.module.css';

export interface FileTypeInfo {
  icon: React.ReactNode;
  color: string;
  label: string;
  gradient: string;
}

export function getFileTypeInfo(mimeType?: string, extension?: string): FileTypeInfo {
  const ext = extension?.toLowerCase()?.replace(/^\./, '') || '';
  const mime = mimeType?.toLowerCase() || '';

  // PDF
  if (ext === 'pdf' || mime.includes('pdf')) {
    return {
      icon: <FileText size={24} />,
      color: '#dc2626',
      label: 'PDF',
      gradient: 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)',
    };
  }

  // Word Documents
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext) || mime.includes('word') || mime.includes('document')) {
    return {
      icon: <FileText size={24} />,
      color: '#2563eb',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%)',
    };
  }

  // Spreadsheets
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return {
      icon: <FileSpreadsheet size={24} />,
      color: '#16a34a',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #bbf7d0 0%, #86efac 100%)',
    };
  }

  // Presentations
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext) || mime.includes('presentation') || mime.includes('powerpoint')) {
    return {
      icon: <Presentation size={24} />,
      color: '#ea580c',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
    };
  }

  // CAD / Drawing
  if (['dwg', 'dxf', 'vwx', 'skp', 'rvt'].includes(ext)) {
    return {
      icon: <FaDraftingCompass size={24} />,
      color: '#a16207',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #fef08a 0%, #fde047 100%)',
    };
  }

  // 3D Models
  if (['c4d', 'obj', 'fbx', '3ds', 'blend', 'stl'].includes(ext)) {
    return {
      icon: <FaCube size={24} />,
      color: '#7c3aed',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%)',
    };
  }

  // Adobe
  if (['ai', 'psd', 'indd', 'afdesign', 'afphoto'].includes(ext)) {
    return {
      icon: <SiAdobe size={24} />,
      color: '#ff6b00',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)',
    };
  }

  // SVG
  if (ext === 'svg' || mime.includes('svg')) {
    return {
      icon: <SiSvg size={24} />,
      color: '#a855f7',
      label: 'SVG',
      gradient: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
    };
  }

  // Video
  if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'wmv'].includes(ext) || mime.includes('video')) {
    return {
      icon: <FileVideo size={24} />,
      color: '#db2777',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #fbcfe8 0%, #f9a8d4 100%)',
    };
  }

  // Audio
  if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext) || mime.includes('audio')) {
    return {
      icon: <FileAudio size={24} />,
      color: '#0891b2',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #a5f3fc 0%, #67e8f9 100%)',
    };
  }

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mime.includes('archive') || mime.includes('zip')) {
    return {
      icon: <FileArchive size={24} />,
      color: '#64748b',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
    };
  }

  // Code
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml', 'yml', 'yaml'].includes(ext)) {
    return {
      icon: <FileCode size={24} />,
      color: '#0ea5e9',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #bae6fd 0%, #7dd3fc 100%)',
    };
  }

  // Text
  if (['txt', 'md', 'markdown', 'log'].includes(ext) || mime.includes('text')) {
    return {
      icon: <FileType2 size={24} />,
      color: '#6b7280',
      label: ext.toUpperCase() || 'TXT',
      gradient: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
    };
  }

  // Images (fallback for non-previewable images)
  if (['heic', 'heif', 'tiff', 'tif', 'raw', 'cr2', 'nef'].includes(ext) || mime.includes('image')) {
    return {
      icon: <FileImage size={24} />,
      color: '#8b5cf6',
      label: ext.toUpperCase(),
      gradient: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
    };
  }

  // Default / Unknown
  return {
    icon: <File size={24} />,
    color: '#6b7280',
    label: ext.toUpperCase() || 'FILE',
    gradient: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
  };
}

export interface FileIconByTypeProps {
  /** MIME type of the file */
  mimeType?: string;
  /** File extension (with or without dot) */
  extension?: string;
  /** Size of the tile (width/height) */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class name */
  className?: string;
}

export function FileIconByType({
  mimeType,
  extension,
  size = 'md',
  className = '',
}: FileIconByTypeProps) {
  const typeInfo = getFileTypeInfo(mimeType, extension);

  const sizeClasses = {
    sm: styles.typeTileSm,
    md: styles.typeTileMd,
    lg: styles.typeTileLg,
  };

  return (
    <div
      className={`${styles.typeTile} ${sizeClasses[size]} ${className}`}
      style={{ background: typeInfo.gradient }}
    >
      <div className={styles.typeTileIcon} style={{ color: typeInfo.color }}>
        {typeInfo.icon}
      </div>
      <span className={styles.typeTileLabel} style={{ backgroundColor: typeInfo.color }}>
        {typeInfo.label}
      </span>
    </div>
  );
}

export default FileIconByType;

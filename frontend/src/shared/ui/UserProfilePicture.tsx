import React, { useCallback, useId, useMemo, useRef } from 'react';

import User from '@/assets/svg/user.svg?react';
import { resolveStoredFileUrl } from '../utils/media';

export interface UserProfilePictureProps {
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  localPreview?: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  label?: string;
  hideLabel?: boolean;
}

const UserProfilePicture: React.FC<UserProfilePictureProps> = ({
  thumbnail,
  thumbnailUrl,
  localPreview,
  onChange,
  id,
  label,
  hideLabel,
}) => {
  const generatedId = useId();
  const inputId = id ?? `thumbnail-${generatedId}`;
  const labelText = label ?? 'Profile picture';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shouldHideLabel = hideLabel ?? false;
  const labelClassName = shouldHideLabel
    ? 'thumbnail-label-text visually-hidden'
    : 'thumbnail-label-text';

  const src = useMemo(() => {
    if (localPreview) {
      return localPreview;
    }

    return resolveStoredFileUrl(thumbnail ?? undefined, thumbnailUrl ?? undefined);
  }, [localPreview, thumbnail, thumbnailUrl]);

  const handleTriggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="form-group thumbnail-group">
      <label htmlFor={inputId} className={labelClassName}>
        {labelText}
      </label>
      <button
        type="button"
        className="thumbnail-label"
        aria-controls={inputId}
        aria-label="Upload new profile picture"
        onClick={handleTriggerUpload}
      >
        <span className="thumbnail-visual" aria-hidden="true">
          {src ? (
            <img src={src} alt="" className="profile-thumbnail" />
          ) : (
            <User className="thumbnail-placeholder" />
          )}
        </span>
        <span className="thumbnail-plus" aria-hidden="true">
          ＋
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        id={inputId}
        className="thumbnail-input"
        onChange={onChange}
        aria-label="Upload new profile picture"
        accept="image/*"
      />
    </div>
  );
};

export default UserProfilePicture;











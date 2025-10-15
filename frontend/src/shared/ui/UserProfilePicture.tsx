import React from 'react';

import User from '@/assets/svg/user.svg?react';
import { resolveStoredFileUrl } from '../utils/media';

export interface UserProfilePictureProps {
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  localPreview?: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const UserProfilePicture: React.FC<UserProfilePictureProps> = ({
  thumbnail,
  thumbnailUrl,
  localPreview,
  onChange,
}) => {
  const src = React.useMemo(() => {
    if (localPreview) {
      return localPreview;
    }

    return resolveStoredFileUrl(thumbnail ?? undefined, thumbnailUrl ?? undefined);
  }, [localPreview, thumbnail, thumbnailUrl]);

  return (
    <div className="form-group thumbnail-group">
      <label htmlFor="thumbnail">Profile picture</label>
      <label htmlFor="thumbnail" className="thumbnail-label">
        {src ? (
          <img src={src} alt="Profile Thumbnail" className="profile-thumbnail" />
        ) : (
          <User className="thumbnail-placeholder" />
        )}
        <input
          type="file"
          id="thumbnail"
          className="thumbnail-input"
          onChange={onChange}
        />
      </label>
    </div>
  );
};

export default UserProfilePicture;











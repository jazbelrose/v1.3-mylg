import React from "react";

import User from "@/assets/svg/user.svg?react";
import { resolveStoredFileUrl } from "../utils/media";

export interface UserProfilePictureProps {
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  localPreview?: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  label?: string;
}

const UserProfilePicture: React.FC<UserProfilePictureProps> = ({
  thumbnail,
  thumbnailUrl,
  localPreview,
  onChange,
  id = "thumbnail",
  label = "Profile picture",
}) => {
  const src = React.useMemo(() => {
    if (localPreview) {
      return localPreview;
    }

    return resolveStoredFileUrl(thumbnail ?? undefined, thumbnailUrl ?? undefined);
  }, [localPreview, thumbnail, thumbnailUrl]);

  return (
    <div className="profile-uploader">
      <span className="profile-uploader__label" id={`${id}-label`}>
        {label}
      </span>
      <label
        htmlFor={id}
        className="profile-uploader__control"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
      >
        {src ? (
          <img src={src} alt="Profile" className="profile-uploader__image" />
        ) : (
          <User className="profile-uploader__placeholder" aria-hidden="true" focusable="false" />
        )}
        <span className="profile-uploader__overlay" aria-hidden="true">
          <span className="profile-uploader__plus">＋</span>
        </span>
        <input
          type="file"
          id={id}
          className="profile-uploader__input"
          onChange={onChange}
          aria-label={label}
        />
      </label>
      <span className="profile-uploader__hint" id={`${id}-hint`}>
        Tap or click to update
      </span>
    </div>
  );
};

export default UserProfilePicture;











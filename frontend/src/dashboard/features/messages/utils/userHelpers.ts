import { AppUser } from "../types";

// Attempt to derive a display name from available user fields
export const getUserDisplayName = (u?: AppUser): string =>
  u
    ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
      (u.username as string | undefined) ||
      (u.email as string | undefined) ||
      u.userId
    : "Unknown";

// Attempt to derive a thumbnail path from various possible field names
export const getUserThumbnail = (u?: AppUser): string | null =>
  (u?.thumbnail as string | undefined) ||
  (u?.profilePicture as string | undefined) ||
  (u?.photoUrl as string | undefined) ||
  (u?.avatar as string | undefined) ||
  (u?.avatarUrl as string | undefined) ||
  (u?.image as string | undefined) ||
  (u?.profileImage as string | undefined) ||
  (u?.picture as string | undefined) ||
  null;









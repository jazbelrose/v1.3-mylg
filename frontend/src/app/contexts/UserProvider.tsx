// src/app/contexts/UserProvider.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  PropsWithChildren,
} from "react";
import { useAuth } from "./useAuth";
import {
  fetchAllUsers,
  fetchUserProfile as fetchUserProfileApi,
  updateUserProfile,
} from "../../shared/utils/api";
import { resolveStoredFileUrl } from "@/shared/utils/media";
import { UserContext } from "./UserContext";
import type { UserContextValue } from "./UserContextValue";
import type { UserLite } from "./DataProvider";
import { getDevPreviewData, isPreviewModeEnabled, subscribeToPreviewMode } from "@/shared/utils/devPreview";

const mapUserLite = (user: UserLite): UserLite => {
  const thumbnailUrl = resolveStoredFileUrl(user.thumbnail as string | undefined);
  return {
    ...user,
    occupation: user.occupation || user.role,
    thumbnailUrl: thumbnailUrl || undefined,
  };
};

export const UserProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { userId } = useAuth();

  const [previewMode, setPreviewMode] = useState<boolean>(() => isPreviewModeEnabled());
  const [user, setUser] = useState<UserLite | null>(() =>
    previewMode ? getDevPreviewData().user : null
  );
  const [allUsers, setAllUsers] = useState<UserLite[]>(() =>
    previewMode ? getDevPreviewData().allUsers : []
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return subscribeToPreviewMode(() => {
      const enabled = isPreviewModeEnabled();
      setPreviewMode(enabled);
    });
  }, []);

  useEffect(() => {
    if (previewMode) {
      const preview = getDevPreviewData();
      setUser(preview.user);
      setAllUsers(preview.allUsers);
    } else {
      setUser(null);
      setAllUsers([]);
    }
  }, [previewMode]);

  // Load all users
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const users = await fetchAllUsers();
        const mapped = Array.isArray(users)
          ? (users as UserLite[]).map((u) => mapUserLite(u))
          : [];
        setAllUsers(mapped);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    if (previewMode || !userId) {
      return;
    }
    if (userId) {
      loadUsers();
    }
  }, [userId, previewMode]);

  const refreshUsers = useCallback(async () => {
    if (previewMode) {
      const preview = getDevPreviewData();
      setAllUsers(preview.allUsers);
      return;
    }
    try {
      const users = await fetchAllUsers();
      const mapped = Array.isArray(users)
        ? (users as UserLite[]).map((u) => mapUserLite(u))
        : [];
      setAllUsers(mapped);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }, [previewMode]);

  // Load user profile
  const fetchUserProfile = useCallback(async () => {
    if (previewMode) {
      const preview = getDevPreviewData();
      setUser({ ...preview.user });
      return;
    }
    if (!userId) {
      setUser(null);
      return;
    }
    try {
      const profile = await fetchUserProfileApi(userId);
      const mappedProfile = profile
        ? mapUserLite(profile as UserLite)
        : null;

      setUser({
        ...(mappedProfile ?? ({} as UserLite)),
        messages: (mappedProfile as UserLite | null)?.messages || [],
        userId,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  }, [userId, previewMode]);

  useEffect(() => {
    if (previewMode) {
      const preview = getDevPreviewData();
      setUser({ ...preview.user });
      return;
    }
    if (userId) {
      fetchUserProfile();
    }
  }, [userId, fetchUserProfile, previewMode]);

  // Derived role checks based on user profile
  const userData = useMemo<UserLite | null>(() => {
    if (user) {
      return user;
    }

    if (!userId) {
      return null;
    }

    return { userId, messages: [] } as UserLite;
  }, [user, userId]);

  const role = userData?.role || userData?.occupation;
  const isAdmin = role === "admin";
  const isDesigner = role === "designer";
  const isBuilder = role === "builder";
  const isVendor = role === "vendor";
  const isClient = role === "client";

  // Backward compatibility
  const userName = userData?.firstName ? `${userData.firstName} ` : "Guest";
  const setUserData = setUser; // alias for backward compatibility
  const refreshUser = fetchUserProfile; // alias for backward compatibility

  const handleUpdateUserProfile = useCallback(
    async (profile: Parameters<typeof updateUserProfile>[0]) => {
      if (previewMode) {
        const preview = getDevPreviewData();
        const updated = { ...preview.user, ...profile } as UserLite;
        setUser(updated);
        setAllUsers((prev) =>
          prev.map((u) => (u.userId === updated.userId ? updated : u))
        );
        return updated as Awaited<ReturnType<typeof updateUserProfile>>;
      }
      return updateUserProfile(profile);
    },
    [previewMode]
  );

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      allUsers,
      userId,
      userName,
      userData,
      setUserData,
      setUser,
      refreshUsers,
      refreshUser,
      updateUserProfile: handleUpdateUserProfile,
      fetchUserProfile,
      isAdmin,
      isDesigner,
      isBuilder,
      isVendor,
      isClient,
    }),
    [
      user,
      allUsers,
      userId,
      userName,
      userData,
      setUserData,
      refreshUsers,
      refreshUser,
      fetchUserProfile,
      isAdmin,
      isDesigner,
      isBuilder,
      isVendor,
      isClient,
      handleUpdateUserProfile,
    ]
  );

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};









import type { UserLite } from "./DataProvider";
import type { updateUserProfile } from "../../shared/utils/api";

export interface UserContextValue {
  // User profile data (business-level, stored in DynamoDB/backend)
  user: UserLite | null;
  allUsers: UserLite[];
  
  // Backward compatibility with existing components
  userId?: string;
  userName: string;
  userData: UserLite | null;
  setUserData: React.Dispatch<React.SetStateAction<UserLite | null>>;
  
  // Actions
  setUser: React.Dispatch<React.SetStateAction<UserLite | null>>;
  refreshUsers: () => Promise<void>;
  refreshUser: (force?: boolean) => Promise<void>; // alias for fetchUserProfile
  updateUserProfile: typeof updateUserProfile;
  fetchUserProfile: () => Promise<void>;
  
  // Derived role checks (from user profile)
  isAdmin: boolean;
  isDesigner: boolean;
  isBuilder: boolean;
  isVendor: boolean;
  isClient: boolean;
}









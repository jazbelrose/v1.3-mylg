import { createContext } from "react";
import { fetchAuthSession, getCurrentUser as amplifyGetCurrentUser } from "aws-amplify/auth";

/** ---- Types for Authentication (Cognito session/identity tokens only) ---- */
export type Role = "admin" | "designer" | "builder" | "vendor" | "client" | string;

export interface CognitoUser {
  userId: string;
  role?: Role;
  // Minimal user identity from Cognito tokens only
}

export type AuthStatus = "signedOut" | "signedIn" | "incompleteProfile";

export interface AuthContextValue {
  // Authentication state (session/identity tokens)
  isAuthenticated: boolean;
  authStatus: AuthStatus;
  cognitoUser: CognitoUser | null;
  loading: boolean;

  // derived from Cognito tokens
  userId?: string;
  role?: Role;

  // actions
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  setAuthStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
  setCognitoUser: React.Dispatch<React.SetStateAction<CognitoUser | null>>;
  validateAndSetUserSession: (label?: string) => Promise<void>;
  getCurrentUser: typeof amplifyGetCurrentUser;
  getAuthTokens: () => Promise<Awaited<ReturnType<typeof fetchAuthSession>>["tokens"] | null>;
  globalSignOut: () => Promise<void>;
  updateUserCognitoAttributes: (userAttributes: Record<string, string>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);










// src/app/contexts/AuthContext.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  PropsWithChildren,
  useMemo,
} from "react";
import {
  fetchAuthSession,
  getCurrentUser as amplifyGetCurrentUser,
  updateUserAttributes,
  signOut,
} from "aws-amplify/auth";
import { secureWebSocketAuth } from "../../shared/utils/secureWebSocketAuth";
import { csrfProtection, logSecurityEvent } from "../../shared/utils/securityUtils";
import { AuthContext, AuthContextValue, AuthStatus, Role, CognitoUser } from "./AuthContextValue";
import { getDevPreviewData, isPreviewModeEnabled, subscribeToPreviewMode } from "@/shared/utils/devPreview";

export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("signedOut");
  const [cognitoUser, setCognitoUser] = useState<CognitoUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<boolean>(() => isPreviewModeEnabled());

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return subscribeToPreviewMode(() => {
      setPreviewMode(isPreviewModeEnabled());
    });
  }, []);

  // Debug (keep while migrating; remove later)
  useEffect(() => {
    console.log("[AuthContext]", { isAuthenticated, authStatus, cognitoUser, loading, previewMode });
  }, [isAuthenticated, authStatus, cognitoUser, loading, previewMode]);

  const validateAndSetUserSession = useCallback(async (label = "default") => {
    if (previewMode) {
      const previewUser = getDevPreviewData().user;
      setIsAuthenticated(true);
      setAuthStatus("signedIn");
      setCognitoUser({ userId: previewUser.userId, role: previewUser.role as Role | undefined });
      return;
    }

    try {
      const session = await fetchAuthSession();
      const { accessToken, idToken } = session.tokens ?? {};
      if (!accessToken || !idToken) {
        setAuthStatus("signedOut");
        setIsAuthenticated(false);
        setCognitoUser(null);
        return;
      }

      const now = Date.now();
      const accessExp = (accessToken.payload.exp as number) * 1000;
      const idExp = (idToken.payload.exp as number) * 1000;
      if (accessExp <= now || idExp <= now) {
        setAuthStatus("signedOut");
        setIsAuthenticated(false);
        setCognitoUser(null);
        return;
      }

      const cognitoUserData = await amplifyGetCurrentUser();
      const role = (idToken.payload?.role as Role) ?? undefined;
      const userId =
        (idToken.payload?.['custom:userId'] as string) ||
        (idToken.payload?.sub as string) ||
        cognitoUserData?.username;

      // For auth context, we only care about Cognito identity
      setIsAuthenticated(true);
      setAuthStatus("signedIn");
      setCognitoUser({ userId, role });
    } catch (error) {
      console.error(`[validateAndSetUserSession:${label}] Error:`, error);
      setAuthStatus("signedOut");
      setIsAuthenticated(false);
      setCognitoUser(null);
    }
  }, [previewMode]);

  const getAuthTokens = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      if (!session?.tokens) throw new Error("No session tokens found");
      return session.tokens;
    } catch (error) {
      console.error("Error fetching auth session:", error);
      return null;
    }
  }, []);

  const globalSignOut = useCallback(async () => {
    try {
      await signOut({ global: true });
      setIsAuthenticated(false);
      setCognitoUser(null);
      secureWebSocketAuth.clearAllTokens();
      csrfProtection.clearToken();
      logSecurityEvent("user_logged_out");
    } catch (error: unknown) {
      console.error("Error during global sign out:", error);
      logSecurityEvent("logout_error", { error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  // periodic check
  useEffect(() => {
    if (previewMode) {
      validateAndSetUserSession();
      return;
    }
    validateAndSetUserSession();
    const id = setInterval(validateAndSetUserSession, 1000 * 60 * 45);
    return () => clearInterval(id);
  }, [validateAndSetUserSession, previewMode]);

  // initial
  useEffect(() => {
    (async () => {
      try {
        await validateAndSetUserSession();
      } finally {
        setLoading(false);
      }
    })();
  }, [validateAndSetUserSession]);

  // ---- derived values (memoized) ----
  const userId = cognitoUser?.userId;
  const role = cognitoUser?.role;

  const value = useMemo<AuthContextValue>(
    () => ({
      // Authentication state (session/identity tokens)
      isAuthenticated,
      authStatus,
      cognitoUser,
      loading,

      // derived from Cognito tokens
      userId,
      role,

      // actions
      setIsAuthenticated,
      setAuthStatus,
      setCognitoUser,
      validateAndSetUserSession,
      getCurrentUser: amplifyGetCurrentUser,
      getAuthTokens,
      globalSignOut,
      updateUserCognitoAttributes: async (userAttributes: Record<string, string>) => {
        await amplifyGetCurrentUser();
        await updateUserAttributes({ userAttributes });
      },
    }),
    [
      isAuthenticated,
      authStatus,
      cognitoUser,
      loading,
      userId,
      role,
      validateAndSetUserSession,
      getAuthTokens,
      globalSignOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;










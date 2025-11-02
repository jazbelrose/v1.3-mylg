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

  const EXPIRATION_BUFFER_MS = 60 * 1000; // 1 minute grace period

  const clearSessionState = useCallback(() => {
    setIsAuthenticated(false);
    setAuthStatus("signedOut");
    setCognitoUser(null);
    secureWebSocketAuth.clearAllTokens();
    csrfProtection.clearToken();
  }, []);

  const handleSessionSignOut = useCallback(
    async (context: string, error?: unknown) => {
      if (error) {
        console.error(`[${context}] Error:`, error);
      }

      try {
        await signOut({ global: false });
      } catch (signOutError) {
        console.error(`[${context}] signOut error:`, signOutError);
      } finally {
        clearSessionState();
      }
    },
    [clearSessionState]
  );

  const areTokensExpiring = useCallback(
    (tokens?: Awaited<ReturnType<typeof fetchAuthSession>>["tokens"]) => {
      if (!tokens?.accessToken || !tokens.idToken) {
        return true;
      }

      const parseExp = (value: unknown): number | null => {
        if (typeof value === "number") return value;
        if (typeof value === "string") {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };

      const accessExp = parseExp(tokens.accessToken.payload.exp);
      const idExp = parseExp(tokens.idToken.payload.exp);
      if (accessExp === null || idExp === null) {
        return true;
      }

      const now = Date.now();
      return accessExp * 1000 <= now + EXPIRATION_BUFFER_MS || idExp * 1000 <= now + EXPIRATION_BUFFER_MS;
    },
    [EXPIRATION_BUFFER_MS]
  );

  const fetchValidSessionTokens = useCallback(
    async (context: string) => {
      const loadSession = async (forceRefresh: boolean) =>
        fetchAuthSession(forceRefresh ? { forceRefresh: true } : undefined);

      try {
        let session = await loadSession(false);
        let tokens = session.tokens;

        if (areTokensExpiring(tokens)) {
          session = await loadSession(true);
          tokens = session.tokens;
        }

        if (areTokensExpiring(tokens)) {
          await handleSessionSignOut(`${context}:tokens_expired`);
          return null;
        }

        return tokens ?? null;
      } catch (error) {
        const errorName = (error as { name?: string })?.name;
        if (errorName === "NotAuthorizedException" || errorName === "InvalidParameterException") {
          await handleSessionSignOut(`${context}:not_authorized`, error);
        } else {
          console.error(`[${context}] Unexpected session error:`, error);
          clearSessionState();
        }

        return null;
      }
    },
    [areTokensExpiring, clearSessionState, handleSessionSignOut]
  );

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
      const tokens = await fetchValidSessionTokens(`validateAndSetUserSession:${label}`);
      if (!tokens) {
        return;
      }

      const { idToken } = tokens;

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
      await handleSessionSignOut(`validateAndSetUserSession:${label}`, error);
    }
  }, [fetchValidSessionTokens, handleSessionSignOut, previewMode]);

  const getAuthTokens = useCallback(async () => {
    try {
      const tokens = await fetchValidSessionTokens("getAuthTokens");
      if (!tokens) throw new Error("No session tokens found");
      return tokens;
    } catch (error) {
      console.error("Error fetching auth session:", error);
      return null;
    }
  }, [fetchValidSessionTokens]);

  const globalSignOut = useCallback(async () => {
    try {
      await signOut({ global: true });
      clearSessionState();
      logSecurityEvent("user_logged_out");
    } catch (error: unknown) {
      console.error("Error during global sign out:", error);
      logSecurityEvent("logout_error", { error: error instanceof Error ? error.message : String(error) });
    }
  }, [clearSessionState]);

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










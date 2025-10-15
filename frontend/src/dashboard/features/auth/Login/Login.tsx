import React, { useState, useEffect, FormEvent } from "react";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { useNavigate, Link } from "react-router-dom";
import {
  signIn,
  signOut,
  fetchAuthSession,
  getCurrentUser,
} from "aws-amplify/auth";
import Cookies from "js-cookie";
import { Alert, Button as AntButton } from "antd";
import { useAuth } from "@/app/contexts/useAuth";
import { useData } from "@/app/contexts/useData";
import SpinnerOverlay from "../../../../shared/ui/SpinnerOverlay";
import { Eye, EyeOff } from "lucide-react";
import styles from "../auth.module.css";
import VerificationCodeModal from "../../../../shared/ui/VerificationCodeModal";
import usePendingAuthChallenge from "../../../../shared/utils/usePendingAuthChallenge";
import normalizeCognitoError from "../../../../shared/utils/normalizeCognitoError";

interface ModalState {
  open: boolean;
  flow:
    | "CONFIRM_SIGN_IN_WITH_SMS_CODE"
    | "CONFIRM_SIGN_IN_WITH_TOTP_CODE"
    | "CONFIRM_SIGN_UP"
    | null;
  username: string;
  onResendMfa: (() => Promise<void>) | null;
}

type MFAStep =
  | "CONFIRM_SIGN_IN_WITH_SMS_CODE"
  | "CONFIRM_SIGN_IN_WITH_TOTP_CODE"
  | "CONFIRM_SIGN_UP";

interface PendingMFA {
  username: string;
  authFlow: MFAStep;
}

export function Login() {
  // Auth cleaner utility
  async function ensureCleanAuthState(targetUsername: string): Promise<string> {
    try {
      const current = await getCurrentUser();
      if (!targetUsername || current.username === targetUsername) {
        // already signed in as the same user → just finalize
        return "same-user-signed-in";
      }
      // signed in as a different user → clear first
      await signOut();
      return "signed-out";
    } catch {
      // not signed in
      return "no-session";
    }
  }

  const { isAuthenticated, validateAndSetUserSession } = useAuth();

  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [modal, setModal] = useState<ModalState>({
    open: false,
    flow: null,
    username: "",
    onResendMfa: null,
  });

  const navigate = useNavigate();
  const { opacity } = useData();
  const { pending: rawPending, savePending, clearPending } = usePendingAuthChallenge();
  const pending = rawPending as unknown as PendingMFA | null;
  const opacityClass = opacity === 1 ? "opacity-high" : "opacity-low";
  const pendingForUser = !!pending && pending.username === username;

  type MFAStep =
    | "CONFIRM_SIGN_IN_WITH_SMS_CODE"
    | "CONFIRM_SIGN_IN_WITH_TOTP_CODE"
    | "CONFIRM_SIGN_UP";

  const openVerificationModal = ({
    flow,
    username: name,
    onResendMfa,
  }: {
    flow: MFAStep;
    username: string;
    onResendMfa: () => Promise<void>;
  }) => {
    setModal({ open: true, flow, username: name, onResendMfa });
  };

  const closeVerificationModal = () =>
    setModal((m) => ({ ...m, open: false }));

  const finalizeSession = async () => {
    Cookies.set("myCookie", "newValue", {
      expires: 7,
      secure: true,
      sameSite: "Strict",
    });
    await fetchAuthSession();
    await validateAndSetUserSession();
    navigate("/dashboard", { replace: true });
  };

  const resendMfa = async (
    user: string = pending?.username || "",
    pass: string = password
  ) => {
    if (!user || !pass) return;
    setError("");
    setIsLoading(true);
    try {
      await ensureCleanAuthState(user); // clear ghost session if any
      const res = await signIn({ username: user, password: pass });
      const step = res.nextStep?.signInStep;
      if (step === "CONFIRM_SIGN_IN_WITH_SMS_CODE" || step === "CONFIRM_SIGN_IN_WITH_TOTP_CODE") {
        savePending({ authFlow: step, username: user });
      }
    } catch (e) {
      setError(normalizeCognitoError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async ({
    email,
    password: pass,
  }: {
    email: string;
    password: string;
  }) => {
    setError("");
    setIsLoading(true);
    try {
      const state = await ensureCleanAuthState(email);
      if (state === "same-user-signed-in") {
        await fetchAuthSession();
        await validateAndSetUserSession();
        navigate("/dashboard", { replace: true });
        return;
      }
      const res = await signIn({ username: email, password: pass });
      const step = res?.nextStep?.signInStep;

      if (res?.isSignedIn === false && step === "CONFIRM_SIGN_UP") {
        navigate("/email-verification", { replace: true, state: { email } });
        return;
      }

      if (step === "CONFIRM_SIGN_IN_WITH_SMS_CODE" || step === "CONFIRM_SIGN_IN_WITH_TOTP_CODE") {
        savePending({ authFlow: step, username: email });
        openVerificationModal({
          flow: step,
          username: email,
          onResendMfa: async () => {
            await resendMfa(email, pass);
          },
        });
        return;
      }

      await finalizeSession();
    } catch (e: unknown) {
      const error = e as { name?: string };
      if (error?.name === "UserNotConfirmedException") {
        navigate("/email-verification", { replace: true, state: { email } });
        return;
      }
      setError(normalizeCognitoError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (isAuthenticated) return;
    await handleSignIn({ email: username, password });
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const isFormValid = username.trim() && password.trim();

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendingForUser) {
      openVerificationModal({
        flow: pending!.authFlow,
        username: pending!.username,
        onResendMfa: async () => resendMfa(pending!.username, password),
      });
    } else {
      handleSubmit();
    }
  };

  return (
    <HelmetProvider>
      <Helmet>
        <title>Login | *MYLG!*</title>
        <meta
          name="description"
          content="Log in to your *MYLG!* account to manage creative projects effortlessly."
        />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className={`${opacityClass} ${styles.authPage}`}>
        {isLoading && <SpinnerOverlay />}

        <div className={styles.authCard}>
          <div className={styles.wordmark}>*MYLG!*</div>
          <h1 className={styles.authTitle}>Sign in</h1>
          <p className={styles.authSubtitle}>
            Please enter your login and password
          </p>

          {pending && (
            <Alert
              type="warning"
              message="We sent you a code"
              description={
                <div style={{ display: "flex", gap: 8 }}>
                  <AntButton
                    type="link"
                    onClick={() =>
                      openVerificationModal({
                        flow: pending.authFlow,
                        username: pending.username,
                        onResendMfa: async () =>
                          resendMfa(pending.username, password),
                      })
                    }
                  >
                    Enter code
                  </AntButton>
                  <AntButton
                    type="link"
                    onClick={() => resendMfa(pending.username, password)}
                  >
                    Resend
                  </AntButton>
                </div>
              }
              showIcon
              closable
              onClose={clearPending}
              style={{ marginBottom: 16 }}
            />
          )}

          <form className={styles.authForm} onSubmit={handleFormSubmit}>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email
              </label>
              <input
                id="email"
                aria-label="Email"
                type="email"
                autoComplete="email"
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <div className={styles.passwordWrapper}>
                <input
                  id="password"
                  aria-label="Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={`${styles.input} ${error ? styles.invalid : ""}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.toggle}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && <p className={styles.helper}>{error}</p>}

              {error?.toLowerCase().includes("already a signed in") && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={async () => {
                    await signOut();
                    clearPending();
                    setError("");
                  }}
                >
                  Not you? Switch account
                </button>
              )}
            </div>

            {pendingForUser ? (
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                onClick={() =>
                  openVerificationModal({
                    flow: pending!.authFlow,
                    username: pending!.username,
                    onResendMfa: async () =>
                      resendMfa(pending!.username, password),
                  })
                }
              >
                Enter code
              </button>
            ) : (
              <button
                type="submit"
                className={`${styles.button} ${styles.primary}`}
                disabled={!isFormValid}
              >
                Login
              </button>
            )}
          </form>

          <div className={styles.actions}>
            <Link
              to="/forgot-password"
              state={{ email: username }}
              className={styles.forgot}
            >
              Forgot password?
            </Link>
            <Link
              to="/register"
              state={{ email: username }}
              className={`${styles.button} ${styles.secondary}`}
            >
              Create an account
            </Link>
          </div>
        </div>

        <VerificationCodeModal
          open={modal.open}
          flow={modal.flow}
          username={modal.username}
          clearPending={clearPending}
          onResendMfa={modal.onResendMfa}
          onCancel={() => closeVerificationModal()}
          onSuccess={async () => {
            closeVerificationModal();
            if (modal.flow === "CONFIRM_SIGN_UP") {
              if (password) {
                setIsLoading(true);
                await handleSignIn({ email: username, password });
              }
            } else {
              await finalizeSession();
            }
          }}
        />
      </div>
    </HelmetProvider>
  );
}

export default Login;










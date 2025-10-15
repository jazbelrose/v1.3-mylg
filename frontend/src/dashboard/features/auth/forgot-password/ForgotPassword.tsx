import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { Eye, EyeOff } from 'lucide-react';
import styles from '../auth.module.css';

const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState('');

  const handleResetPassword = async () => {
    setError('');
    try {
      await resetPassword({ username: email });
      setStep(2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error sending reset code.';
      setError(message);
    }
  };

  const handleConfirmReset = async () => {
    setError('');
    if (!passwordRegex.test(newPassword)) {
      setError('Password must be at least 8 characters and include a number and special character');
      return;
    }
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
      setStep(3);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error resetting password.';
      setError(message);
    }
  };

  return (
    <HelmetProvider>
      <Helmet>
        <title>Forgot Password | *MYLG!*</title>
      </Helmet>
      <div className={styles.authPage}>
        <div className={styles.authCard}>
          <div className={styles.wordmark}>*MYLG!*</div>

          {step === 1 && (
            <>
              <h1 className={styles.authTitle}>Forgot your password?</h1>
              <p className={styles.authSubtitle}>
                Enter your email address below and we'll send you a link to reset it.
              </p>
              <form
                className={styles.authForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleResetPassword();
                }}
              >
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className={`${styles.button} ${styles.primary}`}
                  disabled={!email.trim()}
                >
                  Reset Password
                </button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className={styles.authTitle}>Check your email</h1>
              <p className={styles.authSubtitle}>
                Enter the verification code and your new password.
              </p>
              <form
                className={styles.authForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleConfirmReset();
                }}
              >
                <div className={styles.field}>
                  <label htmlFor="code" className={styles.label}>
                    Verification Code
                  </label>
                  <input
                    id="code"
                    aria-label="Verification Code"
                    className={styles.input}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="newPassword" className={styles.label}>
                    New Password
                  </label>
                  <div className={styles.passwordWrapper}>
                    <input
                      id="newPassword"
                      aria-label="New Password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className={styles.input}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className={styles.toggle}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className={`${styles.button} ${styles.primary}`}
                  disabled={!code.trim() || !newPassword.trim()}
                >
                  Submit New Password
                </button>
              </form>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className={styles.authTitle}>Password reset</h1>
              <p className={styles.authSubtitle}>
                Your password has been reset successfully.
              </p>
              <div className={styles.actions}>
                <Link to="/login" className={`${styles.button} ${styles.secondary}`}>
                  Login
                </Link>
              </div>
            </>
          )}

          {error && <p className={styles.helper}>{error}</p>}

          {step !== 3 && (
            <div className={styles.actions}>
              <Link to="/register" className={styles.forgot}>
                Create an account
              </Link>
              <Link to="/login" className={styles.forgot}>
                Already have an account? Login
              </Link>
            </div>
          )}
        </div>
      </div>
    </HelmetProvider>
  );
};

export default ForgotPassword;










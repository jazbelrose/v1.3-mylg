import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { confirmSignUp, resendSignUpCode, signIn, fetchAuthSession } from 'aws-amplify/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '@/app/contexts/useData';
import { updateUserProfile } from '../../../../shared/utils/api';
import { useAuth } from '@/app/contexts/useAuth';
import styles from '../auth.module.css';

interface RegistrationData {
  email: string;
  password: string;
  [key: string]: unknown;
}

interface EmailVerificationProps {
  registrationData?: RegistrationData;
  userEmail?: string;
}

const EmailVerification: React.FC<EmailVerificationProps> = ({ registrationData, userEmail }) => {
  const [otpInputs, setOtpInputs] = useState<string[]>(Array(6).fill(''));
  const [verificationStatus, setVerificationStatus] = useState('');
  const [resendStatus, setResendStatus] = useState<'sent' | 'error' | 'sending' | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const isVerifyingRef = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { opacity } = useData();
  const { validateAndSetUserSession } = useAuth();

  const derivedEmail =
    registrationData?.email ||
    userEmail ||
    ((location.state as { email?: string } | undefined)?.email);
  const opacityClass = opacity === 1 ? 'opacity-high' : 'opacity-low';

  const handleOtpInputChange = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 1);
    const newInputs = [...otpInputs];
    newInputs[index] = sanitized;
    setOtpInputs(newInputs);
    if (sanitized && index < otpInputs.length - 1) {
      document.getElementById(`input-${index + 1}`)?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData
      .getData('Text')
      .replace(/\D/g, '')
      .slice(0, otpInputs.length);
    if (!paste) return;
    const digits = paste.split('');
    const newInputs = [...otpInputs];
    digits.forEach((d, i) => {
      newInputs[i] = d;
    });
    setOtpInputs(newInputs);
    if (digits.length < otpInputs.length) {
      document.getElementById(`input-${digits.length}`)?.focus();
    }
  };

  const handleVerify = useCallback(async () => {
    if (!derivedEmail || isVerifyingRef.current) return;
    const code = otpInputs.join('');
    if (code.length < otpInputs.length) return;
    isVerifyingRef.current = true;
    setIsVerifying(true);
    setResendStatus(null);
    try {
      const { isSignUpComplete } = await confirmSignUp({
        username: derivedEmail,
        confirmationCode: code,
      });
      if (isSignUpComplete) {
        setVerificationStatus('Email successfully verified');
        if (registrationData) {
          await signIn({ username: derivedEmail, password: registrationData.password });
          const session = await fetchAuthSession();
          const sub = session.tokens?.idToken?.payload?.sub as string | undefined;
          const userId =
            (session.tokens?.idToken?.payload?.['custom:userId'] as string | undefined) ||
            sub;
          const { password: _unusedPassword, ...pendingData } = registrationData; // eslint-disable-line @typescript-eslint/no-unused-vars
          const profileData = { ...pendingData, userId, cognitoSub: sub };
          await updateUserProfile(profileData);
          await validateAndSetUserSession();
        }
        navigate('/dashboard');
      }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '';
        const lower = message.toLowerCase();
        const alreadyVerified =
          lower.includes('already confirmed') ||
          lower.includes('already verified') ||
          lower.includes('current status is confirmed');
        if (alreadyVerified) {
          setVerificationStatus('Email successfully verified');
          if (registrationData) {
            try {
              await signIn({ username: derivedEmail, password: registrationData.password });
              const session = await fetchAuthSession();
              const sub = session.tokens?.idToken?.payload?.sub as string | undefined;
              const userId =
                (session.tokens?.idToken?.payload?.['custom:userId'] as string | undefined) ||
                sub;
              const { password: _unusedPassword, ...pendingData } = registrationData; // eslint-disable-line @typescript-eslint/no-unused-vars
              const profileData = { ...pendingData, userId, cognitoSub: sub };
              await updateUserProfile(profileData);
              await validateAndSetUserSession();
            } catch {
              /* ignore */
            }
          }
          navigate('/dashboard');
        } else {
          setVerificationStatus(message || 'Verification failed.');
        }
      } finally {
        isVerifyingRef.current = false;
        setIsVerifying(false);
      }
  }, [derivedEmail, otpInputs, registrationData, navigate, validateAndSetUserSession]);

  useEffect(() => {
    if (otpInputs.every((d) => d !== '')) {
      handleVerify();
    }
  }, [otpInputs, handleVerify]);

  const handleResend = async () => {
    if (!derivedEmail) return;
    setResendStatus('sending');
    try {
      await resendSignUpCode({ username: derivedEmail });
      setResendStatus('sent');
      } catch {
        setResendStatus('error');
      }
  };

  return (
    <HelmetProvider>
      <Helmet>
        <title>Email Verification | *MYLG!*</title>
      </Helmet>
      <div className={`${opacityClass} ${styles.authPage}`}>
        <div className={styles.authCard}>
          <div className={styles.wordmark}>*MYLG!*</div>
          <h1 className={styles.authTitle}>Verify your email</h1>
          <p className={styles.authSubtitle}>
            Please enter the one-time password sent to <b>{derivedEmail}</b>
          </p>
          <form
            className={styles.authForm}
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify();
            }}
          >
            <div
              className={styles.field}
              style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}
            >
              {otpInputs.map((value, index) => (
                <input
                  key={index}
                  className={styles.input}
                  type="text"
                  maxLength={1}
                  id={`input-${index}`}
                  value={value}
                  onChange={(e) => handleOtpInputChange(index, e.target.value)}
                  onPaste={index === 0 ? handleOtpPaste : undefined}
                  autoFocus={index === 0}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  style={{ textAlign: 'center', width: '44px' }}
                />
              ))}
            </div>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={isVerifying}
            >
              Validate
            </button>
          </form>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.forgot}
              onClick={handleResend}
              disabled={resendStatus === 'sending'}
            >
              Resend code
            </button>
            {resendStatus === 'sent' && <span>Verification code sent.</span>}
            {resendStatus === 'error' && (
              <span className={styles.helper}>Failed to resend code.</span>
            )}
          </div>
          {verificationStatus && <p className={styles.helper}>{verificationStatus}</p>}
        </div>
      </div>
    </HelmetProvider>
  );
};

export default EmailVerification;










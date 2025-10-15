import React, { useState } from 'react';
import styles from '../auth.module.css';
import { confirmUserAttribute } from 'aws-amplify/auth';
import { useNavigate, useLocation } from 'react-router-dom';

const EmailChangeVerification: React.FC = () => {
  const [otpInputs, setOtpInputs] = useState<string[]>(Array(6).fill(''));
  const [verificationStatus, setVerificationStatus] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { newUserEmail } = (location.state as { newUserEmail?: string }) || {};

  const handleOtpInputChange = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 1);
    const newOtpInputs = [...otpInputs];
    newOtpInputs[index] = sanitized;
    setOtpInputs(newOtpInputs);
    if (sanitized && index < otpInputs.length - 1) {
      document.getElementById(`input-${index + 1}`)?.focus();
    }
    if (newOtpInputs.every((d) => d !== '')) {
      handleConfirmAttribute(newOtpInputs.join(''));
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('Text').replace(/\D/g, '').slice(0, otpInputs.length);
    if (!pasteData) return;
    const digits = pasteData.split('');
    const newInputs = [...otpInputs];
    for (let i = 0; i < digits.length; i++) {
      newInputs[i] = digits[i];
    }
    setOtpInputs(newInputs);
    if (digits.length === otpInputs.length) {
      handleConfirmAttribute(newInputs.join(''));
    } else {
      const nextIndex = digits.length < otpInputs.length ? digits.length : otpInputs.length - 1;
      document.getElementById(`input-${nextIndex}`)?.focus();
    }
  };

  const handleConfirmAttribute = async (code: string = otpInputs.join('')) => {
    try {
      await confirmUserAttribute({
        userAttributeKey: 'email',
        confirmationCode: code,
      });
      navigate('/dashboard');
    } catch (error) {
      console.error('Error confirming user attribute:', error);
      setVerificationStatus('Verification failed. Please check the code and try again.');
    }
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.wordmark}>*MYLG!*</div>
        <h1 className={styles.authTitle}>Verify your email</h1>
        <p className={styles.authSubtitle}>
          Please enter the one-time password sent to <b>{newUserEmail}</b>
        </p>
        <form
          className={styles.authForm}
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmAttribute();
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
            style={{ marginTop: '24px', width: '100%' }}
          >
            Validate
          </button>
        </form>
        {verificationStatus && <p className={styles.helper}>{verificationStatus}</p>}
      </div>
    </div>
  );
};

export default EmailChangeVerification;










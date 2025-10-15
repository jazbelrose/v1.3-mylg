import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Input, Button, Typography } from 'antd';
import type { InputRef } from 'antd';
import {
  confirmSignUp,
  confirmSignIn,
  resendSignUpCode,
} from 'aws-amplify/auth';

const { Paragraph, Text } = Typography;

const flowLabels = {
  CONFIRM_SIGN_IN_WITH_SMS_CODE: 'verification code',
  CONFIRM_SIGN_IN_WITH_TOTP_CODE: 'authenticator code',
  CONFIRM_SIGN_UP: 'confirmation code',
} as const;

type FlowType = keyof typeof flowLabels;

interface VerificationCodeModalProps {
  open: boolean;
  flow: FlowType;
  username: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  clearPending?: () => void;
  onResendMfa?: () => Promise<void>;
}

export default function VerificationCodeModal({
  open,
  flow,
  username,
  onSuccess,
  onCancel,
  clearPending,
  onResendMfa,
}: VerificationCodeModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      inputRef.current?.focus();
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const numericCode = (code || '').replace(/\D/g, '');
    if (!numericCode) {
      Modal.warning({ title: 'Enter code', content: 'Please enter the code to continue.' });
      return;
    }
    setLoading(true);
    try {
      if (flow === 'CONFIRM_SIGN_UP') {
        await confirmSignUp({ username, confirmationCode: numericCode });
      } else {
        await confirmSignIn({ challengeResponse: numericCode });
      }
      clearPending?.();
      onSuccess?.();
    } catch (e: unknown) {
      const error = e as { message?: string };
      Modal.error({ title: 'Error', content: error?.message || 'Invalid code. Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [code, flow, username, onSuccess, clearPending]);

  const handleResend = useCallback(async () => {
    try {
      if (flow === 'CONFIRM_SIGN_UP') {
        await resendSignUpCode({ username });
        Modal.success({ title: 'Code resent', content: 'A new confirmation code was sent to your email.' });
      } else {
        if (onResendMfa) {
          await onResendMfa();
          Modal.success({ title: 'MFA code resent', content: 'Please check your device.' });
        } else {
          Modal.info({
            title: 'Resend code',
            content:
              'To resend an MFA code, please restart sign-in for this account so Cognito can send a new code.',
          });
        }
      }
    } catch (e: unknown) {
      const error = e as { message?: string };
      Modal.error({ title: 'Error', content: error?.message || 'Failed to resend code.' });
    }
  }, [flow, username, onResendMfa]);

  return (
    <Modal
      open={open}
      title="Enter code"
      onCancel={() => {
        clearPending?.();
        onCancel?.();
      }}
      onOk={handleSubmit}
      okText="Verify"
      confirmLoading={loading}
      maskClosable={false}
      destroyOnClose
    >
      <Paragraph>
        Enter the {flowLabels[flow] || 'code'} for <Text strong>{username}</Text>.
      </Paragraph>
      <Input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onPressEnter={handleSubmit}
        onPaste={(e) => {
          e.preventDefault();
          const pasted = e.clipboardData.getData('Text') || '';
          setCode(pasted.replace(/\D/g, '').slice(0, 6));
        }}
        placeholder="123456"
        maxLength={6}
        inputMode="numeric"
        autoComplete="one-time-code"
      />
      <div style={{ marginTop: 8 }}>
        <Button type="link" onClick={handleResend} style={{ paddingLeft: 0 }}>
          Didn’t get a code?
        </Button>
      </div>
    </Modal>
  );
}











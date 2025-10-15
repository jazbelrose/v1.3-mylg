// Register.test.tsx
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Register } from './Register';
import { signUp, resendSignUpCode } from '@aws-amplify/auth';
import { DataProvider } from '../../../../app/contexts/DataProvider';
import { AuthProvider } from '../../../../app/contexts/AuthContext';

vi.mock('@aws-amplify/auth', () => ({
  signUp: vi.fn(),
  resendSignUpCode: vi.fn(),
  getCurrentUser: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    username: 'testuser',
  }),
}));

vi.mock('../email-verification', () => ({
  __esModule: true,
  default: () => <div data-testid="email-verification">verification</div>,
}));

vi.mock('../../../app/contexts/useAuth', () => ({
  useAuth: () => ({ userId: 'test-user-id' }),
}));

vi.mock('../../../utils/api', () => ({
  REGISTERED_USER_TEAM_NOTIFICATION_API_URL: 'https://example.com',
  updateUserProfilePending: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
  useNavigate: vi.fn(),
  useLocation: vi.fn(() => ({ pathname: '/register' })),
}));

const mockedSignUp = signUp as ReturnType<typeof vi.fn>;
const mockedResend = resendSignUpCode as ReturnType<typeof vi.fn>;

describe('Register', () => {
  it('resends code when user already exists and shows verification', async () => {
    mockedSignUp.mockRejectedValue({ name: 'UsernameExistsException' } as Error);

    const { getByLabelText, getByText } = render(
      <AuthProvider>
        <DataProvider>
          <Register />
        </DataProvider>
      </AuthProvider>
    );

    fireEvent.change(getByLabelText('First Name'), { target: { value: 'John' } });
    fireEvent.change(getByLabelText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(getByLabelText('Phone Number'), { target: { value: '1234567890' } });
    fireEvent.change(getByLabelText('Password'), { target: { value: 'Passw0rd!' } });
    fireEvent.change(getByLabelText('Repeat Password'), { target: { value: 'Passw0rd!' } });

    fireEvent.click(getByText('Register Account'));

    await waitFor(() => {
      expect(mockedResend).toHaveBeenCalledWith({ username: 'test@example.com' });
      expect(screen.getByText('Verify your email')).toBeInTheDocument();
    });
  });
});










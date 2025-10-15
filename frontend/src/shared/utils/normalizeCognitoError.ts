interface CognitoError {
  name?: string;
  message?: string;
}

export default function normalizeCognitoError(error: unknown): string {
  if (!error) return 'An unknown error occurred';
  
  const map: Record<string, string> = {
    UserNotFoundException: 'User does not exist.',
    NotAuthorizedException: 'Incorrect username or password.',
    PasswordResetRequiredException: 'Password reset required.',
    NetworkError: 'Network error. Please try again.',
  };
  
  const cognitoError = error as CognitoError;
  return map[cognitoError.name || ''] || cognitoError.message || cognitoError.name || 'An unknown error occurred';
}









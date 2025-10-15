import { signOut } from 'aws-amplify/auth';
import Cookies from 'js-cookie';

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from './useAuth';

const useInactivityLogout = (): void => {
  const { isAuthenticated, setIsAuthenticated, setCognitoUser } = useAuth();
  const navigate = useNavigate();

  const INACTIVITY_TIME = 60 * 60 * 1000; // 1 hour in milliseconds

  useEffect(() => {
    let inactivityTimer: ReturnType<typeof setTimeout>;

    const handleSignOut = async () => {
      try {
        await signOut();
        setIsAuthenticated(false);
        setCognitoUser(null);
        navigate('/login');
        Cookies.remove('myCookie'); // If using cookies
      } catch (error) {
        console.error('Error during sign out:', error);
      }
    };

    const handleInactivity = () => {
      if (isAuthenticated) {
        void handleSignOut();
      }
    };

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(handleInactivity, INACTIVITY_TIME);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [isAuthenticated, setIsAuthenticated, setCognitoUser, navigate, INACTIVITY_TIME]);
};

export default useInactivityLogout;











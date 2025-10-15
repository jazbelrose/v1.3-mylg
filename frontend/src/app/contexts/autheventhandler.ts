import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hub } from 'aws-amplify/utils';
import { useAuth } from './useAuth';

const AuthEventHandler: React.FC = () => {
  const navigate = useNavigate();
  const { setIsAuthenticated, setCognitoUser } = useAuth();

  useEffect(() => {
    const listener = (data: { payload: { event: string } }) => {
      switch (data.payload.event) {
        case 'tokenRefresh_failure':
          setIsAuthenticated(false);
          setCognitoUser(null);
          navigate('/login');
          break;
        case 'signOut':
          setIsAuthenticated(false);
          setCognitoUser(null);
          navigate('/login');
          break;
        default:
          break;
      }
    };

    const unsubscribe = Hub.listen('auth', listener);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [navigate, setIsAuthenticated, setCognitoUser]);

  return null;
};

export default AuthEventHandler;











import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/contexts/useAuth';
import { isPreviewModeEnabled, subscribeToPreviewMode, syncPreviewModeFromSearch } from '@/shared/utils/devPreview';

interface ProtectedRouteProps {
  children: React.ReactElement;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { loading, authStatus } = useAuth();
  const location = useLocation();
  const [previewMode, setPreviewMode] = useState<boolean>(() => isPreviewModeEnabled());

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    syncPreviewModeFromSearch(location.search);
    setPreviewMode(isPreviewModeEnabled());
  }, [location.search]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return subscribeToPreviewMode(() => {
      setPreviewMode(isPreviewModeEnabled());
    });
  }, []);

  if (loading) {
    return <div style={{ padding: 24 }}>Checking session…</div>;
  }

  if (!previewMode && authStatus !== 'signedIn' && authStatus !== 'incompleteProfile') {
    return <Navigate to="/login" replace />;
  }

  return children;
}











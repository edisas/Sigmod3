import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

interface Props {
  children: ReactNode;
}

export default function LegacyProtectedRoute({ children }: Props) {
  const { isAuthenticated, isLoading } = useLegacyAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="size-8 border-2 border-slate-300 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/legacy/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

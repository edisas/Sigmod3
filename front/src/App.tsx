import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { LegacyAuthProvider } from '@/context/LegacyAuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import Icon from '@/components/ui/Icon';
import { adminProtectedRoutes, publicAuthRoutes } from '@/routes/adminRoutes';
import { legacyProtectedRoutes, legacyPublicRoutes } from '@/routes/legacyRoutes';

// Páginas de error también lazy — solo se cargan si el usuario aterriza ahí.
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ForbiddenPage = lazy(() => import('@/pages/ForbiddenPage'));
const ServerErrorPage = lazy(() => import('@/pages/ServerErrorPage'));
const ConnectionErrorPage = lazy(() => import('@/pages/ConnectionErrorPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Cargando">
      <span className="inline-flex items-center gap-3 text-slate-500 dark:text-slate-400">
        <Icon name="progress_activity" className="text-2xl animate-spin" />
        <span className="text-sm">Cargando…</span>
      </span>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LegacyAuthProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {publicAuthRoutes}
                {legacyPublicRoutes}
                {legacyProtectedRoutes}
                {adminProtectedRoutes}

                {/* Error Routes */}
                <Route path="/403" element={<ForbiddenPage />} />
                <Route path="/500" element={<ServerErrorPage />} />
                <Route path="/connection-error" element={<ConnectionErrorPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </LegacyAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

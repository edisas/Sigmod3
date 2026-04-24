import { lazy } from 'react';
import { Route } from 'react-router-dom';
import LegacyProtectedRoute from '@/components/auth/LegacyProtectedRoute';
import LegacyLayout from '@/components/layout/LegacyLayout';

// Cada página se carga on-demand al navegar a su ruta; el bundle inicial
// (~600kB antes) baja porque estas páginas grandes quedan en chunks aparte.
const LegacyLoginPage = lazy(() => import('@/pages/legacy/LegacyLoginPage'));
const LegacyDashboardPage = lazy(() => import('@/pages/legacy/LegacyDashboardPage'));
const ConcentradoEnLineaPage = lazy(() => import('@/pages/legacy/ConcentradoEnLineaPage'));
const ConcentradoEnLineaSemanalPage = lazy(() => import('@/pages/legacy/ConcentradoEnLineaSemanalPage'));
const HuertosPorPfaPage = lazy(() => import('@/pages/legacy/HuertosPorPfaPage'));
const InformeGeneralPfaPage = lazy(() => import('@/pages/legacy/InformeGeneralPfaPage'));
const RutasCatalogoPage = lazy(() => import('@/pages/legacy/RutasCatalogoPage'));
const CorreccionRevisionesTrampasPage = lazy(() => import('@/pages/legacy/CorreccionRevisionesTrampasPage'));
const CorreccionTrampasPage = lazy(() => import('@/pages/legacy/CorreccionTrampasPage'));
const DashboardTrampeosPage = lazy(() => import('@/pages/legacy/DashboardTrampeosPage'));
const DashboardMuestreoPage = lazy(() => import('@/pages/legacy/DashboardMuestreoPage'));
const CorreccionMuestreosPage = lazy(() => import('@/pages/legacy/CorreccionMuestreosPage'));
const CorreccionTmimfOFaltantesPage = lazy(() => import('@/pages/legacy/CorreccionTmimfOFaltantesPage'));

export const legacyPublicRoutes = [
  <Route key="legacy-login" path="/legacy/login" element={<LegacyLoginPage />} />,
];

export const legacyProtectedRoutes = (
  <Route
    element={
      <LegacyProtectedRoute>
        <LegacyLayout />
      </LegacyProtectedRoute>
    }
  >
    <Route path="/legacy" element={<LegacyDashboardPage />} />
    <Route path="/legacy/reportes/concentrado-en-linea" element={<ConcentradoEnLineaPage />} />
    <Route path="/legacy/reportes/concentrado-en-linea-semanal" element={<ConcentradoEnLineaSemanalPage />} />
    <Route path="/legacy/reportes/huertos-por-pfa" element={<HuertosPorPfaPage />} />
    <Route path="/legacy/reportes/informe-general-pfa" element={<InformeGeneralPfaPage />} />
    <Route path="/legacy/catalogos/rutas" element={<RutasCatalogoPage />} />
    <Route path="/legacy/correcciones/revisiones-trampas" element={<CorreccionRevisionesTrampasPage />} />
    <Route path="/legacy/correcciones/trampas" element={<CorreccionTrampasPage />} />
    <Route path="/legacy/dashboard-trampeos" element={<DashboardTrampeosPage />} />
    <Route path="/legacy/dashboard-muestreo" element={<DashboardMuestreoPage />} />
    <Route path="/legacy/correcciones/muestreos" element={<CorreccionMuestreosPage />} />
    <Route path="/legacy/correcciones/tmimf-o-faltantes" element={<CorreccionTmimfOFaltantesPage />} />
  </Route>
);

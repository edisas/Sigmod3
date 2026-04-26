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
const TmimfsEmitidasPage = lazy(() => import('@/pages/legacy/TmimfsEmitidasPage'));
const InventarioPorPfaPage = lazy(() => import('@/pages/legacy/InventarioPorPfaPage'));
const InformeSemanalTrampeoPage = lazy(() => import('@/pages/legacy/InformeSemanalTrampeoPage'));
const InformesSemanalesEstadoPage = lazy(() => import('@/pages/legacy/InformesSemanalesEstadoPage'));
const ResumenDiarioModulosPage = lazy(() => import('@/pages/legacy/ResumenDiarioModulosPage'));
const EstimadoCosechaPfaPage = lazy(() => import('@/pages/legacy/EstimadoCosechaPfaPage'));
const DocumentosPorFechaPage = lazy(() => import('@/pages/legacy/DocumentosPorFechaPage'));
const DetalladoMovilizacionPage = lazy(() => import('@/pages/legacy/DetalladoMovilizacionPage'));
const CancelacionTmimfPage = lazy(() => import('@/pages/legacy/CancelacionTmimfPage'));
const EditarEstimadoCosechaPage = lazy(() => import('@/pages/legacy/EditarEstimadoCosechaPage'));
const CatalogosAuxiliaresPage = lazy(() => import('@/pages/legacy/CatalogosAuxiliaresPage'));
const CatalogoHuertosPage = lazy(() => import('@/pages/legacy/CatalogoHuertosPage'));

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
    <Route path="/legacy/reportes/tmimfs-emitidas" element={<TmimfsEmitidasPage />} />
    <Route path="/legacy/reportes/inventario-por-pfa" element={<InventarioPorPfaPage />} />
    <Route path="/legacy/reportes/informe-semanal-trampeo" element={<InformeSemanalTrampeoPage />} />
    <Route path="/legacy/reportes/informes-semanales-estado" element={<InformesSemanalesEstadoPage />} />
    <Route path="/legacy/reportes/resumen-diario-modulos" element={<ResumenDiarioModulosPage />} />
    <Route path="/legacy/reportes/estimado-cosecha-pfa" element={<EstimadoCosechaPfaPage />} />
    <Route path="/legacy/reportes/documentos-por-fecha" element={<DocumentosPorFechaPage />} />
    <Route path="/legacy/reportes/detallado-movilizacion" element={<DetalladoMovilizacionPage />} />
    <Route path="/legacy/correcciones/cancelacion-tmimf" element={<CancelacionTmimfPage />} />
    <Route path="/legacy/correcciones/estimado-cosecha" element={<EditarEstimadoCosechaPage />} />
    <Route path="/legacy/catalogos/auxiliares" element={<CatalogosAuxiliaresPage />} />
    <Route path="/legacy/catalogos/huertos" element={<CatalogoHuertosPage />} />
  </Route>
);

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { LegacyAuthProvider } from '@/context/LegacyAuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import LegacyProtectedRoute from '@/components/auth/LegacyProtectedRoute';
import AdminLayout from '@/components/layout/AdminLayout';
import LegacyLayout from '@/components/layout/LegacyLayout';
import AuthLayout from '@/components/layout/AuthLayout';

// Pages
import DashboardPage from '@/pages/DashboardPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import AccessRequestPage from '@/pages/AccessRequestPage';
import RequestsListPage from '@/pages/RequestsListPage';
import ProfilePage from '@/pages/ProfilePage';
import CatalogEstadosPage from '@/pages/CatalogEstadosPage';
import CatalogEstadoFormPage from '@/pages/CatalogEstadoFormPage';
import CatalogMunicipiosPage from '@/pages/CatalogMunicipiosPage';
import CatalogMunicipioFormPage from '@/pages/CatalogMunicipioFormPage';
import CatalogLocalidadesPage from '@/pages/CatalogLocalidadesPage';
import CatalogLocalidadFormPage from '@/pages/CatalogLocalidadFormPage';
import CatalogTiposFcoopPage from '@/pages/CatalogTiposFcoopPage';
import CatalogTipoFcoopFormPage from '@/pages/CatalogTipoFcoopFormPage';
import CatalogFigurasCooperadorasPage from '@/pages/CatalogFigurasCooperadorasPage';
import CatalogFiguraCooperadoraFormPage from '@/pages/CatalogFiguraCooperadoraFormPage';
import FiguraCooperadoraAutorizacionPage from '@/pages/FiguraCooperadoraAutorizacionPage';
import AutorizacionesFcoopListPage from '@/pages/AutorizacionesFcoopListPage';
import SystemConfigPage from '@/pages/SystemConfigPage';
import MenuSettingsPage from '@/pages/MenuSettingsPage';
import EmptyStatePage from '@/pages/EmptyStatePage';
import LegacyLoginPage from '@/pages/legacy/LegacyLoginPage';
import LegacyDashboardPage from '@/pages/legacy/LegacyDashboardPage';
import ConcentradoEnLineaPage from '@/pages/legacy/ConcentradoEnLineaPage';
import ConcentradoEnLineaSemanalPage from '@/pages/legacy/ConcentradoEnLineaSemanalPage';
import HuertosPorPfaPage from '@/pages/legacy/HuertosPorPfaPage';
import InformeGeneralPfaPage from '@/pages/legacy/InformeGeneralPfaPage';
import RutasCatalogoPage from '@/pages/legacy/RutasCatalogoPage';
import CorreccionRevisionesTrampasPage from '@/pages/legacy/CorreccionRevisionesTrampasPage';
import CorreccionTrampasPage from '@/pages/legacy/CorreccionTrampasPage';
import NotFoundPage from '@/pages/NotFoundPage';
import ForbiddenPage from '@/pages/ForbiddenPage';
import ServerErrorPage from '@/pages/ServerErrorPage';
import ConnectionErrorPage from '@/pages/ConnectionErrorPage';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LegacyAuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Legacy (SIGMOD 2) — auth independiente */}
            <Route path="/legacy/login" element={<LegacyLoginPage />} />
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
            </Route>

            {/* Protected Admin Routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/solicitudes" element={<RequestsListPage />} />
              <Route path="/solicitud-acceso" element={<AccessRequestPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/catalogos/estados" element={<CatalogEstadosPage />} />
              <Route path="/catalogos/estados/nuevo" element={<CatalogEstadoFormPage />} />
              <Route path="/catalogos/estados/:estadoId/editar" element={<CatalogEstadoFormPage />} />
              <Route path="/catalogos/municipios" element={<CatalogMunicipiosPage />} />
              <Route path="/catalogos/municipios/nuevo" element={<CatalogMunicipioFormPage />} />
              <Route path="/catalogos/municipios/:municipioId/editar" element={<CatalogMunicipioFormPage />} />
              <Route path="/catalogos/localidades" element={<CatalogLocalidadesPage />} />
              <Route path="/catalogos/localidades/nuevo" element={<CatalogLocalidadFormPage />} />
              <Route path="/catalogos/localidades/:localidadId/editar" element={<CatalogLocalidadFormPage />} />
              <Route path="/catalogos/tipos-fcoop" element={<CatalogTiposFcoopPage />} />
              <Route path="/catalogos/tipos-fcoop/nuevo" element={<CatalogTipoFcoopFormPage />} />
              <Route path="/catalogos/tipos-fcoop/:tipoId/editar" element={<CatalogTipoFcoopFormPage />} />
              <Route path="/catalogos/figuras-cooperadoras" element={<CatalogFigurasCooperadorasPage />} />
              <Route path="/catalogos/figuras-cooperadoras/nuevo" element={<CatalogFiguraCooperadoraFormPage />} />
              <Route path="/catalogos/figuras-cooperadoras/:figuraId/editar" element={<CatalogFiguraCooperadoraFormPage />} />
              <Route path="/configuracion/sistema" element={<SystemConfigPage />} />
              <Route path="/configuracion/menus" element={<MenuSettingsPage />} />
              <Route path="/autorizaciones/figura-cooperadora/listado" element={<AutorizacionesFcoopListPage />} />
              <Route path="/autorizaciones/figura-cooperadora" element={<FiguraCooperadoraAutorizacionPage />} />
              <Route path="/map" element={<EmptyStatePage />} />
              <Route path="/analytics" element={<EmptyStatePage />} />
              <Route path="/sensors" element={<EmptyStatePage />} />
              <Route path="/sustainability" element={<EmptyStatePage />} />
              <Route path="/settings" element={<EmptyStatePage />} />
            </Route>

            {/* Error Routes */}
            <Route path="/403" element={<ForbiddenPage />} />
            <Route path="/500" element={<ServerErrorPage />} />
            <Route path="/connection-error" element={<ConnectionErrorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
        </LegacyAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

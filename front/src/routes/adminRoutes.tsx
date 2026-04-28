import { lazy } from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AdminLayout from '@/components/layout/AdminLayout';
import AuthLayout from '@/components/layout/AuthLayout';

// Lazy para code splitting — bundle inicial solo trae root + login.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const AccessRequestPage = lazy(() => import('@/pages/AccessRequestPage'));
const RequestsListPage = lazy(() => import('@/pages/RequestsListPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const CatalogEstadosPage = lazy(() => import('@/pages/CatalogEstadosPage'));
const CatalogEstadoFormPage = lazy(() => import('@/pages/CatalogEstadoFormPage'));
const CatalogMunicipiosPage = lazy(() => import('@/pages/CatalogMunicipiosPage'));
const CatalogMunicipioFormPage = lazy(() => import('@/pages/CatalogMunicipioFormPage'));
const CatalogLocalidadesPage = lazy(() => import('@/pages/CatalogLocalidadesPage'));
const CatalogLocalidadFormPage = lazy(() => import('@/pages/CatalogLocalidadFormPage'));
const CatalogTiposFcoopPage = lazy(() => import('@/pages/CatalogTiposFcoopPage'));
const CatalogTipoFcoopFormPage = lazy(() => import('@/pages/CatalogTipoFcoopFormPage'));
const CatalogFigurasCooperadorasPage = lazy(() => import('@/pages/CatalogFigurasCooperadorasPage'));
const CatalogFiguraCooperadoraFormPage = lazy(() => import('@/pages/CatalogFiguraCooperadoraFormPage'));
const CatalogosAuxiliaresPage = lazy(() => import('@/pages/CatalogosAuxiliaresPage'));
const SelectStatePage = lazy(() => import('@/pages/SelectStatePage'));
const ProductoresPage = lazy(() => import('@/pages/ProductoresPage'));
const UnidadesProduccionPage = lazy(() => import('@/pages/UnidadesProduccionPage'));
const RutasPage = lazy(() => import('@/pages/RutasPage'));
const TramperosPage = lazy(() => import('@/pages/TramperosPage'));
const TiposTrampaPage = lazy(() => import('@/pages/TiposTrampaPage'));
const TrampasPage = lazy(() => import('@/pages/TrampasPage'));
const RevisionesPage = lazy(() => import('@/pages/RevisionesPage'));
const IdentificacionesPage = lazy(() => import('@/pages/IdentificacionesPage'));
const FiguraCooperadoraAutorizacionPage = lazy(() => import('@/pages/FiguraCooperadoraAutorizacionPage'));
const AutorizacionesFcoopListPage = lazy(() => import('@/pages/AutorizacionesFcoopListPage'));
const SystemConfigPage = lazy(() => import('@/pages/SystemConfigPage'));
const MenuSettingsPage = lazy(() => import('@/pages/MenuSettingsPage'));
const EmptyStatePage = lazy(() => import('@/pages/EmptyStatePage'));

export const publicAuthRoutes = (
  <Route element={<AuthLayout />}>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/select-state" element={<SelectStatePage />} />
  </Route>
);

export const adminProtectedRoutes = (
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
    <Route path="/catalogos/auxiliares" element={<CatalogosAuxiliaresPage />} />
    <Route path="/catalogos/auxiliares/:slug" element={<CatalogosAuxiliaresPage />} />
    <Route path="/productores" element={<ProductoresPage />} />
    <Route path="/unidades-produccion" element={<UnidadesProduccionPage />} />
    <Route path="/rutas" element={<RutasPage />} />
    <Route path="/tramperos" element={<TramperosPage />} />
    <Route path="/tipos-trampa" element={<TiposTrampaPage />} />
    <Route path="/trampas" element={<TrampasPage />} />
    <Route path="/revisiones" element={<RevisionesPage />} />
    <Route path="/identificaciones" element={<IdentificacionesPage />} />
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
);

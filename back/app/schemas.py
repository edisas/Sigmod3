from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    facility: str | None = Field(default=None, max_length=120)
    estados_ids: list[int] = Field(default_factory=list)
    rol_id: int
    figura_cooperadora_id: int | None = None
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    nombre_usuario: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=4, max_length=128)


class SelectStateRequest(BaseModel):
    state_selection_token: str = Field(min_length=20)
    estado_id: int


class SwitchStateRequest(BaseModel):
    estado_id: int


class StateResponse(BaseModel):
    id: int
    clave: str
    nombre: str


class UserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    initials: str
    phone: str | None = None
    bio: str | None = None
    facility: str | None = None
    sector: str | None = None


class TokenResponse(BaseModel):
    access_token: str | None = None
    token_type: str | None = "bearer"
    requires_state_selection: bool = False
    state_selection_token: str | None = None
    available_states: list[StateResponse] = Field(default_factory=list)
    active_state: StateResponse | None = None
    user: UserResponse


class MeResponse(BaseModel):
    user: UserResponse
    active_state: StateResponse | None = None
    available_states: list[StateResponse] = Field(default_factory=list)


class RegionTecnicaResponse(BaseModel):
    id: int
    nombre: str


class TemporadaResponse(BaseModel):
    id: int
    nombre: str
    nombre_corto: str


class RolResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None


class SolicitudCatalogosResponse(BaseModel):
    roles_registro: list[RolResponse]
    estados_usuario: list[StateResponse]
    regiones_tecnicas: list[RegionTecnicaResponse]
    temporadas: list[TemporadaResponse]


class MunicipioResponse(BaseModel):
    id: int
    nombre: str


class LocalidadResponse(BaseModel):
    id: int
    nombre: str
    municipio_id: int
    municipio_nombre: str


class ModuloResponse(BaseModel):
    id: int
    nombre: str


class SolicitudAccesoCreateRequest(BaseModel):
    rol_id: int
    estado_id: int
    localidad_id: int
    modulo_ids: list[int] = Field(default_factory=list)
    region_tecnica_id: int
    temporada_id: int
    fecha_solicitud: date
    fecha_inicio_servicios: date
    fecha_inicio_operacion: date
    municipios_ids: list[int] = Field(min_length=1)
    correo_notificacion: EmailStr


class SolicitudDocumentoResponse(BaseModel):
    solicitud_id: int
    estado_id: int
    estado_nombre: str
    codigo_unico: str
    estatus_proceso: str
    download_url: str
    firmado_subido: bool
    editable_regenerable: bool = False
    motivo_no_editable: str | None = None
    fecha_carga_firmado: datetime | None = None


class SolicitudAccesoCreateResponse(BaseModel):
    folio_grupo: str
    documentos: list[SolicitudDocumentoResponse]


class SolicitudListadoItem(BaseModel):
    solicitud_id: int
    temporada_id: int
    temporada_nombre: str
    temporada_nombre_corto: str
    estado_id: int
    estado_nombre: str
    rol_id: int | None = None
    rol_nombre: str | None = None
    estatus_proceso: str
    estatus_id: int
    vigente: bool
    editable: bool
    download_url: str
    fecha_solicitud: date
    fecha_actualizacion: datetime


class SolicitudFormResponse(BaseModel):
    solicitud_id: int
    rol_id: int
    estado_id: int
    localidad_id: int
    modulo_ids: list[int] = Field(default_factory=list)
    region_tecnica_id: int
    temporada_id: int
    fecha_solicitud: date
    fecha_inicio_servicios: date
    fecha_inicio_operacion: date
    municipios_ids: list[int] = Field(default_factory=list)
    correo_notificacion: str
    estatus_proceso: str
    editable: bool


class RoutingHintResponse(BaseModel):
    redirect_to: str
    has_generated: bool
    has_validated_active: bool


class CargarFirmadoResponse(BaseModel):
    solicitud_id: int
    codigo_unico: str
    estatus_proceso: str
    archivo_firmado: str


class CatalogEstadoBase(BaseModel):
    clave: str = Field(min_length=1, max_length=2)
    nombre: str = Field(min_length=1, max_length=45)
    abreviatura: str = Field(min_length=1, max_length=10)
    estatus_id: int = 1
    participa_sigmod: int = Field(default=1, ge=0, le=1)


class CatalogEstadoCreate(CatalogEstadoBase):
    pass


class CatalogEstadoUpdate(CatalogEstadoBase):
    pass


class CatalogEstadoResponse(CatalogEstadoBase):
    id: int


class CatalogMunicipioBase(BaseModel):
    estado_id: int
    clave: str = Field(min_length=1, max_length=3)
    nombre: str = Field(min_length=1, max_length=100)
    clave_geo: str = Field(min_length=1, max_length=6)
    estatus_id: int = 1


class CatalogMunicipioCreate(CatalogMunicipioBase):
    pass


class CatalogMunicipioUpdate(CatalogMunicipioBase):
    pass


class CatalogMunicipioResponse(CatalogMunicipioBase):
    id: int
    estado_nombre: str | None = None


class CatalogLocalidadBase(BaseModel):
    municipio_id: int | None = None
    estado_id: int
    nombre: str = Field(min_length=1, max_length=50)
    clave_geo: int
    latitud: float | None = None
    longitud: float | None = None
    altitud: float | None = None
    estatus_id: int = 1


class CatalogLocalidadCreate(CatalogLocalidadBase):
    pass


class CatalogLocalidadUpdate(CatalogLocalidadBase):
    pass


class CatalogLocalidadResponse(CatalogLocalidadBase):
    id: int
    municipio_nombre: str | None = None
    estado_nombre: str | None = None


class CatalogEstadoListResponse(BaseModel):
    items: list[CatalogEstadoResponse]
    total: int
    page: int
    page_size: int


class CatalogMunicipioListResponse(BaseModel):
    items: list[CatalogMunicipioResponse]
    total: int
    page: int
    page_size: int


class CatalogLocalidadListResponse(BaseModel):
    items: list[CatalogLocalidadResponse]
    total: int
    page: int
    page_size: int


class CatalogTipoFcoopBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=50)
    descripcion: str = Field(min_length=1, max_length=300)
    estatus_id: int = 1


class CatalogTipoFcoopCreate(CatalogTipoFcoopBase):
    pass


class CatalogTipoFcoopUpdate(CatalogTipoFcoopBase):
    pass


class CatalogTipoFcoopResponse(CatalogTipoFcoopBase):
    id: int


class CatalogTipoFcoopListResponse(BaseModel):
    items: list[CatalogTipoFcoopResponse]
    total: int
    page: int
    page_size: int


class CatalogFuncionarioOptionResponse(BaseModel):
    id: int
    nombre: str


class CatalogFiguraCooperadoraBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    nombre_corto: str = Field(min_length=1, max_length=30)
    tipo_figura_id: int
    domicilio: str = Field(min_length=1, max_length=300)
    localidad_id: int
    municipio_id: int
    estado_id: int
    correo_electronico: str = Field(min_length=1, max_length=100)
    telefono: str = Field(min_length=1, max_length=50)
    celular_contacto: str = Field(min_length=1, max_length=30)
    contacto_id: int
    estatus_id: int = 1


class CatalogFiguraCooperadoraCreate(CatalogFiguraCooperadoraBase):
    pass


class CatalogFiguraCooperadoraUpdate(CatalogFiguraCooperadoraBase):
    pass


class CatalogFiguraCooperadoraResponse(CatalogFiguraCooperadoraBase):
    id: int
    tipo_figura_nombre: str | None = None
    estado_nombre: str | None = None
    municipio_nombre: str | None = None
    localidad_nombre: str | None = None
    contacto_nombre: str | None = None


class CatalogFiguraCooperadoraListResponse(BaseModel):
    items: list[CatalogFiguraCooperadoraResponse]
    total: int
    page: int
    page_size: int


class CatalogCambioLogResponse(BaseModel):
    id: int
    catalogo: str
    registro_id: int
    accion: str
    usuario_id: int
    usuario_nombre: str | None = None
    estado_activo_id: int | None = None
    datos_anteriores: dict | None = None
    datos_nuevos: dict | None = None
    ip_origen: str | None = None
    created_at: datetime


class AutorizacionFiguraCatalogItem(BaseModel):
    id: int
    nombre: str


class AutorizacionFiguraEstadoItem(BaseModel):
    id: int
    clave: str
    nombre: str


class AutorizacionFiguraCatalogosResponse(BaseModel):
    figuras: list[AutorizacionFiguraCatalogItem]
    temporadas: list[AutorizacionFiguraCatalogItem]
    funcionarios: list[AutorizacionFiguraCatalogItem]
    estados: list[AutorizacionFiguraEstadoItem]


class AutorizacionFiguraResponse(BaseModel):
    id: int
    figura_cooperadora_id: int
    temporada_id: int
    fecha_inicio: date
    fecha_fin: date
    funcionario_autorizo_id: int
    clave_autorizacion: str
    estados_ids: list[int]
    observaciones: str | None = None
    oficio_nombre_original: str
    oficio_path: str
    json_detalles_autorizacion: dict


class AutorizacionFiguraListItem(BaseModel):
    id: int
    figura_cooperadora_id: int
    figura_cooperadora_nombre: str
    temporada_id: int
    temporada_nombre: str
    fecha_inicio: date
    fecha_fin: date
    funcionario_autorizo_id: int
    funcionario_autorizo_nombre: str
    clave_autorizacion: str | None = None
    estatus_id: int
    observaciones: str | None = None
    oficio_nombre_original: str | None = None
    created_at: datetime | None = None
    puede_revocar: bool


class AutorizacionFiguraRevocarResponse(BaseModel):
    autorizacion_id: int
    revocada_at: datetime
    revocada_por_usuario_id: int
    revocacion_oficio_path: str


# ---------------------------------------------------------------
# Catalogos auxiliares V3 nativos (Sprint 1 Fase 2)
# Esquema comun a los 10 catalogos: variedades, especies_mosca,
# vehiculos, hospederos, tipos_aplicacion, aplicadores, areas,
# empaques, productos, status_revision.
# ---------------------------------------------------------------


class CatalogAuxBase(BaseModel):
    clave: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9][a-z0-9_-]{0,39}$")
    nombre: str = Field(min_length=1, max_length=120)
    descripcion: str | None = Field(default=None, max_length=4000)
    estatus_id: int = 1


class CatalogAuxCreate(CatalogAuxBase):
    estados_aplicables: list[int] = Field(default_factory=list, max_length=64)


class CatalogAuxUpdate(CatalogAuxBase):
    # estados_aplicables=None significa "no tocar la pivote".
    # Lista (incluso vacia) significa "reescribir la pivote con estos ids".
    estados_aplicables: list[int] | None = Field(default=None, max_length=64)


class CatalogAuxResponse(CatalogAuxBase):
    id: int
    estados_aplicables: list[int] = Field(default_factory=list)
    estados_aplicables_nombres: list[str] = Field(default_factory=list)


class CatalogAuxListResponse(BaseModel):
    items: list[CatalogAuxResponse]
    total: int
    page: int
    page_size: int


class CatalogAuxCatalogoMeta(BaseModel):
    slug: str
    label: str


# ---------------------------------------------------------------
# Productores V3 nativos (Sprint 2.1.A)
# ---------------------------------------------------------------


class ProductorBase(BaseModel):
    tipo_persona: str = Field(min_length=1, max_length=45)
    rfc: str = Field(min_length=10, max_length=13)
    razon_social: str | None = Field(default=None, max_length=200)
    calle: str | None = Field(default=None, max_length=150)
    numero_interior: str | None = Field(default=None, max_length=45)
    numero_exterior: str | None = Field(default=None, max_length=45)
    colonia_id: int | None = None
    municipio_id: int | None = None
    estado_id: int | None = None
    codigo_postal: str | None = Field(default=None, max_length=5)
    telefono: str | None = Field(default=None, max_length=45)
    correo_electronico: str | None = Field(default=None, max_length=200)
    estatus_id: int = 1
    figura_cooperadora_id: int | None = None


class ProductorCreate(ProductorBase):
    pass


class ProductorUpdate(ProductorBase):
    pass


class ProductorResponse(ProductorBase):
    id: int
    estado_nombre: str | None = None
    municipio_nombre: str | None = None
    figura_cooperadora_nombre: str | None = None


class ProductorListResponse(BaseModel):
    items: list[ProductorResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Unidades de producción V3 (Sprint 2.1.B)
# La tabla legacy tiene 60+ columnas; aquí exponemos los campos
# esenciales para captura. El resto se mantiene para compatibilidad
# y se irá agregando por necesidad.
# ---------------------------------------------------------------


class UnidadProduccionBase(BaseModel):
    numero_inscripcion: str = Field(min_length=1, max_length=20)
    nombre_unidad: str | None = Field(default=None, max_length=100)
    productor_id: int | None = None
    figura_cooperadora_id: int | None = None
    nombre_propietario: str | None = Field(default=None, max_length=100)
    direccion: str | None = Field(default=None, max_length=150)
    telefono: str | None = Field(default=None, max_length=30)
    ubicacion: str | None = Field(default=None, max_length=150)
    municipio: str | None = Field(default=None, max_length=100)
    zona: str | None = Field(default=None, max_length=100)
    estado_id: int | None = None
    municipio_id: int | None = None
    especie_id: int | None = None
    tipo_unidad_id: int | None = None
    ruta_id: int | None = None
    mercado_id: int | None = None
    aprobado_exportacion: int = Field(default=0, ge=0, le=1)
    htl: int = Field(default=0, ge=0, le=1)
    activo: int = Field(default=1, ge=0, le=1)
    observaciones_sv02: str | None = Field(default=None, max_length=100)
    estatus_id: int = 1


class UnidadProduccionCreate(UnidadProduccionBase):
    pass


class UnidadProduccionUpdate(UnidadProduccionBase):
    pass


class UnidadProduccionResponse(UnidadProduccionBase):
    id: int
    productor_nombre: str | None = None
    figura_cooperadora_nombre: str | None = None
    estado_nombre: str | None = None
    municipio_nombre: str | None = None


class UnidadProduccionListResponse(BaseModel):
    items: list[UnidadProduccionResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Módulos V3 (Sprint 2.2) — lectura por ahora; CRUD full pendiente.
# ---------------------------------------------------------------


class ModuloOptionResponse(BaseModel):
    id: int
    nombre: str
    estado_id: int | None = None
    municipio_id: int | None = None
    estatus_id: int = 1
    estado_nombre: str | None = None


class ModuloListResponse(BaseModel):
    items: list[ModuloOptionResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Rutas de trampeo V3 (Sprint 2.2)
# ---------------------------------------------------------------


class RutaBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=50)
    modulo_id: int | None = None
    pfa_id: int | None = None
    fecha_primera_revision: date | None = None
    dia_revision: str | None = Field(default=None, max_length=10)
    tipo_folio: str | None = Field(default=None, max_length=10)
    inicial_ruta: str | None = Field(default=None, max_length=50)
    descripcion: str | None = Field(default=None, max_length=200)
    capturista_id: int | None = None
    trampero_id: int | None = None
    figura_cooperadora_id: int | None = None
    estado_id: int | None = None
    estatus_id: int = 1


class RutaCreate(RutaBase):
    pass


class RutaUpdate(RutaBase):
    pass


class RutaResponse(RutaBase):
    id: int
    estado_nombre: str | None = None
    modulo_nombre: str | None = None
    capturista_nombre: str | None = None
    trampero_nombre: str | None = None
    figura_cooperadora_nombre: str | None = None


class RutaListResponse(BaseModel):
    items: list[RutaResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Tramperos V3 (Sprint 2.3.A)
# ---------------------------------------------------------------


class TramperoBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=50)
    estado_id: int | None = None
    figura_cooperadora_id: int | None = None
    estatus_id: int = 1


class TramperoCreate(TramperoBase):
    pass


class TramperoUpdate(TramperoBase):
    pass


class TramperoResponse(TramperoBase):
    id: int
    estado_nombre: str | None = None
    figura_cooperadora_nombre: str | None = None


class TramperoListResponse(BaseModel):
    items: list[TramperoResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Tipos de trampa V3 (Sprint 2.3.A) — catálogo nacional
# ---------------------------------------------------------------


class TipoTrampaBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=25)
    descripcion: str | None = Field(default=None, max_length=200)
    estatus_id: int = 1


class TipoTrampaCreate(TipoTrampaBase):
    pass


class TipoTrampaUpdate(TipoTrampaBase):
    pass


class TipoTrampaResponse(TipoTrampaBase):
    id: int


class TipoTrampaListResponse(BaseModel):
    items: list[TipoTrampaResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Trampas V3 (Sprint 2.3.A) — recurso operativo
# ---------------------------------------------------------------


class TrampaBase(BaseModel):
    numero_trampa: str = Field(min_length=1, max_length=50)
    numero_trampa_ref: str | None = Field(default=None, max_length=15)
    ruta_id: int | None = None
    unidad_produccion_id: int | None = None
    figura_cooperadora_id: int | None = None
    tecnico_id: int | None = None
    hospedero_id: int | None = None
    area_id: int | None = None
    tipo_trampa_id: int | None = None
    latitud: float | None = None
    longitud: float | None = None
    altitud: int | None = None
    fecha_colocacion: date | None = None
    fecha_ultima_revision: date | None = None
    estado_id: int | None = None
    estatus_id: int = 1


class TrampaCreate(TrampaBase):
    pass


class TrampaUpdate(TrampaBase):
    pass


class TrampaResponse(TrampaBase):
    id: int
    estado_nombre: str | None = None
    ruta_nombre: str | None = None
    unidad_produccion_nombre: str | None = None
    unidad_produccion_ni: str | None = None
    tipo_trampa_nombre: str | None = None
    tecnico_nombre: str | None = None
    hospedero_nombre: str | None = None
    figura_cooperadora_nombre: str | None = None


class TrampaListResponse(BaseModel):
    items: list[TrampaResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Revisiones de trampas V3 (Sprint 2.3.B) — captura semanal
# ---------------------------------------------------------------


class RevisionBase(BaseModel):
    trampa_id: int
    numero_semana: int | None = Field(default=None, ge=1, le=53)
    fecha_revision: date | None = None
    status_revision_id: int | None = None
    tipo_producto: int | None = None
    dias_exposicion: int | None = Field(default=None, ge=0)
    observaciones: str | None = Field(default=None, max_length=200)
    validado: int = Field(default=0, ge=0, le=1)
    estatus_id: int = 1


class RevisionCreate(RevisionBase):
    pass


class RevisionUpdate(RevisionBase):
    pass


class RevisionResponse(RevisionBase):
    id: int
    trampa_numero: str | None = None
    trampa_estado_id: int | None = None
    status_revision_nombre: str | None = None


class RevisionListResponse(BaseModel):
    items: list[RevisionResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Identificaciones de trampa V3 (Sprint 2.3.B)
# Una por revisión × especie de mosca con conteos hembras/machos
# silvestre y estéril.
# ---------------------------------------------------------------


class IdentificacionBase(BaseModel):
    revision_id: int
    trampa_id: int | None = None
    numero_semana: int | None = Field(default=None, ge=1, le=53)
    especie_mosca_id: int | None = None
    hembras_silvestre: int = Field(default=0, ge=0)
    machos_silvestre: int = Field(default=0, ge=0)
    hembras_esteril: int = Field(default=0, ge=0)
    machos_esteril: int = Field(default=0, ge=0)
    tecnico_id: int | None = None
    fecha: date | None = None
    hora: str | None = None
    estatus_id: int = 1


class IdentificacionCreate(IdentificacionBase):
    pass


class IdentificacionUpdate(IdentificacionBase):
    pass


class IdentificacionResponse(IdentificacionBase):
    id: int
    trampa_numero: str | None = None
    trampa_estado_id: int | None = None
    especie_mosca_nombre: str | None = None
    tecnico_nombre: str | None = None


class IdentificacionListResponse(BaseModel):
    items: list[IdentificacionResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Dashboard V3 — KPIs y tablas agregadas (Sprint 7+8)
# ---------------------------------------------------------------


class DashboardKpi(BaseModel):
    label: str
    value: int
    change_pct: float | None = None  # vs semana anterior, opcional


class CapturasPorEspecie(BaseModel):
    especie_mosca_id: int | None
    especie_mosca_nombre: str | None
    hembras_silvestre: int
    machos_silvestre: int
    hembras_esteril: int
    machos_esteril: int
    total: int


class CapturasPorRuta(BaseModel):
    ruta_id: int | None
    ruta_nombre: str | None
    trampas: int
    revisiones: int
    capturas_total: int


class CapturasPorEstado(BaseModel):
    estado_id: int
    estado_nombre: str
    estado_clave: str
    trampas_activas: int
    revisiones_ultima_semana: int
    identificaciones_ultima_semana: int
    capturas_total_ultima_semana: int


class DashboardEstadoResponse(BaseModel):
    estado_id: int
    estado_nombre: str
    semana: int
    kpis: list[DashboardKpi]
    capturas_por_especie: list[CapturasPorEspecie]
    capturas_por_ruta: list[CapturasPorRuta]


class DashboardNacionalResponse(BaseModel):
    semana: int
    total_estados_activos: int
    kpis_globales: list[DashboardKpi]
    capturas_por_especie_global: list[CapturasPorEspecie]
    capturas_por_estado: list[CapturasPorEstado]


# ---------------------------------------------------------------
# TMIMF — Tarjeta de Movimiento Interestatal de Mercancías
# Fitosanitarias (Sprint 3.A)
# ---------------------------------------------------------------


class TmimfBase(BaseModel):
    folio_tmimf: str = Field(min_length=1, max_length=15)
    subfolio: int | None = None
    folio_original: str | None = Field(default=None, max_length=30)
    unidad_produccion_id: int | None = None
    tipo_tarjeta: str = Field(default="M", min_length=1, max_length=1)
    pais: str = Field(default="MEX", min_length=3, max_length=3)
    ruta_id: int | None = None
    modulo_emisor_id: int | None = None
    mercado_id: int | None = None
    tipo_transporte_id: int | None = None
    placas_transporte: str | None = Field(default=None, max_length=25)
    funcionario_aprobo_id: int | None = None
    semana: str | None = Field(default=None, max_length=10)
    fecha_emision: date | None = None
    hora_emision: str | None = None
    vigencia_tarjeta: int | None = None
    fecha_vencimiento: date | None = None
    clave_movilizacion: str = Field(default="", max_length=9)
    nombre_pfa: str | None = Field(default=None, max_length=80)
    cfmn: str | None = Field(default=None, max_length=40)
    estado_id: int | None = None
    estatus_bloqueo: str = Field(default="N", min_length=1, max_length=1)
    resuelto: int = Field(default=0, ge=0, le=1)
    facturado: int = Field(default=0, ge=0, le=1)
    estatus_id: int = 1


class TmimfCreate(TmimfBase):
    pass


class TmimfUpdate(TmimfBase):
    pass


class TmimfResponse(TmimfBase):
    id: int
    fecha_cancelacion: datetime | None = None
    motivo_cancelacion: str | None = None
    estado_nombre: str | None = None
    unidad_produccion_ni: str | None = None
    unidad_produccion_nombre: str | None = None
    ruta_nombre: str | None = None
    modulo_emisor_nombre: str | None = None
    mercado_nombre: str | None = None
    tipo_transporte_nombre: str | None = None
    funcionario_aprobo_nombre: str | None = None


class TmimfListResponse(BaseModel):
    items: list[TmimfResponse]
    total: int
    page: int
    page_size: int


class TmimfCancelRequest(BaseModel):
    motivo: str = Field(min_length=5, max_length=200)


class TmimfDetalleBase(BaseModel):
    sub_folio: int = Field(ge=0)
    unidad_produccion_id: int | None = None
    variedad_id: int | None = None
    cantidad_movilizada: float | None = None
    saldo: float = 0
    cajas_14: int | None = None
    cajas_15: int | None = None
    cajas_16: int | None = None
    cajas_18: int | None = None
    cajas_20: int | None = None
    cajas_25: int | None = None
    cajas_30: int | None = None
    granel: int | None = None
    tipo_vehiculo_id: int | None = None
    placas: str | None = Field(default=None, max_length=10)
    semana: int | None = None
    estatus_id: int = 1


class TmimfDetalleCreate(TmimfDetalleBase):
    pass


class TmimfDetalleUpdate(TmimfDetalleBase):
    pass


class TmimfDetalleResponse(TmimfDetalleBase):
    id: int
    tmimf_id: int
    estado_id: int | None = None
    variedad_nombre: str | None = None
    unidad_produccion_ni: str | None = None
    tipo_vehiculo_nombre: str | None = None


class TmimfDetalleListResponse(BaseModel):
    items: list[TmimfDetalleResponse]
    total: int


# ---------------------------------------------------------------
# Estados fenológicos (Sprint 3.B) — catálogo simple
# ---------------------------------------------------------------


class EstadoFenologicoOption(BaseModel):
    id: int
    descripcion: str
    clave: str | None = None
    estatus_id: int = 1


class EstadoFenologicoListResponse(BaseModel):
    items: list[EstadoFenologicoOption]
    total: int


# ---------------------------------------------------------------
# Estimados de cosecha (Sprint 3.B)
# ---------------------------------------------------------------


class EstimadoCosechaBase(BaseModel):
    unidad_produccion_id: int
    variedad_id: int
    superficie: float | None = None
    estimado: float | None = None
    kg_estimados: float = Field(default=0, ge=0)
    saldo: float | None = None
    fecha_estimacion: date | None = None
    estatus_id: int = 1


class EstimadoCosechaCreate(EstimadoCosechaBase):
    motivo: str | None = Field(default=None, max_length=200)


class EstimadoCosechaUpdate(EstimadoCosechaBase):
    motivo: str | None = Field(default=None, max_length=200)


class EstimadoCosechaResponse(EstimadoCosechaBase):
    id: int
    progresivo: int | None = None
    unidad_produccion_ni: str | None = None
    unidad_produccion_nombre: str | None = None
    variedad_nombre: str | None = None


class EstimadoCosechaListResponse(BaseModel):
    items: list[EstimadoCosechaResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Superficies registradas (Sprint 3.B)
# ---------------------------------------------------------------


class SuperficieRegistradaBase(BaseModel):
    unidad_produccion_id: int
    variedad_id: int
    superficie: float | None = None
    fenologia_id: int | None = None
    facturado: int = Field(default=0, ge=0, le=1)
    folio_factura: str | None = Field(default=None, max_length=45)
    ejercicio_fiscal: str | None = Field(default=None, max_length=4)
    estatus_id: int = 1


class SuperficieRegistradaCreate(SuperficieRegistradaBase):
    pass


class SuperficieRegistradaUpdate(SuperficieRegistradaBase):
    pass


class SuperficieRegistradaResponse(SuperficieRegistradaBase):
    id: int
    unidad_produccion_ni: str | None = None
    unidad_produccion_nombre: str | None = None
    variedad_nombre: str | None = None
    fenologia_descripcion: str | None = None


class SuperficieRegistradaListResponse(BaseModel):
    items: list[SuperficieRegistradaResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------
# Identificaciones de laboratorio (Sprint 4.A)
# ---------------------------------------------------------------


class IdentificacionLabBase(BaseModel):
    numero_muestra: str | None = Field(default=None, max_length=60)
    fecha_diseccion: date | None = None
    especie_mosca_id: int | None = None
    numero_larvas: int = Field(default=0, ge=0)
    larvas_1e: int = Field(default=0, ge=0)
    larvas_2e: int = Field(default=0, ge=0)
    larvas_3e: int = Field(default=0, ge=0)
    observaciones: str | None = Field(default=None, max_length=200)
    numero_semana: int | None = Field(default=None, ge=1, le=53)
    fecha: date | None = None
    hora: str | None = None
    area_id: int | None = None
    estado_id: int | None = None
    estatus_id: int = 1


class IdentificacionLabCreate(IdentificacionLabBase):
    pass


class IdentificacionLabUpdate(IdentificacionLabBase):
    pass


class IdentificacionLabResponse(IdentificacionLabBase):
    id: int
    especie_mosca_nombre: str | None = None
    area_nombre: str | None = None
    estado_nombre: str | None = None


class IdentificacionLabListResponse(BaseModel):
    items: list[IdentificacionLabResponse]
    total: int
    page: int
    page_size: int

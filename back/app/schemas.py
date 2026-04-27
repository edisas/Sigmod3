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

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Status(Base):
    __tablename__ = "estatus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(50), nullable=False)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mostrar_en_registro: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    estatus_id: Mapped[int] = mapped_column(ForeignKey("estatus.id"), default=1, nullable=False)


class User(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre_usuario: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    facility: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rol: Mapped[str] = mapped_column(String(20), default="admin", nullable=False)
    estatus_id: Mapped[int] = mapped_column(ForeignKey("estatus.id"), default=1, nullable=False)
    estado_id: Mapped[int | None] = mapped_column(ForeignKey("estados.id"), nullable=True)
    figura_cooperadora_id: Mapped[int | None] = mapped_column(ForeignKey("figura_cooperadora.id"), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    estados_asignados: Mapped[list["UserState"]] = relationship(
        back_populates="usuario", cascade="all, delete-orphan"
    )


class State(Base):
    __tablename__ = "estados"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clave: Mapped[str] = mapped_column(String(2), nullable=False)
    nombre: Mapped[str] = mapped_column(String(45), nullable=False)
    estatus_id: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    participa_sigmod: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    usuarios_asignados: Mapped[list["UserState"]] = relationship(back_populates="estado")


class Modulo(Base):
    __tablename__ = "modulos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)


class Localidad(Base):
    __tablename__ = "localidades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str | None] = mapped_column(String(50), nullable=True)


class UserState(Base):
    __tablename__ = "usuarios_detalle"
    __table_args__ = (UniqueConstraint("usuario_id", "estado_id", name="uk_usuarios_detalle_usuario_estado"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False, index=True)
    estado_id: Mapped[int] = mapped_column(ForeignKey("estados.id"), nullable=False, index=True)
    estatus_id: Mapped[int] = mapped_column(ForeignKey("estatus.id"), default=1, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    usuario: Mapped["User"] = relationship(back_populates="estados_asignados")
    estado: Mapped["State"] = relationship(back_populates="usuarios_asignados")


class RegionTecnica(Base):
    __tablename__ = "region_tecnica"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    funcionario_id: Mapped[int] = mapped_column(ForeignKey("funcionarios.id"), nullable=False)
    estatus_id: Mapped[int] = mapped_column(ForeignKey("estatus.id"), default=1, nullable=False)


class RegionTecnicaDetalle(Base):
    __tablename__ = "region_tecnica_detalle"
    __table_args__ = (UniqueConstraint("region_id", "estado_id", name="uk_region_tecnica_detalle"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("region_tecnica.id"), nullable=False)
    estado_id: Mapped[int] = mapped_column(ForeignKey("estados.id"), nullable=False)


class EstadoDetalle(Base):
    __tablename__ = "estados_detalle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    estado_id: Mapped[int] = mapped_column(ForeignKey("estados.id"), nullable=False, unique=True)
    refiaae_id: Mapped[int] = mapped_column(ForeignKey("funcionarios.id"), nullable=False)
    ccmfe_id: Mapped[int] = mapped_column(ForeignKey("funcionarios.id"), nullable=False)
    ricesav_id: Mapped[int] = mapped_column(ForeignKey("funcionarios.id"), nullable=False)
    estatus_id: Mapped[int] = mapped_column(ForeignKey("estatus.id"), default=1, nullable=False)


class Temporada(Base):
    __tablename__ = "temporadas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    nombre_corto: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    estatus_id: Mapped[int] = mapped_column(ForeignKey("estatus.id"), default=1, nullable=False)


class LegacyDatabase(Base):
    __tablename__ = "legacy_databases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clave: Mapped[str] = mapped_column(String(3), nullable=False, unique=True)
    nombre_estado: Mapped[str] = mapped_column(String(60), nullable=False)
    database_name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    activo: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SolicitudAcceso(Base):
    __tablename__ = "solicitud_accesos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    folio_grupo: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False, index=True)
    estado_id: Mapped[int] = mapped_column(ForeignKey("estados.id"), nullable=False, index=True)
    localidad_id: Mapped[int | None] = mapped_column(ForeignKey("localidades.id"), nullable=True)
    region_tecnica_id: Mapped[int] = mapped_column(ForeignKey("region_tecnica.id"), nullable=False)
    temporada_id: Mapped[int] = mapped_column(ForeignKey("temporadas.id"), nullable=False)
    rol_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id"), nullable=True)
    modulo_id: Mapped[int | None] = mapped_column(ForeignKey("modulos.id"), nullable=True)
    lugar_emision: Mapped[str] = mapped_column(String(120), nullable=False)
    fecha_solicitud: Mapped[str] = mapped_column(Date, nullable=False)
    fecha_inicio_servicios: Mapped[str] = mapped_column(Date, nullable=False)
    fecha_inicio_operacion: Mapped[str] = mapped_column(Date, nullable=False)
    tipo_solicitante: Mapped[str] = mapped_column(String(60), nullable=False)
    municipios: Mapped[str] = mapped_column(Text, nullable=False)
    modulo_captura: Mapped[str] = mapped_column(String(120), nullable=False)
    correo_notificacion: Mapped[str] = mapped_column(String(254), nullable=False)
    codigo_unico: Mapped[str] = mapped_column(String(24), nullable=False, unique=True, index=True)
    estatus_proceso: Mapped[str] = mapped_column(String(30), default="GENERADO", nullable=False)
    vigente: Mapped[int | None] = mapped_column(Integer, default=1, nullable=True)
    pdf_generado_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdf_firmado_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    archivo_firmado_nombre_original: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha_carga_firmado: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recibido_por_admin_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    fecha_recepcion_admin: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estatus_id: Mapped[int] = mapped_column(ForeignKey("estatus.id"), default=1, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

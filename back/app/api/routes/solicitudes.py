from __future__ import annotations

import secrets
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import bindparam, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import (
    CargarFirmadoResponse,
    LocalidadResponse,
    ModuloResponse,
    MunicipioResponse,
    RegionTecnicaResponse,
    RolResponse,
    SolicitudAccesoCreateRequest,
    SolicitudAccesoCreateResponse,
    SolicitudCatalogosResponse,
    SolicitudDocumentoResponse,
    SolicitudFormResponse,
    SolicitudListadoItem,
    StateResponse,
    RoutingHintResponse,
    TemporadaResponse,
)

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[3]
STORAGE_ROOT = BASE_DIR / "storage"
GENERATED_DIR = STORAGE_ROOT / "solicitudes_generadas"
SIGNED_DIR = STORAGE_ROOT / "solicitudes_firmadas"

def _ensure_storage() -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    SIGNED_DIR.mkdir(parents=True, exist_ok=True)


def _state_rows_for_user(db: Session, user_id: int) -> list[dict[str, int | str]]:
    try:
        rows = db.execute(
            text(
                """
                SELECT e.id, e.clave, e.nombre
                FROM estados e
                INNER JOIN usuarios_detalle ud ON ud.estado_id = e.id
                WHERE ud.usuario_id = :usuario_id
                  AND ud.estatus_id = 1
                  AND e.estatus_id = 1
                  AND e.mostrar_en_registro = 1
                ORDER BY e.nombre ASC
                """
            ),
            {"usuario_id": user_id},
        ).mappings().all()
    except SQLAlchemyError:
        rows = db.execute(
            text(
                """
                SELECT e.id, e.clave, e.nombre
                FROM estados e
                INNER JOIN usuarios_detalle ud ON ud.estado_id = e.id
                WHERE ud.usuario_id = :usuario_id
                  AND ud.estatus_id = 1
                  AND e.estatus_id = 1
                ORDER BY e.nombre ASC
                """
            ),
            {"usuario_id": user_id},
        ).mappings().all()
    return [dict(row) for row in rows]


def _state_allowed_for_user(user_states: list[dict[str, int | str]], estado_id: int) -> dict[str, int | str] | None:
    return next((s for s in user_states if int(s["id"]) == estado_id), None)


def _generate_unique_code(db: Session) -> str:
    while True:
        code = f"SGM-{secrets.token_hex(4).upper()}"
        exists = db.execute(
            text("SELECT 1 FROM solicitud_accesos WHERE codigo_unico = :code LIMIT 1"),
            {"code": code},
        ).first()
        if not exists:
            return code


def _draw_text(c: object, x: float, y: float, text_value: str, size: int = 11) -> None:
    c.setFont("Helvetica", size)
    c.drawString(x, y, text_value)


def _build_pdf(
    file_path: Path,
    codigo_unico: str,
    estado_nombre: str,
    region_nombre: str,
    jefe_region_nombre: str,
    payload: SolicitudAccesoCreateRequest,
    rol_nombre: str,
    lugar_emision: str,
    modulo_captura: str,
    municipios_texto: str,
    full_name: str,
    ccp_refiaae: str,
    ccp_ccmfe: str,
    ccp_ricesav: str,
    temporada_nombre_corto: str,
) -> None:
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falta dependencia reportlab. Ejecuta: pip install -r requirements.txt",
        ) from exc

    c = canvas.Canvas(str(file_path), pagesize=letter)
    width, height = letter

    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, height - 72, "Anexo 2")
    c.drawCentredString(width / 2, height - 96, "Solicitud de Clave de Acceso SIGMOD")

    _draw_text(c, 72, height - 140, f"Lugar y fecha: {lugar_emision}, {payload.fecha_solicitud.strftime('%d/%m/%Y')}")
    _draw_text(c, 72, height - 175, f"Ing. {jefe_region_nombre}")
    _draw_text(c, 72, height - 192, f"Jefe de Departamento de Supervision Tecnica de la Region {region_nombre}")

    cuerpo_1 = (
        f"En relacion al Plan de Trabajo para Tratamiento y Certificacion de Mangos Mexicanos a Estados Unidos, "
        f"temporada {temporada_nombre_corto}, notifico que a partir del {payload.fecha_inicio_servicios.strftime('%d/%m/%Y')} "
        f"prestare mis servicios como {rol_nombre} en los municipios de {municipios_texto}, "
        f"del Estado de {estado_nombre}."
    )
    c.setFont("Helvetica", 11)
    text_block = c.beginText(72, height - 230)
    text_block.setLeading(14)
    for line in _wrap_text(cuerpo_1, 92):
        text_block.textLine(line)
    c.drawText(text_block)

    cuerpo_2 = (
        f"Por lo anterior, solicito la asignacion de clave de acceso y contrasena para SIGMOD. "
        f"A partir del {payload.fecha_inicio_operacion.strftime('%d/%m/%Y')} ingresare la informacion en el modulo "
        f"{modulo_captura}."
    )
    text_block = c.beginText(72, height - 310)
    text_block.setLeading(14)
    for line in _wrap_text(cuerpo_2, 92):
        text_block.textLine(line)
    c.drawText(text_block)

    _draw_text(c, 72, height - 365, "Asimismo, me comprometo a dar un buen uso de la clave asignada.")
    _draw_text(c, 72, height - 384, f"Correo electronico de notificacion: {payload.correo_notificacion}")
    _draw_text(c, 72, height - 424, "Sin otro particular le envio un cordial saludo.")

    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(width / 2, height - 470, "ATENTAMENTE")
    c.setFont("Helvetica", 11)
    c.drawCentredString(width / 2, height - 515, "____________________________________________")
    c.drawCentredString(width / 2, height - 532, full_name)
    c.drawCentredString(width / 2, height - 548, rol_nombre)

    c.setFont("Helvetica", 8)
    c.drawString(72, 72, f"C.c.p. {ccp_refiaae}")
    c.drawString(72, 60, f"C.c.p. {ccp_ccmfe}")
    c.drawString(72, 48, f"C.c.p. {ccp_ricesav}")

    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(width - 36, 24, f"Codigo unico: {codigo_unico}")

    c.showPage()
    c.save()


def _wrap_text(text_value: str, max_chars: int) -> list[str]:
    words = text_value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
            continue
        lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def _active_temporada_ids(db: Session) -> list[int]:
    rows = db.execute(
        text(
            """
            SELECT id
            FROM temporadas
            WHERE estatus_id = 1
            """
        )
    ).fetchall()
    return [int(row.id) for row in rows]


@router.get("/catalogos", response_model=SolicitudCatalogosResponse)
def catalogos(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> SolicitudCatalogosResponse:
    state_rows = _state_rows_for_user(db, current_user.id)

    region_rows = db.execute(
        text(
            """
            SELECT id, nombre
            FROM region_tecnica
            WHERE estatus_id = 1
            ORDER BY nombre ASC
            """
        )
    ).mappings().all()

    temporada_rows = db.execute(
        text(
            """
            SELECT id, nombre, nombre_corto
            FROM temporadas
            WHERE estatus_id = 1
            ORDER BY nombre ASC
            """
        )
    ).mappings().all()

    role_rows: list[dict[str, int | str | None]] = []
    try:
        role_rows = db.execute(
            text(
                """
                SELECT id, nombre, descripcion
                FROM roles
                WHERE mostrar_en_registro = 1
                  AND estatus_id = 1
                ORDER BY nombre ASC
                """
            )
        ).mappings().all()
    except SQLAlchemyError:
        role_rows = []

    return SolicitudCatalogosResponse(
        roles_registro=[
            RolResponse(id=int(r["id"]), nombre=str(r["nombre"]), descripcion=r["descripcion"])
            for r in role_rows
        ],
        estados_usuario=[StateResponse(id=int(r["id"]), clave=str(r["clave"]), nombre=str(r["nombre"])) for r in state_rows],
        regiones_tecnicas=[RegionTecnicaResponse(id=int(r["id"]), nombre=str(r["nombre"])) for r in region_rows],
        temporadas=[
            TemporadaResponse(id=int(r["id"]), nombre=str(r["nombre"]), nombre_corto=str(r["nombre_corto"]))
            for r in temporada_rows
        ],
    )


@router.get("/municipios", response_model=list[MunicipioResponse])
def municipios_por_estado(
    estado_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MunicipioResponse]:
    user_states = _state_rows_for_user(db, current_user.id)
    if not _state_allowed_for_user(user_states, estado_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso al estado seleccionado")

    try:
        rows = db.execute(
            text(
                """
                SELECT m.id, m.nombre
                FROM municipios m
                WHERE m.estado_id = :estado_id
                  AND m.estatus_id = 1
                ORDER BY m.nombre ASC
                """
            ),
            {"estado_id": estado_id},
        ).mappings().all()
    except SQLAlchemyError:
        rows = db.execute(
            text(
                """
                SELECT m.id, m.nombre
                FROM municipios m
                WHERE m.estado_id = :estado_id
                  AND m.activo = 1
                ORDER BY m.nombre ASC
                """
            ),
            {"estado_id": estado_id},
        ).mappings().all()
    return [MunicipioResponse(id=int(row["id"]), nombre=str(row["nombre"])) for row in rows]


@router.get("/localidades", response_model=list[LocalidadResponse])
def localidades_por_estado(
    estado_id: int,
    q: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LocalidadResponse]:
    user_states = _state_rows_for_user(db, current_user.id)
    if not _state_allowed_for_user(user_states, estado_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso al estado seleccionado")

    params: dict[str, object] = {"estado_id": estado_id}
    search_clause = ""
    if q:
        search_clause = " AND l.nombre LIKE :q "
        params["q"] = f"%{q.strip()}%"

    rows = db.execute(
        text(
            f"""
            SELECT l.id, l.nombre, l.municipio_id, m.nombre AS municipio_nombre
            FROM localidades l
            INNER JOIN municipios m ON m.id = l.municipio_id
            WHERE m.estado_id = :estado_id
            {search_clause}
            ORDER BY l.nombre ASC
            LIMIT 100
            """
        ),
        params,
    ).mappings().all()

    return [
        LocalidadResponse(
            id=int(row["id"]),
            nombre=str(row["nombre"]),
            municipio_id=int(row["municipio_id"]),
            municipio_nombre=str(row["municipio_nombre"]),
        )
        for row in rows
    ]


@router.get("/modulos", response_model=list[ModuloResponse])
def modulos_por_estado(
    estado_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ModuloResponse]:
    user_states = _state_rows_for_user(db, current_user.id)
    if not _state_allowed_for_user(user_states, estado_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso al estado seleccionado")

    rows: list[dict[str, int | str]] = []
    try:
        rows = db.execute(
            text(
                """
                SELECT DISTINCT m.id, m.nombre
                FROM modulos m
                LEFT JOIN municipios mu ON mu.id = m.municipio_id
                INNER JOIN usuarios_modulos um ON um.modulo_id = m.id
                WHERE um.usuario_id = :usuario_id
                  AND um.estatus_id = 1
                  AND m.estatus_id = 1
                  AND (m.estado_id = :estado_id OR (m.estado_id IS NULL AND mu.estado_id = :estado_id))
                ORDER BY m.nombre ASC
                """
            ),
            {"usuario_id": current_user.id, "estado_id": estado_id},
        ).mappings().all()
    except SQLAlchemyError:
        rows = []

    if not rows:
        rows = db.execute(
            text(
                """
                SELECT DISTINCT m.id, m.nombre
                FROM modulos m
                LEFT JOIN municipios mu ON mu.id = m.municipio_id
                WHERE m.estatus_id = 1
                  AND (m.estado_id = :estado_id OR (m.estado_id IS NULL AND mu.estado_id = :estado_id))
                ORDER BY m.nombre ASC
                """
            ),
            {"estado_id": estado_id},
        ).mappings().all()

    return [ModuloResponse(id=int(row["id"]), nombre=str(row["nombre"])) for row in rows]


@router.post("", response_model=SolicitudAccesoCreateResponse, status_code=status.HTTP_201_CREATED)
def crear_solicitud_acceso(
    payload: SolicitudAccesoCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SolicitudAccesoCreateResponse:
    try:
        role = db.execute(
            text(
                """
                SELECT id, nombre
                FROM roles
                WHERE id = :rol_id
                  AND mostrar_en_registro = 1
                  AND estatus_id = 1
                """
            ),
            {"rol_id": payload.rol_id},
        ).mappings().first()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Tabla roles no disponible. Ejecuta la migracion 2026-03-08_roles_registro.sql",
        ) from exc
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rol invalido para registro")
    rol_nombre = str(role["nombre"])
    rol_normalizado = rol_nombre.strip().lower()

    _ensure_storage()

    user_states = _state_rows_for_user(db, current_user.id)
    if not user_states:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario sin estados asignados")
    selected_state = _state_allowed_for_user(user_states, payload.estado_id)
    if not selected_state:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso al estado seleccionado")

    region = db.execute(
        text(
            """
            SELECT r.id, r.nombre, r.funcionario_id, COALESCE(f.nombre, 'SIN CONFIGURAR') AS funcionario_nombre
            FROM region_tecnica r
            LEFT JOIN funcionarios f ON f.id = r.funcionario_id
            WHERE r.id = :region_id AND r.estatus_id = 1
            """
        ),
        {"region_id": payload.region_tecnica_id},
    ).mappings().first()
    if not region:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Region tecnica invalida")

    temporada = db.execute(
        text("SELECT id, nombre, nombre_corto FROM temporadas WHERE id = :temporada_id AND estatus_id = 1"),
        {"temporada_id": payload.temporada_id},
    ).mappings().first()
    if not temporada:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Temporada invalida")

    region_states = db.execute(
        text(
            """
            SELECT estado_id
            FROM region_tecnica_detalle
            WHERE region_id = :region_id
            """
        ),
        {"region_id": payload.region_tecnica_id},
    ).mappings().all()
    allowed_state_ids = {int(row["estado_id"]) for row in region_states}
    if allowed_state_ids and payload.estado_id not in allowed_state_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La region tecnica no corresponde al estado seleccionado")

    municipios_sql = text(
        """
        SELECT id, nombre
        FROM municipios
        WHERE estado_id = :estado_id
          AND id IN :ids
          AND estatus_id = 1
        ORDER BY nombre ASC
        """
    ).bindparams(bindparam("ids", expanding=True))
    try:
        selected_municipios = db.execute(
            municipios_sql,
            {"estado_id": payload.estado_id, "ids": list(set(payload.municipios_ids))},
        ).mappings().all()
    except SQLAlchemyError:
        municipios_sql = text(
            """
            SELECT id, nombre
            FROM municipios
            WHERE estado_id = :estado_id
              AND id IN :ids
              AND activo = 1
            ORDER BY nombre ASC
            """
        ).bindparams(bindparam("ids", expanding=True))
        selected_municipios = db.execute(
            municipios_sql,
            {"estado_id": payload.estado_id, "ids": list(set(payload.municipios_ids))},
        ).mappings().all()
    if len(selected_municipios) != len(set(payload.municipios_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uno o mas municipios no son validos para el estado seleccionado")
    municipios_texto = ", ".join(str(m["nombre"]) for m in selected_municipios)

    localidad = db.execute(
        text(
            """
            SELECT l.id, l.nombre
            FROM localidades l
            INNER JOIN municipios m ON m.id = l.municipio_id
            WHERE l.id = :localidad_id
              AND m.estado_id = :estado_id
            """
        ),
        {"localidad_id": payload.localidad_id, "estado_id": payload.estado_id},
    ).mappings().first()
    if not localidad:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Localidad invalida para el estado seleccionado")
    lugar_emision = str(localidad["nombre"])

    requested_modulo_ids = sorted({int(mod_id) for mod_id in payload.modulo_ids})
    es_tef = rol_normalizado == "tercero especialista fitosanitario"
    es_pfa_o_identificador = rol_normalizado in {
        "profesional fitosanitario autorizado",
        "identificador",
    }

    if es_tef and requested_modulo_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Para Tercero Especialista Fitosanitario no debes seleccionar modulo de emision",
        )
    if es_pfa_o_identificador and not requested_modulo_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Para Profesional Fitosanitario Autorizado o Identificador debes seleccionar uno o mas modulos",
        )
    if not es_tef and not es_pfa_o_identificador and len(requested_modulo_ids) != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes seleccionar exactamente un modulo para este rol",
        )

    selected_modulos: list[dict[str, int | str]] = []
    if requested_modulo_ids:
        try:
            selected_modulos = db.execute(
                text(
                    """
                    SELECT m.id, m.nombre
                    FROM modulos m
                    LEFT JOIN municipios mu ON mu.id = m.municipio_id
                    INNER JOIN usuarios_modulos um ON um.modulo_id = m.id
                    WHERE um.usuario_id = :usuario_id
                      AND um.estatus_id = 1
                      AND m.estatus_id = 1
                      AND (m.estado_id = :estado_id OR (m.estado_id IS NULL AND mu.estado_id = :estado_id))
                      AND m.id IN :modulo_ids
                    ORDER BY m.nombre ASC
                    """
                ).bindparams(bindparam("modulo_ids", expanding=True)),
                {
                    "usuario_id": current_user.id,
                    "estado_id": payload.estado_id,
                    "modulo_ids": requested_modulo_ids,
                },
            ).mappings().all()
        except SQLAlchemyError:
            selected_modulos = []

        if not selected_modulos:
            selected_modulos = db.execute(
                text(
                    """
                    SELECT m.id, m.nombre
                    FROM modulos m
                    LEFT JOIN municipios mu ON mu.id = m.municipio_id
                    WHERE m.estatus_id = 1
                      AND (m.estado_id = :estado_id OR (m.estado_id IS NULL AND mu.estado_id = :estado_id))
                      AND m.id IN :modulo_ids
                    ORDER BY m.nombre ASC
                    """
                ).bindparams(bindparam("modulo_ids", expanding=True)),
                {"estado_id": payload.estado_id, "modulo_ids": requested_modulo_ids},
            ).mappings().all()

        if len(selected_modulos) != len(requested_modulo_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uno o mas modulos no son validos para el estado seleccionado")

    modulo_captura = "NO APLICA" if es_tef else ", ".join(str(mod["nombre"]) for mod in selected_modulos)
    primary_modulo_id = int(selected_modulos[0]["id"]) if selected_modulos else None

    folio_grupo = str(uuid.uuid4())
    documentos: list[SolicitudDocumentoResponse] = []
    estado_id = int(selected_state["id"])
    estado_nombre = str(selected_state["nombre"])
    existing = db.execute(
        text(
            """
            SELECT id, codigo_unico, pdf_generado_path, pdf_firmado_path, recibido_por_admin_id, fecha_recepcion_admin, estatus_proceso
            FROM solicitud_accesos
            WHERE usuario_id = :usuario_id
              AND estado_id = :estado_id
              AND temporada_id = :temporada_id
              AND estatus_id = 1
              AND vigente = 1
            ORDER BY id DESC
            LIMIT 1
            """
        ),
        {
            "usuario_id": current_user.id,
            "estado_id": estado_id,
            "temporada_id": payload.temporada_id,
        },
    ).mappings().first()

    ccp = db.execute(
        text(
            """
            SELECT
              COALESCE(fr.nombre, 'SIN CONFIGURAR') AS refiaae_nombre,
              COALESCE(fr.cargo, 'Puesto no configurado') AS refiaae_cargo,
              COALESCE(fc.nombre, 'SIN CONFIGURAR') AS ccmfe_nombre,
              COALESCE(fc.cargo, 'Puesto no configurado') AS ccmfe_cargo,
              COALESCE(ri.nombre, 'SIN CONFIGURAR') AS ricesav_nombre,
              COALESCE(ri.cargo, 'Puesto no configurado') AS ricesav_cargo
            FROM estados_detalle ed
            LEFT JOIN funcionarios fr ON fr.id = ed.refiaae_id
            LEFT JOIN funcionarios fc ON fc.id = ed.ccmfe_id
            LEFT JOIN funcionarios ri ON ri.id = ed.ricesav_id
            WHERE ed.estado_id = :estado_id AND ed.estatus_id = 1
            """
        ),
        {"estado_id": estado_id},
    ).mappings().first()
    ccp_refiaae_text = (
        f"{str(ccp['refiaae_cargo'])} ({str(ccp['refiaae_nombre'])}) en el Estado de {estado_nombre}"
        if ccp
        else f"Puesto no configurado en el Estado de {estado_nombre}"
    )
    ccp_ccmfe_text = (
        f"{str(ccp['ccmfe_cargo'])} ({str(ccp['ccmfe_nombre'])}) en el Estado de {estado_nombre}"
        if ccp
        else f"Puesto no configurado en el Estado de {estado_nombre}"
    )
    ccp_ricesav_text = (
        f"{str(ccp['ricesav_cargo'])} ({str(ccp['ricesav_nombre'])}) en el Estado de {estado_nombre}"
        if ccp
        else f"Puesto no configurado en el Estado de {estado_nombre}"
    )

    codigo_unico = _generate_unique_code(db)
    file_name = f"{folio_grupo}_{estado_id}_{codigo_unico}.pdf"
    relative_pdf_path = f"solicitudes_generadas/{file_name}"
    absolute_pdf_path = GENERATED_DIR / file_name

    _build_pdf(
        file_path=absolute_pdf_path,
        codigo_unico=codigo_unico,
        estado_nombre=estado_nombre,
        region_nombre=str(region["nombre"]),
        jefe_region_nombre=str(region["funcionario_nombre"]),
        payload=payload,
        rol_nombre=rol_nombre,
        lugar_emision=lugar_emision,
        modulo_captura=modulo_captura,
        municipios_texto=municipios_texto,
        full_name=current_user.nombre,
        ccp_refiaae=ccp_refiaae_text,
        ccp_ccmfe=ccp_ccmfe_text,
        ccp_ricesav=ccp_ricesav_text,
        temporada_nombre_corto=str(temporada["nombre_corto"]),
    )

    if existing and (str(existing["estatus_proceso"]) == "VALIDADA" or existing["recibido_por_admin_id"] or existing["fecha_recepcion_admin"]):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede editar/regenerar la solicitud para {estado_nombre} porque ya fue validada/autorizada",
        )

    if existing:
        old_pdf = existing["pdf_generado_path"]
        if old_pdf:
            old_path = STORAGE_ROOT / str(old_pdf)
            if old_path.exists():
                old_path.unlink(missing_ok=True)
        old_signed = existing["pdf_firmado_path"]
        if old_signed:
            old_signed_path = STORAGE_ROOT / str(old_signed)
            if old_signed_path.exists():
                old_signed_path.unlink(missing_ok=True)

        db.execute(
            text(
                """
                UPDATE solicitud_accesos
                SET folio_grupo = :folio_grupo,
                    region_tecnica_id = :region_tecnica_id,
                    temporada_id = :temporada_id,
                    rol_id = :rol_id,
                    localidad_id = :localidad_id,
                    lugar_emision = :lugar_emision,
                    fecha_solicitud = :fecha_solicitud,
                    fecha_inicio_servicios = :fecha_inicio_servicios,
                    fecha_inicio_operacion = :fecha_inicio_operacion,
                    tipo_solicitante = :tipo_solicitante,
                    municipios = :municipios,
                    modulo_id = :modulo_id,
                    modulo_captura = :modulo_captura,
                    correo_notificacion = :correo_notificacion,
                    codigo_unico = :codigo_unico,
                    estatus_proceso = 'REGENERADO',
                    pdf_generado_path = :pdf_generado_path,
                    pdf_firmado_path = NULL,
                    archivo_firmado_nombre_original = NULL,
                    fecha_carga_firmado = NULL,
                    vigente = 1,
                    updated_at = NOW()
                WHERE id = :id
                """
            ),
            {
                "folio_grupo": folio_grupo,
                "region_tecnica_id": payload.region_tecnica_id,
                "temporada_id": payload.temporada_id,
                "rol_id": payload.rol_id,
                "localidad_id": payload.localidad_id,
                "lugar_emision": lugar_emision,
                "fecha_solicitud": payload.fecha_solicitud,
                "fecha_inicio_servicios": payload.fecha_inicio_servicios,
                "fecha_inicio_operacion": payload.fecha_inicio_operacion,
                "tipo_solicitante": rol_nombre,
                "municipios": municipios_texto,
                "modulo_id": primary_modulo_id,
                "modulo_captura": modulo_captura,
                "correo_notificacion": str(payload.correo_notificacion),
                "codigo_unico": codigo_unico,
                "pdf_generado_path": relative_pdf_path,
                "id": int(existing["id"]),
            },
        )
        solicitud_id = int(existing["id"])
        estatus_result = "REGENERADO"
    else:
        result = db.execute(
            text(
                """
                INSERT INTO solicitud_accesos (
                  folio_grupo, usuario_id, estado_id, region_tecnica_id, temporada_id, rol_id,
                  localidad_id, lugar_emision, fecha_solicitud, fecha_inicio_servicios, fecha_inicio_operacion,
                  tipo_solicitante, municipios, modulo_id, modulo_captura, correo_notificacion,
                  codigo_unico, estatus_proceso, vigente, pdf_generado_path, estatus_id, created_at, updated_at
                ) VALUES (
                  :folio_grupo, :usuario_id, :estado_id, :region_tecnica_id, :temporada_id, :rol_id,
                  :localidad_id, :lugar_emision, :fecha_solicitud, :fecha_inicio_servicios, :fecha_inicio_operacion,
                  :tipo_solicitante, :municipios, :modulo_id, :modulo_captura, :correo_notificacion,
                  :codigo_unico, 'GENERADO', 1, :pdf_generado_path, 1, NOW(), NOW()
                )
                """
            ),
            {
                "folio_grupo": folio_grupo,
                "usuario_id": current_user.id,
                "estado_id": estado_id,
                "region_tecnica_id": payload.region_tecnica_id,
                "temporada_id": payload.temporada_id,
                "rol_id": payload.rol_id,
                "localidad_id": payload.localidad_id,
                "lugar_emision": lugar_emision,
                "fecha_solicitud": payload.fecha_solicitud,
                "fecha_inicio_servicios": payload.fecha_inicio_servicios,
                "fecha_inicio_operacion": payload.fecha_inicio_operacion,
                "tipo_solicitante": rol_nombre,
                "municipios": municipios_texto,
                "modulo_id": primary_modulo_id,
                "modulo_captura": modulo_captura,
                "correo_notificacion": str(payload.correo_notificacion),
                "codigo_unico": codigo_unico,
                "pdf_generado_path": relative_pdf_path,
            },
        )
        solicitud_id = int(result.lastrowid)
        estatus_result = "GENERADO"

    db.execute(text("DELETE FROM solicitud_accesos_municipios WHERE solicitud_id = :solicitud_id"), {"solicitud_id": solicitud_id})
    for municipio in selected_municipios:
        db.execute(
            text(
                """
                INSERT INTO solicitud_accesos_municipios (solicitud_id, municipio_id, estatus_id, created_at)
                VALUES (:solicitud_id, :municipio_id, 1, NOW())
                """
            ),
            {"solicitud_id": solicitud_id, "municipio_id": int(municipio["id"])},
        )

    db.execute(text("DELETE FROM solicitud_accesos_modulos WHERE solicitud_id = :solicitud_id"), {"solicitud_id": solicitud_id})
    for modulo in selected_modulos:
        db.execute(
            text(
                """
                INSERT INTO solicitud_accesos_modulos (solicitud_id, modulo_id, estatus_id, created_at)
                VALUES (:solicitud_id, :modulo_id, 1, NOW())
                """
            ),
            {"solicitud_id": solicitud_id, "modulo_id": int(modulo["id"])},
        )

    documentos.append(
        SolicitudDocumentoResponse(
            solicitud_id=solicitud_id,
            estado_id=estado_id,
            estado_nombre=estado_nombre,
            codigo_unico=codigo_unico,
            estatus_proceso=estatus_result,
            download_url=f"/api/v1/solicitudes/{solicitud_id}/pdf",
            firmado_subido=False,
            editable_regenerable=True,
            motivo_no_editable=None,
            fecha_carga_firmado=None,
        )
    )

    db.commit()

    return SolicitudAccesoCreateResponse(folio_grupo=folio_grupo, documentos=documentos)


@router.get("/routing-hint", response_model=RoutingHintResponse)
def routing_hint(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RoutingHintResponse:
    active_temporadas = _active_temporada_ids(db)

    has_generated = bool(
        db.execute(
            text(
                """
                SELECT 1
                FROM solicitud_accesos
                WHERE usuario_id = :usuario_id
                  AND estatus_id = 1
                  AND vigente = 1
                LIMIT 1
                """
            ),
            {"usuario_id": current_user.id},
        ).first()
    )

    has_validated_active = False
    if active_temporadas:
        has_validated_active = bool(
            db.execute(
                text(
                    """
                    SELECT 1
                    FROM solicitud_accesos
                    WHERE usuario_id = :usuario_id
                      AND estatus_id = 1
                      AND vigente = 1
                      AND estatus_proceso = 'VALIDADA'
                      AND temporada_id IN :temporada_ids
                    LIMIT 1
                    """
                ).bindparams(bindparam("temporada_ids", expanding=True)),
                {"usuario_id": current_user.id, "temporada_ids": active_temporadas},
            ).first()
        )

    redirect_to = "/"
    if active_temporadas and has_generated and not has_validated_active:
        redirect_to = "/solicitudes"

    return RoutingHintResponse(
        redirect_to=redirect_to,
        has_generated=has_generated,
        has_validated_active=has_validated_active,
    )


@router.get("/listado", response_model=list[SolicitudListadoItem])
def listado_solicitudes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[SolicitudListadoItem]:
    rows = db.execute(
        text(
            """
            SELECT
              sa.id,
              sa.temporada_id,
              t.nombre AS temporada_nombre,
              t.nombre_corto AS temporada_nombre_corto,
              sa.estado_id,
              e.nombre AS estado_nombre,
              sa.rol_id,
              r.nombre AS rol_nombre,
              sa.estatus_proceso,
              sa.estatus_id,
              COALESCE(sa.vigente, 0) AS vigente,
              sa.fecha_solicitud,
              sa.updated_at,
              CASE
                WHEN sa.estatus_id = 1 AND sa.estatus_proceso <> 'VALIDADA' THEN 1
                ELSE 0
              END AS editable
            FROM solicitud_accesos sa
            INNER JOIN temporadas t ON t.id = sa.temporada_id
            INNER JOIN estados e ON e.id = sa.estado_id
            LEFT JOIN roles r ON r.id = sa.rol_id
            WHERE sa.usuario_id = :usuario_id
              AND sa.estatus_id <> 3
              AND COALESCE(sa.vigente, 1) = 1
            ORDER BY t.id DESC, sa.updated_at DESC
            """
        ),
        {"usuario_id": current_user.id},
    ).mappings().all()

    return [
        SolicitudListadoItem(
            solicitud_id=int(row["id"]),
            temporada_id=int(row["temporada_id"]),
            temporada_nombre=str(row["temporada_nombre"]),
            temporada_nombre_corto=str(row["temporada_nombre_corto"]),
            estado_id=int(row["estado_id"]),
            estado_nombre=str(row["estado_nombre"]),
            rol_id=int(row["rol_id"]) if row["rol_id"] is not None else None,
            rol_nombre=str(row["rol_nombre"]) if row["rol_nombre"] is not None else None,
            estatus_proceso=str(row["estatus_proceso"]),
            estatus_id=int(row["estatus_id"]),
            vigente=bool(row["vigente"]),
            editable=bool(row["editable"]),
            download_url=f"/api/v1/solicitudes/{int(row['id'])}/pdf",
            fecha_solicitud=row["fecha_solicitud"],
            fecha_actualizacion=row["updated_at"],
        )
        for row in rows
    ]


@router.get("/detalle/{solicitud_id}", response_model=SolicitudFormResponse)
def solicitud_detalle(
    solicitud_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SolicitudFormResponse:
    row = db.execute(
        text(
            """
            SELECT
              sa.id, sa.rol_id, sa.estado_id, sa.localidad_id, sa.region_tecnica_id, sa.temporada_id,
              sa.fecha_solicitud, sa.fecha_inicio_servicios, sa.fecha_inicio_operacion,
              sa.correo_notificacion, sa.estatus_proceso, sa.estatus_id
            FROM solicitud_accesos sa
            WHERE sa.id = :solicitud_id
              AND sa.usuario_id = :usuario_id
              AND sa.estatus_id <> 3
            LIMIT 1
            """
        ),
        {"solicitud_id": solicitud_id, "usuario_id": current_user.id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")

    municipios = db.execute(
        text(
            """
            SELECT municipio_id
            FROM solicitud_accesos_municipios
            WHERE solicitud_id = :solicitud_id
              AND estatus_id = 1
            ORDER BY municipio_id ASC
            """
        ),
        {"solicitud_id": solicitud_id},
    ).fetchall()

    modulo_ids: list[int] = []
    try:
        modulo_rows = db.execute(
            text(
                """
                SELECT modulo_id
                FROM solicitud_accesos_modulos
                WHERE solicitud_id = :solicitud_id
                  AND estatus_id = 1
                ORDER BY modulo_id ASC
                """
            ),
            {"solicitud_id": solicitud_id},
        ).fetchall()
        modulo_ids = [int(m.modulo_id) for m in modulo_rows]
    except SQLAlchemyError:
        modulo_ids = []
    if not modulo_ids and row["rol_id"] is not None:
        modulo_single = db.execute(
            text("SELECT modulo_id FROM solicitud_accesos WHERE id = :solicitud_id"),
            {"solicitud_id": solicitud_id},
        ).first()
        if modulo_single and modulo_single.modulo_id:
            modulo_ids = [int(modulo_single.modulo_id)]

    return SolicitudFormResponse(
        solicitud_id=int(row["id"]),
        rol_id=int(row["rol_id"]),
        estado_id=int(row["estado_id"]),
        localidad_id=int(row["localidad_id"]) if row["localidad_id"] is not None else 0,
        modulo_ids=modulo_ids,
        region_tecnica_id=int(row["region_tecnica_id"]),
        temporada_id=int(row["temporada_id"]),
        fecha_solicitud=row["fecha_solicitud"],
        fecha_inicio_servicios=row["fecha_inicio_servicios"],
        fecha_inicio_operacion=row["fecha_inicio_operacion"],
        municipios_ids=[int(m.municipio_id) for m in municipios],
        correo_notificacion=str(row["correo_notificacion"]),
        estatus_proceso=str(row["estatus_proceso"]),
        editable=bool(int(row["estatus_id"]) == 1 and str(row["estatus_proceso"]) != "VALIDADA"),
    )


@router.patch("/detalle/{solicitud_id}/cancelar")
def cancelar_solicitud(
    solicitud_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    row = db.execute(
        text(
            """
            SELECT id, estatus_proceso, pdf_firmado_path
            FROM solicitud_accesos
            WHERE id = :solicitud_id
              AND usuario_id = :usuario_id
              AND estatus_id = 1
              AND COALESCE(vigente, 1) = 1
            LIMIT 1
            """
        ),
        {"solicitud_id": solicitud_id, "usuario_id": current_user.id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    if str(row["estatus_proceso"]) == "VALIDADA":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No se puede cancelar una solicitud validada")

    if row["pdf_firmado_path"]:
        signed_path = STORAGE_ROOT / str(row["pdf_firmado_path"])
        if signed_path.exists():
            signed_path.unlink(missing_ok=True)

    db.execute(
        text(
            """
            UPDATE solicitud_accesos
            SET estatus_id = 3,
                estatus_proceso = 'CANCELADA',
                vigente = NULL,
                updated_at = NOW()
            WHERE id = :solicitud_id
            """
        ),
        {"solicitud_id": solicitud_id},
    )
    db.commit()
    return {"message": "Solicitud cancelada"}


@router.get("/mis-solicitudes", response_model=list[SolicitudDocumentoResponse])
def mis_solicitudes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[SolicitudDocumentoResponse]:
    rows = db.execute(
        text(
            """
            SELECT sa.id, sa.estado_id, e.nombre AS estado_nombre, sa.codigo_unico,
                   sa.estatus_proceso, sa.fecha_carga_firmado,
                   sa.recibido_por_admin_id, sa.fecha_recepcion_admin, t.estatus_id AS temporada_estatus_id
            FROM solicitud_accesos sa
            INNER JOIN estados e ON e.id = sa.estado_id
            INNER JOIN temporadas t ON t.id = sa.temporada_id
            WHERE sa.usuario_id = :usuario_id
              AND sa.estatus_id = 1
              AND sa.vigente = 1
            ORDER BY sa.created_at DESC
            """
        ),
        {"usuario_id": current_user.id},
    ).mappings().all()

    return [
        SolicitudDocumentoResponse(
            solicitud_id=int(row["id"]),
            estado_id=int(row["estado_id"]),
            estado_nombre=str(row["estado_nombre"]),
            codigo_unico=str(row["codigo_unico"]),
            estatus_proceso=str(row["estatus_proceso"]),
            download_url=f"/api/v1/solicitudes/{int(row['id'])}/pdf",
            firmado_subido=bool(row["fecha_carga_firmado"]),
            editable_regenerable=bool(row["temporada_estatus_id"] == 1 and not row["recibido_por_admin_id"] and not row["fecha_recepcion_admin"]),
            motivo_no_editable=None
            if bool(row["temporada_estatus_id"] == 1 and not row["recibido_por_admin_id"] and not row["fecha_recepcion_admin"])
            else "Bloqueado por temporada inactiva o recepcion administrativa",
            fecha_carga_firmado=row["fecha_carga_firmado"],
        )
        for row in rows
    ]


@router.get("/{solicitud_id}/pdf")
def descargar_pdf_solicitud(
    solicitud_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    row = db.execute(
        text(
            """
            SELECT id, pdf_generado_path, codigo_unico
            FROM solicitud_accesos
            WHERE id = :id AND usuario_id = :usuario_id AND estatus_id = 1 AND vigente = 1
            """
        ),
        {"id": solicitud_id, "usuario_id": current_user.id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")

    relative_path = str(row["pdf_generado_path"])
    absolute_path = STORAGE_ROOT / relative_path
    if not absolute_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF no encontrado")

    download_name = f"solicitud_sigmod_{row['codigo_unico']}.pdf"
    return FileResponse(path=absolute_path, media_type="application/pdf", filename=download_name)


@router.post("/cargar-firmado", response_model=CargarFirmadoResponse)
async def cargar_firmado(
    codigo_unico: str = Form(...),
    archivo: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CargarFirmadoResponse:
    _ensure_storage()

    solicitud = db.execute(
        text(
            """
            SELECT id
            FROM solicitud_accesos
            WHERE codigo_unico = :codigo_unico
              AND usuario_id = :usuario_id
              AND estatus_id = 1
              AND vigente = 1
            """
        ),
        {"codigo_unico": codigo_unico.strip().upper(), "usuario_id": current_user.id},
    ).mappings().first()
    if not solicitud:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Codigo unico invalido")

    file_ext = Path(archivo.filename or "").suffix.lower()
    if file_ext not in {".pdf", ".png", ".jpg", ".jpeg"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de archivo no permitido")

    target_name = f"{codigo_unico.strip().upper()}{file_ext}"
    target_path = SIGNED_DIR / target_name
    file_bytes = await archivo.read()
    target_path.write_bytes(file_bytes)

    db.execute(
        text(
            """
            UPDATE solicitud_accesos
            SET estatus_proceso = 'FIRMADO_CARGADO',
                pdf_firmado_path = :pdf_firmado_path,
                archivo_firmado_nombre_original = :archivo_original,
                fecha_carga_firmado = NOW(),
                updated_at = NOW()
            WHERE id = :id
            """
        ),
        {
            "pdf_firmado_path": f"solicitudes_firmadas/{target_name}",
            "archivo_original": archivo.filename,
            "id": int(solicitud["id"]),
        },
    )
    db.commit()

    return CargarFirmadoResponse(
        solicitud_id=int(solicitud["id"]),
        codigo_unico=codigo_unico.strip().upper(),
        estatus_proceso="FIRMADO_CARGADO",
        archivo_firmado=target_name,
    )

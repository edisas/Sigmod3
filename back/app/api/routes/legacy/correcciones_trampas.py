"""Correcciones legacy — edición y eliminación de trampas.

Extraído de correcciones.py como parte de la división por recurso. Comparte
helpers y el router parent con el módulo de revisiones (ambos bajo prefix
/correcciones/). Ver correcciones.py para el router raíz y helpers.
"""

from __future__ import annotations

from datetime import date, datetime  # noqa: F401
from typing import Any  # noqa: F401

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db
from app.api.routes.legacy.helpers import (
    estado_clave_y_db as _estado_clave_y_db,
)
from app.api.routes.legacy.helpers import (
    resolver_legacy_user as _resolver_legacy_user,
)
from app.api.routes.legacy.helpers import (
    to_int_or_none as _to_int_or_none,
)
from app.core.legacy_audit import record_legacy_write

router = APIRouter()


class PfaConRutasRow(BaseModel):
    folio: int
    nombre: str
    inicial: str | None
    rutas_count: int


class TipoTrampaRow(BaseModel):
    folio: int
    nombre: str


class TrampaRow(BaseModel):
    folio: int
    no_trampa: str
    numeroinscripcion: str | None
    nombre_huerto: str | None
    ruta_nombre: str | None
    ruta_inicial: str | None
    tipo_trampa: int | None
    fecha_ultima_revision: date | None
    fecha_colocacion: date | None
    status: str | None


class PatchTrampaBody(BaseModel):
    no_trampa: str | None = Field(default=None, min_length=1, max_length=50)
    fecha_ultima_revision: date | None = None
    tipo_trampa: int | None = Field(default=None, ge=1)


class PreviewEliminarTrampa(BaseModel):
    permitido: bool
    motivo_bloqueo: str | None
    revisiones_afectadas: int
    identificaciones_afectadas: int
    tmimf_o_recalculadas: int
    trampas_activas_restantes_huerto: int


class EliminarTrampaResult(BaseModel):
    folio: int
    cascada: dict  # {revisiones, identificaciones, tmimf_o}


@router.get("/pfas-con-rutas", response_model=list[PfaConRutasRow])
def pfas_con_rutas(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[PfaConRutasRow]:
    """PFAs activos con ≥1 ruta asignada (filtro que el front usa al inicio)."""
    rows = session.execute(
        text("""
            SELECT f.folio, f.nombre, f.inicial_funcionario AS inicial,
                   COUNT(r.folio) AS rutas_count
              FROM cat_funcionarios f
              JOIN cat_rutas r ON r.clave_pfa = f.folio
                              AND (r.status IS NULL OR r.status = 'A')
             WHERE f.cargo  = 'PROFESIONAL FITOSANITARIO AUTORIZADO'
               AND f.status = 'A'
             GROUP BY f.folio, f.nombre, f.inicial_funcionario
             HAVING rutas_count >= 1
             ORDER BY f.nombre ASC
        """),
    ).mappings().all()
    return [PfaConRutasRow(**dict(r)) for r in rows]


@router.get("/catalogo-tipos-trampa", response_model=list[TipoTrampaRow])
def catalogo_tipos_trampa(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[TipoTrampaRow]:
    rows = session.execute(
        text("""
            SELECT folio, nombre FROM cat_tipos_trampa
             WHERE status IS NULL OR status = 'A'
             ORDER BY nombre ASC
        """),
    ).mappings().all()
    return [TipoTrampaRow(**dict(r)) for r in rows]


@router.get("/trampas-por-ruta", response_model=list[TrampaRow])
def trampas_por_ruta(
    ruta: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[TrampaRow]:
    rows = session.execute(
        text("""
            SELECT t.folio, t.no_trampa, TRIM(t.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_unidad       AS nombre_huerto,
                   r.nombre_ruta          AS ruta_nombre,
                   r.inicial_ruta         AS ruta_inicial,
                   t.tipo_trampa, t.fecha_ultima_revision, t.fecha_colocacion, t.status
              FROM trampas t
              LEFT JOIN sv01_sv02 sv ON BINARY TRIM(sv.numeroinscripcion) = BINARY TRIM(t.numeroinscripcion)
              LEFT JOIN cat_rutas r  ON r.folio = t.folio_ruta
             WHERE t.folio_ruta = :ruta
             ORDER BY t.no_trampa ASC
        """),
        {"ruta": ruta},
    ).mappings().all()
    return [TrampaRow(**dict(r)) for r in rows]


@router.get("/trampas/{folio}/preview-eliminar", response_model=PreviewEliminarTrampa)
def preview_eliminar_trampa(
    folio: int,
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> PreviewEliminarTrampa:
    trampa = session.execute(
        text("""
            SELECT folio, no_trampa, TRIM(numeroinscripcion) AS numeroinscripcion, status
              FROM trampas WHERE folio = :f
        """),
        {"f": folio},
    ).mappings().first()
    if not trampa:
        raise HTTPException(status_code=404, detail=f"Trampa {folio} no existe")

    ni = trampa["numeroinscripcion"] or ""
    # trampas activas del huerto excluyendo esta
    activas_huerto = int(session.execute(
        text("""
            SELECT COUNT(*) FROM trampas
             WHERE TRIM(numeroinscripcion) = :ni
               AND folio <> :f
               AND (status IS NULL OR status = 'A')
        """),
        {"ni": ni, "f": folio},
    ).scalar() or 0)

    revisiones = int(session.execute(
        text("SELECT COUNT(*) FROM trampas_revision WHERE no_trampa = :t"),
        {"t": trampa["no_trampa"]},
    ).scalar() or 0)

    identificaciones = int(session.execute(
        text("""
            SELECT COUNT(*) FROM identificacion i
             WHERE i.folio_revision IN (
                SELECT folio FROM trampas_revision WHERE no_trampa = :t
             )
        """),
        {"t": trampa["no_trampa"]},
    ).scalar() or 0)

    tmimf_o = int(session.execute(
        text("""
            SELECT COUNT(*) FROM tmimf
             WHERE TRIM(numeroinscripcion) = :ni
               AND tipo_tarjeta = 'O'
               AND status = 'A'
        """),
        {"ni": ni},
    ).scalar() or 0)

    permitido = activas_huerto >= 1
    motivo = None
    if not permitido:
        motivo = (
            f"No se puede eliminar: es la única trampa activa del huerto {ni}. "
            "Cada huerto debe conservar al menos una trampa. Da de alta otra primero."
        )

    return PreviewEliminarTrampa(
        permitido=permitido,
        motivo_bloqueo=motivo,
        revisiones_afectadas=revisiones,
        identificaciones_afectadas=identificaciones,
        tmimf_o_recalculadas=tmimf_o,
        trampas_activas_restantes_huerto=activas_huerto,
    )


@router.patch("/trampas/{folio}", response_model=TrampaRow)
def actualizar_trampa(
    folio: int,
    body: PatchTrampaBody,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> TrampaRow:
    cambios = {k: v for k, v in body.model_dump().items() if v is not None}
    if not cambios:
        raise HTTPException(status_code=400, detail="No hay cambios que aplicar")

    before = session.execute(
        text("""
            SELECT folio, no_trampa, TRIM(numeroinscripcion) AS numeroinscripcion,
                   folio_ruta, tipo_trampa, fecha_ultima_revision, fecha_colocacion, status
              FROM trampas WHERE folio = :f
        """),
        {"f": folio},
    ).mappings().first()
    if not before:
        raise HTTPException(status_code=404, detail=f"Trampa {folio} no existe")
    before_d = dict(before)

    if "tipo_trampa" in cambios and cambios["tipo_trampa"] != before_d["tipo_trampa"]:
        exists = session.execute(
            text("""
                SELECT folio FROM cat_tipos_trampa
                 WHERE folio = :t AND (status IS NULL OR status = 'A')
            """),
            {"t": cambios["tipo_trampa"]},
        ).first()
        if not exists:
            raise HTTPException(status_code=400, detail=f"tipo_trampa {cambios['tipo_trampa']} inválido")

    if "no_trampa" in cambios:
        # evita colisión con otra trampa existente
        clash = session.execute(
            text("SELECT folio FROM trampas WHERE no_trampa = :nt AND folio <> :f LIMIT 1"),
            {"nt": cambios["no_trampa"], "f": folio},
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail=f"Ya existe otra trampa con no_trampa={cambios['no_trampa']!r}")

    set_clauses = [f"{k} = :{k}" for k in cambios]
    set_params = {**cambios, "f": folio}
    session.execute(
        text(f"UPDATE trampas SET {', '.join(set_clauses)} WHERE folio = :f"),
        set_params,
    )
    session.commit()

    # Si cambió no_trampa, propaga a trampas_revision e identificacion para no romper lookups
    if "no_trampa" in cambios and cambios["no_trampa"] != before_d["no_trampa"]:
        session.execute(
            text("UPDATE trampas_revision SET no_trampa = :new WHERE no_trampa = :old"),
            {"new": cambios["no_trampa"], "old": before_d["no_trampa"]},
        )
        session.execute(
            text("UPDATE identificacion SET no_trampa = :new WHERE no_trampa = :old"),
            {"new": cambios["no_trampa"], "old": before_d["no_trampa"]},
        )
        session.commit()

    # Auditoría
    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)
    diff_antes = {k: before_d.get(k) for k in cambios}
    # fechas en diff: ser serializables
    diff_antes = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in diff_antes.items()}
    cambios_out = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in cambios.items()}
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="trampas", operacion="UPDATE",
        registro_pk=str(folio),
        campos_antes=diff_antes, campos_despues=cambios_out,
        registros_afectados=1,
    )

    # devolver estado actual
    after = session.execute(
        text("""
            SELECT t.folio, t.no_trampa, TRIM(t.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_unidad AS nombre_huerto,
                   r.nombre_ruta    AS ruta_nombre,
                   r.inicial_ruta   AS ruta_inicial,
                   t.tipo_trampa, t.fecha_ultima_revision, t.fecha_colocacion, t.status
              FROM trampas t
              LEFT JOIN sv01_sv02 sv ON BINARY TRIM(sv.numeroinscripcion) = BINARY TRIM(t.numeroinscripcion)
              LEFT JOIN cat_rutas  r ON r.folio = t.folio_ruta
             WHERE t.folio = :f
        """),
        {"f": folio},
    ).mappings().one()
    return TrampaRow(**dict(after))


@router.delete("/trampas/{folio}", response_model=EliminarTrampaResult)
def eliminar_trampa(
    folio: int,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> EliminarTrampaResult:
    # 1. Carga trampa y valida que no sea la última activa del huerto
    trampa = session.execute(
        text("""
            SELECT folio, no_trampa, TRIM(numeroinscripcion) AS numeroinscripcion,
                   folio_ruta, tipo_trampa, fecha_ultima_revision, fecha_colocacion, status
              FROM trampas WHERE folio = :f
        """),
        {"f": folio},
    ).mappings().first()
    if not trampa:
        raise HTTPException(status_code=404, detail=f"Trampa {folio} no existe")
    trampa_d = dict(trampa)
    ni = trampa_d["numeroinscripcion"] or ""

    activas_huerto = int(session.execute(
        text("""
            SELECT COUNT(*) FROM trampas
             WHERE TRIM(numeroinscripcion) = :ni
               AND folio <> :f
               AND (status IS NULL OR status = 'A')
        """),
        {"ni": ni, "f": folio},
    ).scalar() or 0)
    if activas_huerto < 1:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar: es la única trampa activa del huerto {ni}. "
                "Cada huerto debe conservar al menos una trampa."
            ),
        )

    # 2. Cargar folios de revisiones (para cascada identificacion + audit)
    rev_folios = [int(r[0]) for r in session.execute(
        text("SELECT folio FROM trampas_revision WHERE no_trampa = :t"),
        {"t": trampa_d["no_trampa"]},
    ).all()]

    ident_deleted = 0
    if rev_folios:
        # snapshot de identificacion para audit (sin id_identificacion — no existe
        # en todas las BDs; folio_revision es suficiente para identificar la fila)
        ident_snap = session.execute(
            text("""
                SELECT folio_revision, tipo_especie,
                       hembras_silvestre, machos_silvestre, hembras_esteril, machos_esteril
                  FROM identificacion WHERE folio_revision IN :folios
            """).bindparams(bindparam("folios", expanding=True)),
            {"folios": rev_folios},
        ).mappings().all()
        ident_snap_list = [dict(x) for x in ident_snap]
        if ident_snap_list:
            session.execute(
                text("DELETE FROM identificacion WHERE folio_revision IN :folios").bindparams(
                    bindparam("folios", expanding=True),
                ),
                {"folios": rev_folios},
            )
            session.commit()
            ident_deleted = len(ident_snap_list)
    else:
        ident_snap_list = []

    # 3. DELETE trampas_revision
    rev_deleted = 0
    if rev_folios:
        res = session.execute(
            text("DELETE FROM trampas_revision WHERE no_trampa = :t"),
            {"t": trampa_d["no_trampa"]},
        )
        session.commit()
        rev_deleted = res.rowcount or len(rev_folios)

    # 4. DELETE la trampa
    session.execute(text("DELETE FROM trampas WHERE folio = :f"), {"f": folio})
    session.commit()

    # 5. Recalcular TMIMF 'O' activas del huerto
    tmimfs = session.execute(
        text("""
            SELECT folio_tmimf, semana, num_trampas_instaladas, trampas_revisadas, porcentaje_trampas_rev
              FROM tmimf
             WHERE TRIM(numeroinscripcion) = :ni
               AND tipo_tarjeta = 'O'
               AND status = 'A'
        """),
        {"ni": ni},
    ).mappings().all()
    tmimf_actualizaciones: list[dict] = []
    for t in tmimfs:
        sem_int = _to_int_or_none(t["semana"])
        if sem_int is None:
            continue  # TMIMF sin semana válida — no recalculable
        nuevas_instaladas = int(session.execute(
            text("""
                SELECT COUNT(*) FROM trampas
                 WHERE TRIM(numeroinscripcion) = :ni
                   AND (status IS NULL OR status = 'A')
            """),
            {"ni": ni},
        ).scalar() or 0)
        nuevas_revisadas = int(session.execute(
            text("""
                SELECT COUNT(*) FROM trampas_revision tr
                  JOIN trampas t ON t.no_trampa = tr.no_trampa
                 WHERE TRIM(t.numeroinscripcion) = :ni
                   AND tr.no_semana = :sem
            """),
            {"ni": ni, "sem": sem_int},
        ).scalar() or 0)
        pct = round((nuevas_revisadas * 100.0 / nuevas_instaladas), 2) if nuevas_instaladas > 0 else 0.0
        session.execute(
            text("""
                UPDATE tmimf
                   SET num_trampas_instaladas = :ni_count,
                       trampas_revisadas      = :rev_count,
                       porcentaje_trampas_rev = :pct
                 WHERE folio_tmimf = :folio
            """),
            {"ni_count": nuevas_instaladas, "rev_count": nuevas_revisadas, "pct": pct, "folio": t["folio_tmimf"]},
        )
        tmimf_actualizaciones.append({
            "folio_tmimf": t["folio_tmimf"],
            "semana": sem_int,
            "antes": {"num_trampas_instaladas": t["num_trampas_instaladas"], "trampas_revisadas": t["trampas_revisadas"], "porcentaje_trampas_rev": float(t["porcentaje_trampas_rev"] or 0)},
            "despues": {"num_trampas_instaladas": nuevas_instaladas, "trampas_revisadas": nuevas_revisadas, "porcentaje_trampas_rev": pct},
        })
    if tmimf_actualizaciones:
        session.commit()

    # 6. Auditoría — 4 entradas posibles
    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)

    trampa_before_serial = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in trampa_d.items()}
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="trampas", operacion="DELETE",
        registro_pk=str(folio),
        campos_antes=trampa_before_serial,
        campos_despues=None,
        registros_afectados=1,
    )
    if rev_deleted:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="trampas_revision", operacion="DELETE",
            registro_pk=f"no_trampa={trampa_d['no_trampa']!r}",
            campos_antes={"folios_revision_borrados": rev_folios},
            campos_despues=None,
            registros_afectados=rev_deleted,
        )
    if ident_deleted:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="identificacion", operacion="DELETE",
            registro_pk=f"no_trampa={trampa_d['no_trampa']!r}",
            campos_antes={"filas_borradas": ident_snap_list},
            campos_despues=None,
            registros_afectados=ident_deleted,
        )
    if tmimf_actualizaciones:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="tmimf", operacion="UPDATE",
            registro_pk=f"numeroinscripcion={ni!r} tipo_tarjeta='O'",
            campos_antes={"recalculadas": [{"folio_tmimf": x["folio_tmimf"], "antes": x["antes"]} for x in tmimf_actualizaciones]},
            campos_despues={"recalculadas": [{"folio_tmimf": x["folio_tmimf"], "despues": x["despues"]} for x in tmimf_actualizaciones]},
            registros_afectados=len(tmimf_actualizaciones),
        )

    return EliminarTrampaResult(
        folio=folio,
        cascada={
            "revisiones": rev_deleted,
            "identificaciones": ident_deleted,
            "tmimf_o_recalculadas": len(tmimf_actualizaciones),
        },
    )

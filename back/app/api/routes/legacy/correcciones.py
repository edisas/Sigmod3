"""
Correcciones legacy sobre trampas_revision (+ identificacion).

Flujo UI: PFA → Ruta → Semana → tabla de revisiones editables.
Campos corregibles: fecha_revision, status_revision, tipo_producto, dias_exposicion, validado.

Reglas de negocio:
- Antes de cualquier cambio se verifica que NO exista TMIMF tipo 'O' activa para
  ese huerto + semana; si existe, 409 con mensaje descriptivo (la TMIMF operativa
  consolida la revisión y corregir el insumo después del consolidado deja
  inconsistencias; hay que cancelar la TMIMF primero).
- Al cambiar fecha_revision: el front consume /dias-exposicion-preview con la
  revisión previa más cercana de esa trampa y sugiere el valor.
- Al pasar status_revision a 2 (Revisada con captura) se requiere identificacion
  en el body (tipo_especie + conteos) y se INSERTA en tabla identificacion.
- Al salir de 2 hacia otro status se ELIMINA la fila de identificacion existente
  de esa trampa+semana (es un error común marcar 2 por accidente; la auditoría
  conserva los datos borrados en campos_antes).

Auditoría: cada PATCH puede generar 1 ó 2 entradas en legacy_audit_log V3
(trampas_revision + opcionalmente identificacion).

Nota técnica: trampas_revision e identificacion son MyISAM (sin transacciones).
Orden de escritura: validar todo antes → UPDATE trampas_revision → mutar
identificacion si aplica. Si algún paso posterior falla, el estado queda
inconsistente pero la auditoría registra qué alcanzó a aplicarse.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db
from app.core.legacy_audit import record_legacy_write

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class RutaPfaRow(BaseModel):
    folio: int
    nombre_ruta: str | None
    inicial_ruta: str | None
    modulo_nombre: str | None


class SemanaRutaRow(BaseModel):
    # no_semana aquí es el FOLIO de la tabla semanas — lo guardamos así porque
    # es el identificador interno que usan trampas_revision.no_semana y
    # tmimf.semana. `semana_label` ya trae el texto "{no_semana_año} - {periodo}"
    # para mostrar al usuario (formato del PHP original).
    no_semana: int
    periodo: int | None
    semana_label: str
    revisiones: int


class IdentificacionPayload(BaseModel):
    tipo_especie: int = Field(ge=1)
    hembras_silvestre: int = Field(default=0, ge=0)
    machos_silvestre:  int = Field(default=0, ge=0)
    hembras_esteril:   int = Field(default=0, ge=0)
    machos_esteril:    int = Field(default=0, ge=0)


class RevisionRow(BaseModel):
    folio: int
    no_trampa: str
    no_semana: int
    fecha_revision: date | None
    status_revision: int | None
    tipo_producto: int | None
    dias_exposicion: int | None
    observaciones: str | None
    validado: str | None
    numeroinscripcion: str | None
    tmimf_o_bloqueo: bool
    tmimf_o_folio: str | None
    identificacion: IdentificacionPayload | None
    identificacion_multiple: bool


class DiasExposicionPreview(BaseModel):
    fecha_anterior: date | None
    semana_anterior: int | None
    dias_exposicion: int | None


class CatalogoItem(BaseModel):
    folio: int
    nombre: str


class CatalogosCorreccion(BaseModel):
    status_revision: list[CatalogoItem]
    productos: list[CatalogoItem]
    especies: list[CatalogoItem]


class PatchRevisionBody(BaseModel):
    fecha_revision: date | None = None
    status_revision: int | None = Field(default=None, ge=1, le=6)
    tipo_producto: int | None = Field(default=None, ge=1)
    dias_exposicion: int | None = Field(default=None, ge=0, le=90)
    validado: Literal["S", "N"] | None = None
    identificacion: IdentificacionPayload | None = None


class PatchRevisionResult(BaseModel):
    folio: int
    revision: RevisionRow
    cambios_trampas_revision: dict
    cambios_identificacion: dict  # { op: 'insert'|'update'|'delete'|'noop', before?, after? }


# ──────────────────────────────────────────────────────────────────────
# GET: selectores en cascada
# ──────────────────────────────────────────────────────────────────────


@router.get("/rutas-por-pfa", response_model=list[RutaPfaRow])
def rutas_por_pfa(
    pfa: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[RutaPfaRow]:
    rows = session.execute(
        text("""
            SELECT r.folio, r.nombre_ruta, r.inicial_ruta, m.nombre_modulo AS modulo_nombre
              FROM cat_rutas r
              LEFT JOIN cat_modulos m ON m.folio = r.modulo
             WHERE r.clave_pfa = :pfa
               AND (r.status IS NULL OR r.status = 'A')
             ORDER BY r.nombre_ruta ASC
        """),
        {"pfa": pfa},
    ).mappings().all()
    return [RutaPfaRow(**dict(r)) for r in rows]


@router.get("/semanas-por-ruta", response_model=list[SemanaRutaRow])
def semanas_por_ruta(
    ruta: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[SemanaRutaRow]:
    rows = session.execute(
        text("""
            SELECT tr.no_semana       AS folio_semana,
                   s.no_semana        AS no_semana_anio,
                   s.periodo          AS periodo,
                   COUNT(*)           AS revisiones
              FROM trampas_revision tr
              JOIN trampas t ON t.no_trampa = tr.no_trampa
              LEFT JOIN semanas s ON s.folio = tr.no_semana
             WHERE t.folio_ruta = :ruta
             GROUP BY tr.no_semana, s.no_semana, s.periodo
             ORDER BY tr.no_semana DESC
             LIMIT 52
        """),
        {"ruta": ruta},
    ).mappings().all()
    out: list[SemanaRutaRow] = []
    for r in rows:
        folio  = int(r["folio_semana"])
        nsa    = r["no_semana_anio"]
        per    = r["periodo"]
        if nsa is not None and per is not None:
            label = f"{int(nsa)} - {int(per)}"
        else:
            label = f"sem {folio}"
        out.append(SemanaRutaRow(
            no_semana=folio,
            periodo=int(per) if per is not None else None,
            semana_label=label,
            revisiones=int(r["revisiones"] or 0),
        ))
    return out


@router.get("/revisiones", response_model=list[RevisionRow])
def listar_revisiones(
    ruta: int = Query(..., ge=1),
    semana: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[RevisionRow]:
    # Query 1: revisiones + huerto (sin subquery correlacionada; la correlacionada
    # escaneaba tmimf una vez por fila y en prod con MariaDB 5.5 hacía timeout).
    rows = session.execute(
        text("""
            SELECT tr.folio, tr.no_trampa, tr.no_semana, tr.fecha_revision,
                   tr.status_revision, tr.tipo_producto, tr.dias_exposicion,
                   tr.observaciones, tr.validado,
                   TRIM(t.numeroinscripcion) AS numeroinscripcion
              FROM trampas_revision tr
              JOIN trampas t ON t.no_trampa = tr.no_trampa
             WHERE t.folio_ruta = :ruta
               AND tr.no_semana = :semana
             ORDER BY t.no_trampa ASC
        """),
        {"ruta": ruta, "semana": semana},
    ).mappings().all()

    if not rows:
        return []

    # Query 2: TMIMF 'O' activas para los huertos de esta semana — una sola
    # consulta con IN expandido, indexable por tipo_tarjeta/status.
    inscripciones = sorted({str(r["numeroinscripcion"] or "").strip() for r in rows if r["numeroinscripcion"]})
    tmimf_o_map: dict[str, str] = {}
    if inscripciones:
        tmimf_rows = session.execute(
            text("""
                SELECT TRIM(numeroinscripcion) AS ni, folio_tmimf
                  FROM tmimf
                 WHERE tipo_tarjeta = 'O'
                   AND status = 'A'
                   AND CAST(NULLIF(semana,'') AS UNSIGNED) = :semana
                   AND TRIM(numeroinscripcion) IN :nis
            """).bindparams(bindparam("nis", expanding=True)),
            {"semana": semana, "nis": inscripciones},
        ).mappings().all()
        for tr in tmimf_rows:
            ni = str(tr["ni"] or "")
            if ni not in tmimf_o_map:  # quedarnos con el primer folio_tmimf si hay duplicados
                tmimf_o_map[ni] = str(tr["folio_tmimf"])

    # Query 3: identificación por lote
    folios = [int(r["folio"]) for r in rows]
    ident_map: dict[int, list[dict]] = {}
    if folios:
        ident_rows = session.execute(
            text("""
                SELECT folio_revision, tipo_especie, hembras_silvestre, machos_silvestre,
                       hembras_esteril, machos_esteril
                  FROM identificacion
                 WHERE folio_revision IN :folios
            """).bindparams(bindparam("folios", expanding=True)),
            {"folios": folios},
        ).mappings().all()
        for ir in ident_rows:
            ident_map.setdefault(int(ir["folio_revision"]), []).append(dict(ir))

    out: list[RevisionRow] = []
    for r in rows:
        rd = dict(r)
        ni = str(rd.get("numeroinscripcion") or "").strip()
        tmimf_o_folio = tmimf_o_map.get(ni)
        ids = ident_map.get(int(rd["folio"]), [])
        ident_payload = None
        if ids:
            first = ids[0]
            ident_payload = IdentificacionPayload(
                tipo_especie=int(first.get("tipo_especie") or 0),
                hembras_silvestre=int(first.get("hembras_silvestre") or 0),
                machos_silvestre=int(first.get("machos_silvestre") or 0),
                hembras_esteril=int(first.get("hembras_esteril") or 0),
                machos_esteril=int(first.get("machos_esteril") or 0),
            )
        out.append(RevisionRow(
            folio=int(rd["folio"]),
            no_trampa=str(rd["no_trampa"] or "").strip(),
            no_semana=int(rd["no_semana"] or 0),
            fecha_revision=rd.get("fecha_revision"),
            status_revision=rd.get("status_revision"),
            tipo_producto=rd.get("tipo_producto"),
            dias_exposicion=rd.get("dias_exposicion"),
            observaciones=rd.get("observaciones"),
            validado=rd.get("validado"),
            numeroinscripcion=ni or None,
            tmimf_o_bloqueo=tmimf_o_folio is not None,
            tmimf_o_folio=tmimf_o_folio,
            identificacion=ident_payload,
            identificacion_multiple=len(ids) > 1,
        ))
    return out


@router.get("/dias-exposicion-preview", response_model=DiasExposicionPreview)
def dias_exposicion_preview(
    no_trampa: str = Query(..., min_length=1),
    semana: int = Query(..., ge=1),
    fecha: date = Query(...),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> DiasExposicionPreview:
    """Busca la revisión anterior más reciente y calcula dias = fecha - fecha_anterior."""
    row = session.execute(
        text("""
            SELECT fecha_revision, no_semana
              FROM trampas_revision
             WHERE no_trampa = :t
               AND no_semana < :s
               AND fecha_revision IS NOT NULL
             ORDER BY no_semana DESC
             LIMIT 1
        """),
        {"t": no_trampa, "s": semana},
    ).mappings().first()
    if not row or not row["fecha_revision"]:
        return DiasExposicionPreview(fecha_anterior=None, semana_anterior=None, dias_exposicion=None)
    dias = (fecha - row["fecha_revision"]).days
    return DiasExposicionPreview(
        fecha_anterior=row["fecha_revision"],
        semana_anterior=int(row["no_semana"] or 0),
        dias_exposicion=max(dias, 0),
    )


@router.get("/catalogos", response_model=CatalogosCorreccion)
def catalogos(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> CatalogosCorreccion:
    status = session.execute(
        text("SELECT folio, nombre FROM cat_status_revision ORDER BY folio")
    ).mappings().all()
    productos = session.execute(
        text("SELECT folio, nombre FROM cat_productos ORDER BY nombre")
    ).mappings().all()
    especies = session.execute(
        text("SELECT folio, nombre FROM cat_especies ORDER BY nombre, folio")
    ).mappings().all()
    return CatalogosCorreccion(
        status_revision=[CatalogoItem(**dict(r)) for r in status],
        productos=[CatalogoItem(**dict(r)) for r in productos],
        especies=[CatalogoItem(**dict(r)) for r in especies],
    )


# ──────────────────────────────────────────────────────────────────────
# PATCH: corregir una revisión
# ──────────────────────────────────────────────────────────────────────


STATUS_REVISADA_CON_CAPTURA = 2


def _resolver_legacy_user(session: Session, claims: dict) -> tuple[int | None, str | None]:
    try:
        clave = int(claims.get("sub", 0))
    except (TypeError, ValueError):
        return None, None
    row = session.execute(
        text("SELECT clave, nick FROM usuarios WHERE clave = :c"),
        {"c": clave},
    ).mappings().first()
    return (int(row["clave"]), str(row["nick"] or "")) if row else (clave, None)


def _estado_clave_y_db(claims: dict) -> tuple[str, str]:
    from app.core.legacy_db import resolve_database_name

    clave = str(claims.get("legacy_db", "")).upper()[:3]
    try:
        db_name = resolve_database_name(clave)
    except Exception:
        db_name = ""
    return clave, db_name


@router.patch("/revisiones/{folio}", response_model=PatchRevisionResult)
def actualizar_revision(
    folio: int,
    body: PatchRevisionBody,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> PatchRevisionResult:
    cambios_body = {k: v for k, v in body.model_dump(exclude={"identificacion"}).items() if v is not None}

    # 1. Cargar revisión actual
    before = session.execute(
        text("""
            SELECT folio, no_trampa, no_semana, fecha_revision, status_revision,
                   tipo_producto, dias_exposicion, observaciones, validado
              FROM trampas_revision
             WHERE folio = :folio
        """),
        {"folio": folio},
    ).mappings().first()
    if not before:
        raise HTTPException(status_code=404, detail=f"Revisión {folio} no existe")
    before_d = dict(before)

    # 2. Resolver huerto (numeroinscripcion + folio_tecnico) via trampas
    tr_row = session.execute(
        text("""
            SELECT TRIM(numeroinscripcion) AS numeroinscripcion, folio_tecnico
              FROM trampas
             WHERE no_trampa = :t
             LIMIT 1
        """),
        {"t": before_d["no_trampa"]},
    ).mappings().first()
    if not tr_row or not tr_row["numeroinscripcion"]:
        raise HTTPException(status_code=400, detail=f"La trampa {before_d['no_trampa']!r} no está vinculada a ningún huerto")
    numeroinscripcion = str(tr_row["numeroinscripcion"])
    folio_tecnico_ruta = tr_row["folio_tecnico"]  # VARCHAR en trampas

    # 3. Validación bloqueante: TMIMF 'O' activa para ese huerto + semana
    tmimf_row = session.execute(
        text("""
            SELECT folio_tmimf FROM tmimf
             WHERE TRIM(numeroinscripcion) = :inscr
               AND tipo_tarjeta = 'O'
               AND status = 'A'
               AND CAST(NULLIF(semana,'') AS UNSIGNED) = :sem
             LIMIT 1
        """),
        {"inscr": numeroinscripcion, "sem": int(before_d["no_semana"] or 0)},
    ).mappings().first()
    if tmimf_row:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede corregir: ya existe TMIMF operativa "
                f"{tmimf_row['folio_tmimf']} emitida para el huerto {numeroinscripcion} "
                f"en la semana {before_d['no_semana']}. Cancela la TMIMF antes de corregir la revisión."
            ),
        )

    # 4. Pre-validación: si status pasa a 2 requiere identificacion en body
    nuevo_status = cambios_body.get("status_revision", before_d["status_revision"])
    actual_status = before_d["status_revision"]
    entra_a_2 = (nuevo_status == STATUS_REVISADA_CON_CAPTURA) and (actual_status != STATUS_REVISADA_CON_CAPTURA)
    sale_de_2 = (actual_status == STATUS_REVISADA_CON_CAPTURA) and (nuevo_status != STATUS_REVISADA_CON_CAPTURA)
    se_mantiene_en_2 = (nuevo_status == STATUS_REVISADA_CON_CAPTURA) and (actual_status == STATUS_REVISADA_CON_CAPTURA)

    if entra_a_2 and body.identificacion is None:
        raise HTTPException(
            status_code=400,
            detail="Cambiar a 'Revisada con captura' requiere capturar identificación (especie + conteos).",
        )

    # 5. Ejecutar: UPDATE trampas_revision (si hay cambios)
    cambios_trampas_revision_aplicados: dict = {}
    if cambios_body:
        set_clauses = []
        params: dict = {"folio": folio}
        for key in ("fecha_revision", "status_revision", "tipo_producto", "dias_exposicion", "validado"):
            if key in cambios_body:
                set_clauses.append(f"{key} = :{key}")
                params[key] = cambios_body[key]
        session.execute(
            text(f"UPDATE trampas_revision SET {', '.join(set_clauses)} WHERE folio = :folio"),
            params,
        )
        session.commit()
        # diff real
        for k in cambios_body:
            if cambios_body[k] != before_d.get(k):
                cambios_trampas_revision_aplicados[k] = cambios_body[k]

    # 6. Identificación
    user_clave, user_nick = _resolver_legacy_user(session, claims)
    ident_before = session.execute(
        text("""
            SELECT id_identificacion, folio_revision, tipo_especie,
                   hembras_silvestre, machos_silvestre, hembras_esteril, machos_esteril
              FROM identificacion
             WHERE folio_revision = :folio
        """),
        {"folio": folio},
    ).mappings().all()
    ident_before_list = [dict(x) for x in ident_before]

    cambios_identificacion: dict = {"op": "noop"}
    if sale_de_2 and ident_before_list:
        # Eliminar todas las filas de identificación de esta revisión
        session.execute(
            text("DELETE FROM identificacion WHERE folio_revision = :folio"),
            {"folio": folio},
        )
        session.commit()
        cambios_identificacion = {
            "op": "delete",
            "borrados": len(ident_before_list),
            "antes": ident_before_list,
        }

    elif entra_a_2:
        # INSERT fresh
        ident = body.identificacion  # type: ignore[union-attr]
        assert ident is not None
        ahora = datetime.now()
        folio_tecnico_int = _to_int_or_none(folio_tecnico_ruta)
        res = session.execute(
            text("""
                INSERT INTO identificacion
                  (folio_revision, no_trampa, no_semana, tipo_especie,
                   hembras_silvestre, machos_silvestre, hembras_esteril, machos_esteril,
                   folio_tecnico, fecha, hora, usuario)
                VALUES
                  (:folio, :no_trampa, :no_semana, :tipo_especie,
                   :hs, :ms, :he, :me,
                   :ft, :fecha, :hora, :usuario)
            """),
            {
                "folio": folio,
                "no_trampa": before_d["no_trampa"],
                "no_semana": before_d["no_semana"],
                "tipo_especie": ident.tipo_especie,
                "hs": ident.hembras_silvestre,
                "ms": ident.machos_silvestre,
                "he": ident.hembras_esteril,
                "me": ident.machos_esteril,
                "ft": folio_tecnico_int,
                "fecha": ahora.date(),
                "hora": ahora.time().replace(microsecond=0),
                "usuario": (user_nick or "v3-admin")[:20],
            },
        )
        session.commit()
        cambios_identificacion = {"op": "insert", "despues": ident.model_dump(), "id": res.lastrowid}

    elif se_mantiene_en_2 and body.identificacion is not None:
        # UPDATE la primera fila existente (MVP single-species); si no existe, INSERT
        if ident_before_list:
            first = ident_before_list[0]
            ident = body.identificacion
            session.execute(
                text("""
                    UPDATE identificacion
                       SET tipo_especie      = :tipo_especie,
                           hembras_silvestre = :hs,
                           machos_silvestre  = :ms,
                           hembras_esteril   = :he,
                           machos_esteril    = :me
                     WHERE id_identificacion = :id
                """),
                {
                    "tipo_especie": ident.tipo_especie,
                    "hs": ident.hembras_silvestre,
                    "ms": ident.machos_silvestre,
                    "he": ident.hembras_esteril,
                    "me": ident.machos_esteril,
                    "id": first["id_identificacion"],
                },
            )
            session.commit()
            cambios_identificacion = {
                "op": "update",
                "antes": {k: first[k] for k in ("tipo_especie", "hembras_silvestre", "machos_silvestre", "hembras_esteril", "machos_esteril")},
                "despues": ident.model_dump(),
            }
        else:
            ident = body.identificacion
            ahora = datetime.now()
            folio_tecnico_int = _to_int_or_none(folio_tecnico_ruta)
            res = session.execute(
                text("""
                    INSERT INTO identificacion
                      (folio_revision, no_trampa, no_semana, tipo_especie,
                       hembras_silvestre, machos_silvestre, hembras_esteril, machos_esteril,
                       folio_tecnico, fecha, hora, usuario)
                    VALUES
                      (:folio, :no_trampa, :no_semana, :tipo_especie,
                       :hs, :ms, :he, :me,
                       :ft, :fecha, :hora, :usuario)
                """),
                {
                    "folio": folio,
                    "no_trampa": before_d["no_trampa"],
                    "no_semana": before_d["no_semana"],
                    "tipo_especie": ident.tipo_especie,
                    "hs": ident.hembras_silvestre,
                    "ms": ident.machos_silvestre,
                    "he": ident.hembras_esteril,
                    "me": ident.machos_esteril,
                    "ft": folio_tecnico_int,
                    "fecha": ahora.date(),
                    "hora": ahora.time().replace(microsecond=0),
                    "usuario": (user_nick or "v3-admin")[:20],
                },
            )
            session.commit()
            cambios_identificacion = {"op": "insert", "despues": ident.model_dump(), "id": res.lastrowid}

    # 7. Auditoría — una entrada por tabla afectada
    estado_clave, db_name = _estado_clave_y_db(claims)

    if cambios_trampas_revision_aplicados:
        diff_antes = {k: before_d[k] for k in cambios_trampas_revision_aplicados}
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="trampas_revision", operacion="UPDATE",
            registro_pk=str(folio),
            campos_antes=diff_antes, campos_despues=cambios_trampas_revision_aplicados,
            registros_afectados=1,
        )
    if cambios_identificacion["op"] != "noop":
        op_map = {"insert": "INSERT", "update": "UPDATE", "delete": "DELETE"}
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="identificacion", operacion=op_map[cambios_identificacion["op"]],
            registro_pk=f"folio_revision={folio}",
            campos_antes=cambios_identificacion.get("antes"),
            campos_despues=cambios_identificacion.get("despues"),
            registros_afectados=cambios_identificacion.get("borrados", 1),
        )

    # 8. Re-cargar y devolver el estado final
    refreshed = listar_revisiones.__wrapped__ if hasattr(listar_revisiones, "__wrapped__") else None  # type: ignore[attr-defined]
    # más sencillo: ejecutar las mismas queries otra vez
    post = session.execute(
        text("""
            SELECT tr.folio, tr.no_trampa, tr.no_semana, tr.fecha_revision,
                   tr.status_revision, tr.tipo_producto, tr.dias_exposicion,
                   tr.observaciones, tr.validado
              FROM trampas_revision tr WHERE tr.folio = :folio
        """),
        {"folio": folio},
    ).mappings().one()
    ident_post = session.execute(
        text("""
            SELECT tipo_especie, hembras_silvestre, machos_silvestre,
                   hembras_esteril, machos_esteril
              FROM identificacion
             WHERE folio_revision = :folio
             ORDER BY id_identificacion ASC
        """),
        {"folio": folio},
    ).mappings().all()
    ident_payload = None
    if ident_post:
        first = ident_post[0]
        ident_payload = IdentificacionPayload(
            tipo_especie=int(first.get("tipo_especie") or 0),
            hembras_silvestre=int(first.get("hembras_silvestre") or 0),
            machos_silvestre=int(first.get("machos_silvestre") or 0),
            hembras_esteril=int(first.get("hembras_esteril") or 0),
            machos_esteril=int(first.get("machos_esteril") or 0),
        )

    rev_out = RevisionRow(
        folio=int(post["folio"]),
        no_trampa=str(post["no_trampa"] or "").strip(),
        no_semana=int(post["no_semana"] or 0),
        fecha_revision=post.get("fecha_revision"),
        status_revision=post.get("status_revision"),
        tipo_producto=post.get("tipo_producto"),
        dias_exposicion=post.get("dias_exposicion"),
        observaciones=post.get("observaciones"),
        validado=post.get("validado"),
        numeroinscripcion=numeroinscripcion,
        tmimf_o_bloqueo=False,
        tmimf_o_folio=None,
        identificacion=ident_payload,
        identificacion_multiple=len(ident_post) > 1,
    )
    return PatchRevisionResult(
        folio=folio,
        revision=rev_out,
        cambios_trampas_revision=cambios_trampas_revision_aplicados,
        cambios_identificacion=cambios_identificacion,
    )


def _to_int_or_none(value) -> int | None:
    if value is None:
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


# ══════════════════════════════════════════════════════════════════════
# Correcciones sobre tabla `trampas` (PFA → Ruta → lista de trampas)
# ══════════════════════════════════════════════════════════════════════


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
              LEFT JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(t.numeroinscripcion)
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
              LEFT JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(t.numeroinscripcion)
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
        # snapshot de identificacion para audit
        ident_snap = session.execute(
            text("""
                SELECT id_identificacion, folio_revision, tipo_especie,
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

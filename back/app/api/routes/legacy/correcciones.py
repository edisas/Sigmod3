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
    # Lista de 0..N identificaciones por especie capturada en esta revisión.
    # Si status_revision != 2, siempre está vacía. Multi-especie (>1 fila) es
    # común en SIGMOD 2 — no se bloquea.
    identificaciones: list[IdentificacionPayload]


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
    # Set completo de especies capturadas. Enviarlo reemplaza totalmente las
    # filas previas de `identificacion` para esta revisión (DELETE + INSERT N).
    # Requerido al entrar a status 2; omitir o []  → no se tocan.
    identificaciones: list[IdentificacionPayload] | None = None


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
        idents_payload = [
            IdentificacionPayload(
                tipo_especie=int(x.get("tipo_especie") or 0),
                hembras_silvestre=int(x.get("hembras_silvestre") or 0),
                machos_silvestre=int(x.get("machos_silvestre") or 0),
                hembras_esteril=int(x.get("hembras_esteril") or 0),
                machos_esteril=int(x.get("machos_esteril") or 0),
            )
            for x in ids
        ]
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
            identificaciones=idents_payload,
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
        text("SELECT folio, nombre FROM cat_especie_mosca ORDER BY nombre, folio")
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


@router.patch("/revisiones/{folio}", response_model=PatchRevisionResult)
def actualizar_revision(
    folio: int,
    body: PatchRevisionBody,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> PatchRevisionResult:
    cambios_body = {k: v for k, v in body.model_dump(exclude={"identificaciones"}).items() if v is not None}

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

    if entra_a_2 and not body.identificaciones:
        raise HTTPException(
            status_code=400,
            detail="Cambiar a 'Revisada con captura' requiere capturar al menos una identificación (especie + conteos).",
        )

    # Validación del set multi-especie: sin tipos repetidos.
    if body.identificaciones:
        tipos = [i.tipo_especie for i in body.identificaciones]
        if len(tipos) != len(set(tipos)):
            raise HTTPException(
                status_code=400,
                detail="No se puede repetir la misma especie en una sola revisión.",
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
            SELECT folio_revision, tipo_especie,
                   hembras_silvestre, machos_silvestre, hembras_esteril, machos_esteril
              FROM identificacion
             WHERE folio_revision = :folio
        """),
        {"folio": folio},
    ).mappings().all()
    ident_before_list = [dict(x) for x in ident_before]

    # Estrategia unificada para identificacion: cada transición sale_de_2 /
    # entra_a_2 / se_mantiene_en_2 implica "reemplazar el set". Siempre
    # DELETE por folio_revision + INSERT N filas (N puede ser 0 si sale_de_2
    # o si el caller manda identificaciones=[]).
    #
    # Se usa DELETE+INSERT en vez de UPDATE por id_identificacion porque esa
    # columna solo existe en 5/8 BDs legacy (falta en CHP, GRO, OAX). El vínculo
    # lógico `folio_revision` existe en todas.
    cambios_identificacion: dict = {"op": "noop"}

    def _nueva_list() -> list[IdentificacionPayload] | None:
        """Lista objetivo. None = no se toca (no hay transición de status ni lista)."""
        if sale_de_2:
            return []
        if entra_a_2:
            return body.identificaciones or []
        if se_mantiene_en_2 and body.identificaciones is not None:
            return body.identificaciones
        return None

    target = _nueva_list()
    if target is not None:
        # DELETE incondicional; si había filas van al audit trail.
        if ident_before_list:
            session.execute(
                text("DELETE FROM identificacion WHERE folio_revision = :folio"),
                {"folio": folio},
            )
        ids_insertados: list[int] = []
        if target:
            ahora = datetime.now()
            folio_tecnico_int = _to_int_or_none(folio_tecnico_ruta)
            for ident in target:
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
                lastid = res.lastrowid
                if lastid is not None:
                    ids_insertados.append(lastid)
        session.commit()

        if not ident_before_list and target:
            op = "insert"
        elif ident_before_list and not target:
            op = "delete"
        elif ident_before_list and target:
            op = "update"
        else:
            op = "noop"

        if op != "noop":
            cambios_identificacion = {
                "op": op,
                "antes": ident_before_list,
                "despues": [i.model_dump() for i in target],
                "ids": ids_insertados,
                "borrados": len(ident_before_list),
            }

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
        """),
        {"folio": folio},
    ).mappings().all()
    idents_payload = [
        IdentificacionPayload(
            tipo_especie=int(x.get("tipo_especie") or 0),
            hembras_silvestre=int(x.get("hembras_silvestre") or 0),
            machos_silvestre=int(x.get("machos_silvestre") or 0),
            hembras_esteril=int(x.get("hembras_esteril") or 0),
            machos_esteril=int(x.get("machos_esteril") or 0),
        )
        for x in ident_post
    ]

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
        identificaciones=idents_payload,
    )
    return PatchRevisionResult(
        folio=folio,
        revision=rev_out,
        cambios_trampas_revision=cambios_trampas_revision_aplicados,
        cambios_identificacion=cambios_identificacion,
    )




# ══════════════════════════════════════════════════════════════════════
# Correcciones sobre tabla `trampas` (PFA → Ruta → lista de trampas)
# ══════════════════════════════════════════════════════════════════════


# ──────────────────────────────────────────────────────────────────────
# Sub-router de trampas — montado al final para evitar ciclo de import
# ──────────────────────────────────────────────────────────────────────
from app.api.routes.legacy import correcciones_trampas  # noqa: E402

router.include_router(correcciones_trampas.router)

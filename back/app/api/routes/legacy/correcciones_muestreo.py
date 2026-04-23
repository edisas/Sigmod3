"""
Correcciones legacy — captura de muestreo de frutos sobre TMIMFs tipo 'O' que
fueron emitidas sin registro de muestreo.

Flujo UI: PFA → Ruta → Semana con TMIMF 'O' → lista de TMIMFs de esa semana.
Por cada TMIMF se pueden agregar N muestreos (los existentes se muestran y
son editables; la suma alimenta los campos kg_fruta_muestreada y
larvas_por_kg_fruta del TMIMF).

Reglas de negocio:
- `frutos_infestados > 0` ⇒ requiere identificación de larvas
  (especie + estadios) y fuerza `tmimf.mercado_destino = 2` (nacional) para
  todas las filas de tmimf con el mismo `folio_tmimf` (O + I) que no estén
  ya en nacional. El front obliga confirmación explícita del usuario antes
  de ejecutar.
- `frutos_infestados = 0` es válido: guarda sin identificación y sin cambio
  de mercado.
- El muestreo se INSERTA siempre como un registro adicional (no_muestra
  "V3-<folio_tmimf>-<clave_mov>-<timestamp>"). Si ya había muestreos
  previos, los totales del TMIMF se recalculan al consolidado final.

Toda escritura queda en legacy_audit_log V3.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db
from app.core.legacy_audit import record_legacy_write

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class SemanaTmimfRow(BaseModel):
    no_semana: int                # folio en tabla semanas
    periodo: int | None
    semana_label: str             # "17 - 2026"
    tmimfs: int
    muestreos_registrados: int    # cuántas TMIMFs de esta semana ya tienen ≥1 muestreo


class TmimfOperativa(BaseModel):
    folio_tmimf: str
    clave_movilizacion: str
    numeroinscripcion: str
    nombre_huerto: str | None
    mercado_destino: int | None   # 1=exportación, 2=nacional
    kg_fruta_muestreada: float    # acumulado actualmente en tmimf
    larvas_por_kg_fruta: int      # actualmente en tmimf
    muestreos_count: int          # cuántos registros en muestreo_de_frutos ya hay
    frutos_infestados_total: int  # suma de frutos_infestados de todos los muestreos del huerto+semana
    has_larvas: bool              # flag rápido para UI


class IdentificacionLarvas(BaseModel):
    especie: int = Field(ge=1)
    no_larvas: int = Field(default=0, ge=0)
    larvas1e: int = Field(default=0, ge=0)
    larvas2e: int = Field(default=0, ge=0)
    larvas3e: int = Field(default=0, ge=0)
    observaciones: str | None = None


class MuestreoRow(BaseModel):
    folio: int
    no_muestra: str
    fecha_muestreo: date | None
    fecha_diseccion: date | None
    no_frutos: int
    kgs_muestreados: float
    kgs_disectados: float
    frutos_infestados: int
    tipo_colecta: int | None      # 1=ÁRBOL, 2=SUELO
    variedad: int | None
    identificaciones: list[dict]  # snapshots de identificacion_laboratorio


class TmimfDetalle(BaseModel):
    folio_tmimf: str
    clave_movilizacion: str
    numeroinscripcion: str
    nombre_huerto: str | None
    no_semana: int
    mercado_destino: int | None
    kg_fruta_muestreada: float
    larvas_por_kg_fruta: int
    variedades_disponibles: list[dict]  # [{folio, descripcion}]
    muestreos: list[MuestreoRow]


class VariedadRow(BaseModel):
    folio: int
    descripcion: str


class CatalogosMuestreo(BaseModel):
    especies_mosca: list[dict]  # [{folio, nombre}]
    variedades_mango: list[VariedadRow]
    tipos_colecta: list[dict]   # hardcoded: [{folio:1, nombre:'ÁRBOL'}, {folio:2, nombre:'SUELO'}]


class PreviewCambioMercado(BaseModel):
    cambiara_mercado: bool
    folio_tmimf: str
    tmimfs_afectadas: int  # cuántas filas de tmimf pasarán de !=2 a 2
    mensaje: str


class MuestreoInsertBody(BaseModel):
    folio_tmimf: str
    clave_movilizacion: str
    fecha_muestreo: date
    fecha_diseccion: date | None = None
    no_frutos: int = Field(ge=0)
    kgs_muestreados: float = Field(ge=0)
    kgs_disectados: float = Field(default=0, ge=0)
    frutos_infestados: int = Field(default=0, ge=0)
    tipo_colecta: Literal[1, 2]
    variedad: int | None = None
    identificacion: IdentificacionLarvas | None = None
    confirmar_cambio_mercado: bool = False


class MuestreoUpdateBody(BaseModel):
    fecha_muestreo: date | None = None
    fecha_diseccion: date | None = None
    no_frutos: int | None = Field(default=None, ge=0)
    kgs_muestreados: float | None = Field(default=None, ge=0)
    kgs_disectados: float | None = Field(default=None, ge=0)
    frutos_infestados: int | None = Field(default=None, ge=0)
    tipo_colecta: Literal[1, 2] | None = None
    variedad: int | None = None
    identificacion: IdentificacionLarvas | None = None
    confirmar_cambio_mercado: bool = False


class MuestreoResult(BaseModel):
    folio: int
    tmimf: TmimfDetalle
    cascada: dict  # { tmimf_mercado_cambiado: N, identificacion_creada: bool, ... }


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


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


def _cargar_tmimf_detalle(session: Session, folio_tmimf: str, clave_mov: str) -> TmimfDetalle:
    """Reconstruye el payload completo de una TMIMF 'O' con sus muestreos y
    catálogo de variedades del huerto."""
    row = session.execute(
        text("""
            SELECT t.folio_tmimf, t.clave_movilizacion,
                   TRIM(t.numeroinscripcion) AS numeroinscripcion,
                   CAST(NULLIF(t.semana,'') AS UNSIGNED) AS no_semana,
                   t.mercado_destino,
                   IFNULL(t.kg_fruta_muestreada, 0) AS kg_fruta_muestreada,
                   IFNULL(t.larvas_por_kg_fruta, 0) AS larvas_por_kg_fruta,
                   sv.nombre_unidad AS nombre_huerto,
                   sv.clave_especie AS clave_especie
              FROM tmimf t
              LEFT JOIN sv01_sv02 sv ON sv.numeroinscripcion = t.numeroinscripcion
             WHERE t.folio_tmimf = :f AND t.clave_movilizacion = :k
        """),
        {"f": folio_tmimf, "k": clave_mov},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="TMIMF no encontrada")

    variedades = session.execute(
        text("""
            SELECT folio, descripcion FROM cat_variedades
             WHERE especie = IFNULL(:esp, 1)
             ORDER BY descripcion ASC
        """),
        {"esp": row["clave_especie"]},
    ).mappings().all()

    muestreos_rows = session.execute(
        text("""
            SELECT folio, no_muestra, fecha_muestreo, fecha_diseccion,
                   IFNULL(no_frutos,0) no_frutos,
                   IFNULL(kgs_muestreados,0) kgs_muestreados,
                   IFNULL(kgs_disectados,0) kgs_disectados,
                   IFNULL(frutos_infestados,0) frutos_infestados,
                   tipo_colecta, variedad
              FROM muestreo_de_frutos
             WHERE numeroinscripcion = :ni AND no_semana = :sem
             ORDER BY folio ASC
        """),
        {"ni": row["numeroinscripcion"], "sem": row["no_semana"]},
    ).mappings().all()

    muestreos_out: list[MuestreoRow] = []
    for m in muestreos_rows:
        idents = session.execute(
            text("""
                SELECT folio, especie, no_larvas, larvas1e, larvas2e, larvas3e, observaciones
                  FROM identificacion_laboratorio
                 WHERE no_muestra = :nm
                 ORDER BY folio ASC
            """),
            {"nm": m["no_muestra"]},
        ).mappings().all()
        muestreos_out.append(MuestreoRow(
            folio=int(m["folio"]),
            no_muestra=str(m["no_muestra"] or ""),
            fecha_muestreo=m["fecha_muestreo"],
            fecha_diseccion=m["fecha_diseccion"],
            no_frutos=int(m["no_frutos"] or 0),
            kgs_muestreados=float(m["kgs_muestreados"] or 0),
            kgs_disectados=float(m["kgs_disectados"] or 0),
            frutos_infestados=int(m["frutos_infestados"] or 0),
            tipo_colecta=m["tipo_colecta"],
            variedad=m["variedad"],
            identificaciones=[dict(x) for x in idents],
        ))

    return TmimfDetalle(
        folio_tmimf=str(row["folio_tmimf"]),
        clave_movilizacion=str(row["clave_movilizacion"]),
        numeroinscripcion=str(row["numeroinscripcion"]),
        nombre_huerto=row["nombre_huerto"],
        no_semana=int(row["no_semana"] or 0),
        mercado_destino=row["mercado_destino"],
        kg_fruta_muestreada=float(row["kg_fruta_muestreada"] or 0),
        larvas_por_kg_fruta=int(row["larvas_por_kg_fruta"] or 0),
        variedades_disponibles=[dict(v) for v in variedades],
        muestreos=muestreos_out,
    )


def _recalcular_tmimf(session: Session, folio_tmimf: str, clave_mov: str, numeroinscripcion: str, no_semana: int) -> tuple[float, int, int]:
    """Recalcula kg_fruta_muestreada, larvas_por_kg_fruta y frutos_infestados
    del TMIMF sumando todos los muestreos+identificaciones vigentes del
    huerto+semana. Ejecuta el UPDATE y devuelve los totales nuevos."""
    agg = session.execute(
        text("""
            SELECT IFNULL(SUM(kgs_muestreados),0) AS kgs,
                   IFNULL(SUM(frutos_infestados),0) AS inf,
                   IFNULL(SUM(no_frutos),0) AS nfr
              FROM muestreo_de_frutos
             WHERE numeroinscripcion = :ni AND no_semana = :sem
        """),
        {"ni": numeroinscripcion, "sem": no_semana},
    ).mappings().one()
    total_kgs = float(agg["kgs"] or 0)
    total_inf = int(agg["inf"] or 0)
    total_nfr = int(agg["nfr"] or 0)

    # Total larvas desde identificacion_laboratorio unidas por no_muestra
    larvas_row = session.execute(
        text("""
            SELECT IFNULL(SUM(il.no_larvas),0) AS total
              FROM identificacion_laboratorio il
              JOIN muestreo_de_frutos mf ON mf.no_muestra = il.no_muestra
             WHERE mf.numeroinscripcion = :ni AND mf.no_semana = :sem
        """),
        {"ni": numeroinscripcion, "sem": no_semana},
    ).mappings().one()
    total_larvas = int(larvas_row["total"] or 0)
    larvas_por_kg = round(total_larvas / total_kgs) if total_kgs > 0 else 0

    session.execute(
        text("""
            UPDATE tmimf
               SET kg_fruta_muestreada = :kgs,
                   larvas_por_kg_fruta = :lar,
                   frutos_larvados = :inf,
                   numero_de_larvas = :lar_abs
             WHERE folio_tmimf = :f AND clave_movilizacion = :k
        """),
        {"kgs": total_kgs, "lar": larvas_por_kg, "inf": total_inf,
         "lar_abs": total_larvas, "f": folio_tmimf, "k": clave_mov},
    )
    session.commit()
    return total_kgs, total_inf, total_nfr


def _cambiar_mercado_cascade(session: Session, folio_tmimf: str) -> list[dict]:
    """Pasa a mercado_destino=2 todas las filas de tmimf con mismo folio_tmimf
    (tipo O e I) que aún no estén en nacional. Devuelve snapshot de las filas
    modificadas para auditoría."""
    rows_before = session.execute(
        text("""
            SELECT folio_tmimf, clave_movilizacion, tipo_tarjeta, mercado_destino
              FROM tmimf
             WHERE folio_tmimf = :f
               AND (mercado_destino IS NULL OR mercado_destino <> 2)
        """),
        {"f": folio_tmimf},
    ).mappings().all()
    snapshot = [dict(r) for r in rows_before]
    if snapshot:
        session.execute(
            text("""
                UPDATE tmimf SET mercado_destino = 2
                 WHERE folio_tmimf = :f
                   AND (mercado_destino IS NULL OR mercado_destino <> 2)
            """),
            {"f": folio_tmimf},
        )
        session.commit()
    return snapshot


def _preview_cambio_mercado(session: Session, folio_tmimf: str) -> PreviewCambioMercado:
    rows = session.execute(
        text("""
            SELECT folio_tmimf, tipo_tarjeta, mercado_destino FROM tmimf
             WHERE folio_tmimf = :f
               AND (mercado_destino IS NULL OR mercado_destino <> 2)
        """),
        {"f": folio_tmimf},
    ).mappings().all()
    n = len(rows)
    if n == 0:
        return PreviewCambioMercado(
            cambiara_mercado=False, folio_tmimf=folio_tmimf, tmimfs_afectadas=0,
            mensaje="Todas las TMIMF con este folio ya están en mercado nacional.",
        )
    tipos = sorted({str(r["tipo_tarjeta"] or "").strip() or "?" for r in rows})
    return PreviewCambioMercado(
        cambiara_mercado=True,
        folio_tmimf=folio_tmimf,
        tmimfs_afectadas=n,
        mensaje=(
            f"Con este cambio, {n} TMIMF(s) con folio {folio_tmimf} "
            f"({', '.join(f'tipo {t}' for t in tipos)}) pasarán a mercado NACIONAL. "
            "Los huertos con larva detectada pierden su estatus de exportación. "
            "¿Confirmas el cambio?"
        ),
    )


# ──────────────────────────────────────────────────────────────────────
# GETs — cascada de selectores + lista de TMIMFs + catálogos
# ──────────────────────────────────────────────────────────────────────


@router.get("/semanas-con-tmimf-o", response_model=list[SemanaTmimfRow])
def semanas_con_tmimf_o(
    ruta: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[SemanaTmimfRow]:
    # TMIMFs 'O' activas de la ruta (via cat_rutas.folio y tmimf.folio_ruta si existe,
    # o via huertos de la ruta)
    rows = session.execute(
        text("""
            SELECT CAST(NULLIF(t.semana,'') AS UNSIGNED) AS no_semana,
                   COUNT(*) AS tmimfs,
                   COUNT(DISTINCT CASE
                       WHEN EXISTS (
                           SELECT 1 FROM muestreo_de_frutos mf
                            WHERE mf.numeroinscripcion = t.numeroinscripcion
                              AND mf.no_semana = CAST(NULLIF(t.semana,'') AS UNSIGNED)
                       ) THEN t.folio_tmimf END) AS muestreos_registrados
              FROM tmimf t
              JOIN sv01_sv02 sv ON sv.numeroinscripcion = t.numeroinscripcion
             WHERE sv.folio_ruta = :ruta
               AND t.tipo_tarjeta = 'O' AND t.status = 'A'
               AND t.semana IS NOT NULL AND t.semana <> ''
             GROUP BY no_semana
             ORDER BY no_semana DESC
             LIMIT 52
        """),
        {"ruta": ruta},
    ).mappings().all()
    out: list[SemanaTmimfRow] = []
    for r in rows:
        folio = int(r["no_semana"] or 0)
        sem_info = session.execute(
            text("SELECT no_semana, periodo FROM semanas WHERE folio = :f"),
            {"f": folio},
        ).mappings().first()
        if sem_info:
            label = f"{int(sem_info['no_semana'])} - {int(sem_info['periodo'])}"
            periodo = int(sem_info["periodo"])
        else:
            label = f"sem {folio}"
            periodo = None
        out.append(SemanaTmimfRow(
            no_semana=folio, periodo=periodo, semana_label=label,
            tmimfs=int(r["tmimfs"] or 0),
            muestreos_registrados=int(r["muestreos_registrados"] or 0),
        ))
    return out


@router.get("/tmimfs-sin-muestreo", response_model=list[TmimfOperativa])
def tmimfs_de_semana(
    ruta: int = Query(..., ge=1),
    semana: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[TmimfOperativa]:
    rows = session.execute(
        text("""
            SELECT t.folio_tmimf, t.clave_movilizacion,
                   TRIM(t.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_unidad AS nombre_huerto,
                   t.mercado_destino,
                   IFNULL(t.kg_fruta_muestreada, 0) AS kg_fruta_muestreada,
                   IFNULL(t.larvas_por_kg_fruta, 0) AS larvas_por_kg_fruta,
                   (SELECT COUNT(*) FROM muestreo_de_frutos mf
                     WHERE mf.numeroinscripcion = t.numeroinscripcion
                       AND mf.no_semana = CAST(NULLIF(t.semana,'') AS UNSIGNED)) AS muestreos_count,
                   (SELECT IFNULL(SUM(mf.frutos_infestados),0) FROM muestreo_de_frutos mf
                     WHERE mf.numeroinscripcion = t.numeroinscripcion
                       AND mf.no_semana = CAST(NULLIF(t.semana,'') AS UNSIGNED)) AS frutos_infestados_total
              FROM tmimf t
              JOIN sv01_sv02 sv ON sv.numeroinscripcion = t.numeroinscripcion
             WHERE sv.folio_ruta = :ruta
               AND t.tipo_tarjeta = 'O' AND t.status = 'A'
               AND CAST(NULLIF(t.semana,'') AS UNSIGNED) = :sem
             ORDER BY t.folio_tmimf ASC
        """),
        {"ruta": ruta, "sem": semana},
    ).mappings().all()
    out: list[TmimfOperativa] = []
    for r in rows:
        inf_total = int(r["frutos_infestados_total"] or 0)
        out.append(TmimfOperativa(
            folio_tmimf=str(r["folio_tmimf"]),
            clave_movilizacion=str(r["clave_movilizacion"]),
            numeroinscripcion=str(r["numeroinscripcion"] or ""),
            nombre_huerto=r["nombre_huerto"],
            mercado_destino=r["mercado_destino"],
            kg_fruta_muestreada=float(r["kg_fruta_muestreada"] or 0),
            larvas_por_kg_fruta=int(r["larvas_por_kg_fruta"] or 0),
            muestreos_count=int(r["muestreos_count"] or 0),
            frutos_infestados_total=inf_total,
            has_larvas=(inf_total > 0),
        ))
    return out


@router.get("/tmimf-detalle", response_model=TmimfDetalle)
def tmimf_detalle(
    folio_tmimf: str = Query(..., min_length=1),
    clave_movilizacion: str = Query(..., min_length=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> TmimfDetalle:
    return _cargar_tmimf_detalle(session, folio_tmimf, clave_movilizacion)


@router.get("/catalogos", response_model=CatalogosMuestreo)
def catalogos_muestreo(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> CatalogosMuestreo:
    especies = session.execute(
        text("SELECT folio, nombre FROM cat_especie_mosca ORDER BY nombre ASC")
    ).mappings().all()
    variedades = session.execute(
        text("""
            SELECT folio, descripcion FROM cat_variedades
             WHERE especie = 1 ORDER BY descripcion ASC
        """)
    ).mappings().all()
    return CatalogosMuestreo(
        especies_mosca=[dict(e) for e in especies],
        variedades_mango=[VariedadRow(**dict(v)) for v in variedades],
        tipos_colecta=[{"folio": 1, "nombre": "ÁRBOL"}, {"folio": 2, "nombre": "SUELO"}],
    )


# ──────────────────────────────────────────────────────────────────────
# POST: insertar muestreo nuevo (con cascadas)
# ──────────────────────────────────────────────────────────────────────


@router.post("/muestreos", response_model=MuestreoResult)
def crear_muestreo(
    body: MuestreoInsertBody,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> MuestreoResult:
    # 1. Validar TMIMF
    tmimf = session.execute(
        text("""
            SELECT folio_tmimf, clave_movilizacion,
                   TRIM(numeroinscripcion) AS numeroinscripcion,
                   CAST(NULLIF(semana,'') AS UNSIGNED) AS no_semana,
                   mercado_destino, modulo_emisor
              FROM tmimf
             WHERE folio_tmimf = :f AND clave_movilizacion = :k
               AND tipo_tarjeta = 'O' AND status = 'A'
        """),
        {"f": body.folio_tmimf, "k": body.clave_movilizacion},
    ).mappings().first()
    if not tmimf:
        raise HTTPException(status_code=404, detail="TMIMF 'O' activa no encontrada")

    # 2. Si frutos_infestados > 0 requiere identificación
    if body.frutos_infestados > 0 and body.identificacion is None:
        raise HTTPException(
            status_code=400,
            detail="Cuando frutos_infestados > 0 se requiere capturar la identificación de larvas.",
        )

    # 3. Si va a cambiar mercado y no viene confirmado → 409 con preview
    preview = _preview_cambio_mercado(session, body.folio_tmimf)
    if body.frutos_infestados > 0 and preview.cambiara_mercado and not body.confirmar_cambio_mercado:
        raise HTTPException(status_code=409, detail=preview.model_dump())

    # 4. Resolver variedad default si no viene (primera variedad de mango)
    variedad = body.variedad
    if variedad is None:
        v = session.execute(
            text("SELECT folio FROM cat_variedades WHERE especie=1 ORDER BY folio LIMIT 1")
        ).scalar()
        variedad = int(v or 0) or None

    # 5. Resolver folio_tecnico (clave_pfa de la ruta del huerto)
    ft_row = session.execute(
        text("""
            SELECT r.clave_pfa FROM sv01_sv02 sv
              JOIN cat_rutas r ON r.folio = sv.folio_ruta
             WHERE sv.numeroinscripcion = :ni LIMIT 1
        """),
        {"ni": tmimf["numeroinscripcion"]},
    ).scalar()
    folio_tecnico = int(ft_row) if ft_row else None

    # 6. INSERT muestreo_de_frutos
    user_clave, user_nick = _resolver_legacy_user(session, claims)
    ahora = datetime.now()
    no_muestra = f"V3-{body.folio_tmimf}-{body.clave_movilizacion}-{int(ahora.timestamp())}"[:60]
    res = session.execute(
        text("""
            INSERT INTO muestreo_de_frutos
              (no_muestra, fecha_muestreo, fecha_diseccion, numeroinscripcion,
               no_frutos, kgs_muestreados, kgs_disectados, frutos_infestados,
               tipo_colecta, folio_tecnico, folio_area, no_semana, fecha_captura, hora,
               variedad, usuario, camara_maduracion)
            VALUES
              (:no_muestra, :fm, :fd, :ni,
               :nfr, :kgsm, :kgsd, :inf,
               :col, :ft, 2, :sem, :fc, :hr,
               :var, :usr, 0)
        """),
        {
            "no_muestra": no_muestra,
            "fm": body.fecha_muestreo,
            "fd": body.fecha_diseccion,
            "ni": tmimf["numeroinscripcion"],
            "nfr": body.no_frutos,
            "kgsm": body.kgs_muestreados,
            "kgsd": body.kgs_disectados,
            "inf": body.frutos_infestados,
            "col": body.tipo_colecta,
            "ft": folio_tecnico,
            "sem": int(tmimf["no_semana"] or 0),
            "fc": ahora.date(),
            "hr": ahora.time().replace(microsecond=0),
            "var": variedad,
            "usr": (user_nick or "v3-admin")[:20],
        },
    )
    session.commit()
    muestreo_folio = int(res.lastrowid)

    # 7. INSERT identificacion_laboratorio si aplica
    ident_insertada = False
    if body.identificacion is not None:
        ident = body.identificacion
        session.execute(
            text("""
                INSERT INTO identificacion_laboratorio
                  (no_muestra, fecha_diseccion, especie,
                   no_larvas, larvas1e, larvas2e, larvas3e,
                   observaciones, no_semana, fecha, hora, usuario, folio_area)
                VALUES
                  (:nm, :fd, :esp, :nl, :l1, :l2, :l3,
                   :obs, :sem, :fecha, :hora, :usr, 2)
            """),
            {
                "nm": no_muestra,
                "fd": body.fecha_diseccion or body.fecha_muestreo,
                "esp": ident.especie,
                "nl": ident.no_larvas,
                "l1": ident.larvas1e, "l2": ident.larvas2e, "l3": ident.larvas3e,
                "obs": (ident.observaciones or "")[:200],
                "sem": int(tmimf["no_semana"] or 0),
                "fecha": ahora.date(),
                "hora": ahora.time().replace(microsecond=0),
                "usr": (user_nick or "v3-admin")[:20],
            },
        )
        session.commit()
        ident_insertada = True

    # 8. Recalcular totales del TMIMF
    total_kgs, total_inf, _ = _recalcular_tmimf(
        session,
        body.folio_tmimf,
        body.clave_movilizacion,
        str(tmimf["numeroinscripcion"]),
        int(tmimf["no_semana"] or 0),
    )

    # 9. Cambio de mercado si hay larvas detectadas (para toda la familia del folio_tmimf)
    mercado_snapshot: list[dict] = []
    if total_inf > 0:
        mercado_snapshot = _cambiar_mercado_cascade(session, body.folio_tmimf)

    # 10. Auditoría
    estado_clave, db_name = _estado_clave_y_db(claims)
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="muestreo_de_frutos", operacion="INSERT",
        registro_pk=str(muestreo_folio),
        campos_antes=None,
        campos_despues=body.model_dump(exclude={"confirmar_cambio_mercado"}),
        registros_afectados=1,
    )
    if ident_insertada:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="identificacion_laboratorio", operacion="INSERT",
            registro_pk=f"no_muestra={no_muestra}",
            campos_antes=None,
            campos_despues=body.identificacion.model_dump() if body.identificacion else None,
            registros_afectados=1,
        )
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="tmimf", operacion="UPDATE",
        registro_pk=f"{body.folio_tmimf}|{body.clave_movilizacion}",
        campos_antes={"kg_fruta_muestreada_prev": None},
        campos_despues={"kg_fruta_muestreada": total_kgs, "frutos_larvados_total": total_inf},
        registros_afectados=1,
    )
    if mercado_snapshot:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="tmimf", operacion="UPDATE",
            registro_pk=f"folio_tmimf={body.folio_tmimf} mercado→2",
            campos_antes={"snapshot": mercado_snapshot},
            campos_despues={"mercado_destino": 2},
            registros_afectados=len(mercado_snapshot),
        )

    detalle = _cargar_tmimf_detalle(session, body.folio_tmimf, body.clave_movilizacion)
    return MuestreoResult(
        folio=muestreo_folio,
        tmimf=detalle,
        cascada={
            "identificacion_creada": ident_insertada,
            "tmimf_mercado_cambiado": len(mercado_snapshot),
            "kg_fruta_muestreada_total": total_kgs,
            "frutos_infestados_total": total_inf,
        },
    )


# ──────────────────────────────────────────────────────────────────────
# PATCH: editar muestreo existente
# ──────────────────────────────────────────────────────────────────────


@router.patch("/muestreos/{folio}", response_model=MuestreoResult)
def actualizar_muestreo(
    folio: int,
    body: MuestreoUpdateBody,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> MuestreoResult:
    # 1. Cargar muestreo existente y el TMIMF asociado
    mrow = session.execute(
        text("""
            SELECT mf.folio, mf.no_muestra, TRIM(mf.numeroinscripcion) AS numeroinscripcion,
                   mf.no_semana, mf.fecha_muestreo, mf.fecha_diseccion,
                   IFNULL(mf.no_frutos,0) no_frutos,
                   IFNULL(mf.kgs_muestreados,0) kgs_muestreados,
                   IFNULL(mf.kgs_disectados,0) kgs_disectados,
                   IFNULL(mf.frutos_infestados,0) frutos_infestados,
                   mf.tipo_colecta, mf.variedad
              FROM muestreo_de_frutos mf
             WHERE mf.folio = :f
        """),
        {"f": folio},
    ).mappings().first()
    if not mrow:
        raise HTTPException(status_code=404, detail=f"Muestreo {folio} no existe")
    before_d = dict(mrow)

    tmi = session.execute(
        text("""
            SELECT folio_tmimf, clave_movilizacion, mercado_destino
              FROM tmimf
             WHERE tipo_tarjeta='O' AND status='A'
               AND numeroinscripcion = :ni
               AND CAST(NULLIF(semana,'') AS UNSIGNED) = :sem
             LIMIT 1
        """),
        {"ni": before_d["numeroinscripcion"], "sem": int(before_d["no_semana"] or 0)},
    ).mappings().first()
    if not tmi:
        raise HTTPException(status_code=404, detail="TMIMF 'O' asociada no existe o está inactiva")

    cambios = {k: v for k, v in body.model_dump(exclude={"identificacion", "confirmar_cambio_mercado"}).items() if v is not None}
    if body.frutos_infestados is not None and body.frutos_infestados > 0 and body.identificacion is None:
        # Verifica si ya había identificación previa; si no y sube > 0, requiere
        ya_existe = session.execute(
            text("SELECT COUNT(*) FROM identificacion_laboratorio WHERE no_muestra = :nm"),
            {"nm": before_d["no_muestra"]},
        ).scalar() or 0
        if not ya_existe:
            raise HTTPException(status_code=400, detail="Al subir frutos_infestados>0 debes capturar identificación.")

    # Detectar si el cambio eleva frutos_infestados en conjunto → cascade mercado
    nuevo_inf = body.frutos_infestados if body.frutos_infestados is not None else int(before_d["frutos_infestados"] or 0)
    if nuevo_inf > 0:
        preview = _preview_cambio_mercado(session, str(tmi["folio_tmimf"]))
        if preview.cambiara_mercado and not body.confirmar_cambio_mercado:
            raise HTTPException(status_code=409, detail=preview.model_dump())

    # UPDATE muestreo_de_frutos
    if cambios:
        set_clauses = [f"{k} = :{k}" for k in cambios]
        params = {**cambios, "f": folio}
        session.execute(
            text(f"UPDATE muestreo_de_frutos SET {', '.join(set_clauses)} WHERE folio = :f"),
            params,
        )
        session.commit()

    # Handle identificación: si viene en body, DELETE+INSERT (simple, consistente)
    user_clave, user_nick = _resolver_legacy_user(session, claims)
    ident_snapshot_antes = session.execute(
        text("SELECT * FROM identificacion_laboratorio WHERE no_muestra = :nm"),
        {"nm": before_d["no_muestra"]},
    ).mappings().all()
    ident_op = "noop"
    if body.identificacion is not None:
        session.execute(
            text("DELETE FROM identificacion_laboratorio WHERE no_muestra = :nm"),
            {"nm": before_d["no_muestra"]},
        )
        ahora = datetime.now()
        ident = body.identificacion
        session.execute(
            text("""
                INSERT INTO identificacion_laboratorio
                  (no_muestra, fecha_diseccion, especie, no_larvas,
                   larvas1e, larvas2e, larvas3e, observaciones,
                   no_semana, fecha, hora, usuario, folio_area)
                VALUES
                  (:nm, :fd, :esp, :nl, :l1, :l2, :l3, :obs,
                   :sem, :fecha, :hora, :usr, 2)
            """),
            {
                "nm": before_d["no_muestra"],
                "fd": body.fecha_diseccion or before_d["fecha_diseccion"] or ahora.date(),
                "esp": ident.especie,
                "nl": ident.no_larvas,
                "l1": ident.larvas1e, "l2": ident.larvas2e, "l3": ident.larvas3e,
                "obs": (ident.observaciones or "")[:200],
                "sem": int(before_d["no_semana"] or 0),
                "fecha": ahora.date(), "hora": ahora.time().replace(microsecond=0),
                "usr": (user_nick or "v3-admin")[:20],
            },
        )
        session.commit()
        ident_op = "upsert"
    elif nuevo_inf == 0 and ident_snapshot_antes:
        # Si frutos_infestados bajó a 0, borramos identificación existente
        session.execute(
            text("DELETE FROM identificacion_laboratorio WHERE no_muestra = :nm"),
            {"nm": before_d["no_muestra"]},
        )
        session.commit()
        ident_op = "delete"

    # Recalcular TMIMF
    total_kgs, total_inf, _ = _recalcular_tmimf(
        session, str(tmi["folio_tmimf"]), str(tmi["clave_movilizacion"]),
        str(before_d["numeroinscripcion"]), int(before_d["no_semana"] or 0),
    )

    mercado_snapshot: list[dict] = []
    if total_inf > 0:
        mercado_snapshot = _cambiar_mercado_cascade(session, str(tmi["folio_tmimf"]))

    # Auditoría
    estado_clave, db_name = _estado_clave_y_db(claims)
    if cambios:
        diff_antes = {k: before_d.get(k) for k in cambios}
        diff_antes = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in diff_antes.items()}
        cambios_ser = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in cambios.items()}
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="muestreo_de_frutos", operacion="UPDATE",
            registro_pk=str(folio),
            campos_antes=diff_antes, campos_despues=cambios_ser,
            registros_afectados=1,
        )
    if ident_op != "noop":
        op_map = {"upsert": "UPDATE", "delete": "DELETE"}
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="identificacion_laboratorio", operacion=op_map[ident_op],
            registro_pk=f"no_muestra={before_d['no_muestra']}",
            campos_antes={"snapshot": [dict(x) for x in ident_snapshot_antes]},
            campos_despues=body.identificacion.model_dump() if body.identificacion else None,
            registros_afectados=len(ident_snapshot_antes) or 1,
        )
    if mercado_snapshot:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="tmimf", operacion="UPDATE",
            registro_pk=f"folio_tmimf={tmi['folio_tmimf']} mercado→2",
            campos_antes={"snapshot": mercado_snapshot},
            campos_despues={"mercado_destino": 2},
            registros_afectados=len(mercado_snapshot),
        )

    detalle = _cargar_tmimf_detalle(session, str(tmi["folio_tmimf"]), str(tmi["clave_movilizacion"]))
    return MuestreoResult(
        folio=folio,
        tmimf=detalle,
        cascada={
            "identificacion_op": ident_op,
            "tmimf_mercado_cambiado": len(mercado_snapshot),
            "kg_fruta_muestreada_total": total_kgs,
            "frutos_infestados_total": total_inf,
        },
    )


# ──────────────────────────────────────────────────────────────────────
# DELETE: borrar muestreo y su identificación; recalcular TMIMF
# ──────────────────────────────────────────────────────────────────────


@router.delete("/muestreos/{folio}", response_model=MuestreoResult)
def eliminar_muestreo(
    folio: int,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> MuestreoResult:
    mrow = session.execute(
        text("""
            SELECT folio, no_muestra, TRIM(numeroinscripcion) AS numeroinscripcion,
                   no_semana, fecha_muestreo, fecha_diseccion, no_frutos,
                   kgs_muestreados, kgs_disectados, frutos_infestados,
                   tipo_colecta, variedad
              FROM muestreo_de_frutos WHERE folio = :f
        """),
        {"f": folio},
    ).mappings().first()
    if not mrow:
        raise HTTPException(status_code=404, detail=f"Muestreo {folio} no existe")
    before_d = dict(mrow)

    tmi = session.execute(
        text("""
            SELECT folio_tmimf, clave_movilizacion FROM tmimf
             WHERE tipo_tarjeta='O' AND status='A'
               AND numeroinscripcion = :ni
               AND CAST(NULLIF(semana,'') AS UNSIGNED) = :sem LIMIT 1
        """),
        {"ni": before_d["numeroinscripcion"], "sem": int(before_d["no_semana"] or 0)},
    ).mappings().first()

    # Snapshot de identificación
    idents = session.execute(
        text("SELECT * FROM identificacion_laboratorio WHERE no_muestra = :nm"),
        {"nm": before_d["no_muestra"]},
    ).mappings().all()

    session.execute(
        text("DELETE FROM identificacion_laboratorio WHERE no_muestra = :nm"),
        {"nm": before_d["no_muestra"]},
    )
    session.execute(
        text("DELETE FROM muestreo_de_frutos WHERE folio = :f"),
        {"f": folio},
    )
    session.commit()

    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)
    before_ser = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in before_d.items()}
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="muestreo_de_frutos", operacion="DELETE",
        registro_pk=str(folio), campos_antes=before_ser, campos_despues=None,
        registros_afectados=1,
    )
    if idents:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="identificacion_laboratorio", operacion="DELETE",
            registro_pk=f"no_muestra={before_d['no_muestra']}",
            campos_antes={"snapshot": [dict(x) for x in idents]},
            campos_despues=None,
            registros_afectados=len(idents),
        )

    # Recalcular TMIMF si lo hay
    total_kgs, total_inf = 0.0, 0
    if tmi:
        total_kgs, total_inf, _ = _recalcular_tmimf(
            session, str(tmi["folio_tmimf"]), str(tmi["clave_movilizacion"]),
            str(before_d["numeroinscripcion"]), int(before_d["no_semana"] or 0),
        )
        detalle = _cargar_tmimf_detalle(session, str(tmi["folio_tmimf"]), str(tmi["clave_movilizacion"]))
    else:
        # Sin TMIMF asociada, devolver payload mínimo
        detalle = TmimfDetalle(
            folio_tmimf="", clave_movilizacion="",
            numeroinscripcion=str(before_d["numeroinscripcion"]),
            nombre_huerto=None, no_semana=int(before_d["no_semana"] or 0),
            mercado_destino=None, kg_fruta_muestreada=0, larvas_por_kg_fruta=0,
            variedades_disponibles=[], muestreos=[],
        )

    return MuestreoResult(
        folio=folio,
        tmimf=detalle,
        cascada={
            "kg_fruta_muestreada_total": total_kgs,
            "frutos_infestados_total": total_inf,
            "identificaciones_borradas": len(idents),
        },
    )

import time
from collections import defaultdict
from datetime import date
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db

router = APIRouter()

MERCADO_EXPORTACION = 1
MERCADO_NACIONAL = 2
UNIT_DIVISOR = 1000  # kg → toneladas
ESPECIE_FILTRO = 1   # solo variedades de esta especie
SEMANAS_CACHE_TTL_SECONDS = 1800  # 30 min

_semanas_cache: dict[str, tuple[float, list[dict]]] = {}
_semanas_cache_lock = Lock()


class CatalogoItem(BaseModel):
    folio: int
    nombre: str


class MercadoConcentrado(BaseModel):
    por_modulo: dict[int, float]
    total: float


class DetalladoFila(BaseModel):
    folio_modulo: int
    nombre_modulo: str
    mercado: str
    por_variedad: dict[int, float]
    total: float


class ConcentradoEnLineaResponse(BaseModel):
    modulos: list[CatalogoItem]
    variedades: list[CatalogoItem]
    concentrado: dict[str, MercadoConcentrado]
    detallado: list[DetalladoFila]
    totales_por_variedad: dict[int, float]
    total_global: float


class SemanaOption(BaseModel):
    folio: int
    no_semana: int
    periodo: int
    fecha_inicio: date
    fecha_final: date
    label: str


def _compute_concentrado(
    session: Session,
    extra_where: str = "",
    extra_params: dict | None = None,
) -> ConcentradoEnLineaResponse:
    params: dict = {"especie": ESPECIE_FILTRO, **(extra_params or {})}

    modulos_rows = session.execute(
        text("SELECT folio, nombre_modulo FROM cat_modulos ORDER BY folio")
    ).mappings().all()
    variedades_rows = session.execute(
        text("SELECT folio, descripcion FROM cat_variedades WHERE especie = :especie ORDER BY descripcion"),
        {"especie": ESPECIE_FILTRO},
    ).mappings().all()

    modulos = [CatalogoItem(folio=int(r["folio"]), nombre=str(r["nombre_modulo"])) for r in modulos_rows]
    variedades = [CatalogoItem(folio=int(r["folio"]), nombre=str(r["descripcion"])) for r in variedades_rows]

    sql = f"""
        SELECT
          tmi.modulo_emisor    AS modulo_folio,
          tmi.mercado_destino  AS mercado,
          det.variedad_movilizada AS variedad_folio,
          COALESCE(SUM(det.cantidad_movilizada), 0) AS cantidad
        FROM detallado_tmimf AS det
        JOIN tmimf AS tmi            ON det.folio_completo = tmi.folio_tmimf
        JOIN cat_variedades AS v     ON v.folio = det.variedad_movilizada
        WHERE det.status <> 'C'
          AND tmi.modulo_emisor IS NOT NULL
          AND v.especie = :especie
          {extra_where}
        GROUP BY tmi.modulo_emisor, tmi.mercado_destino, det.variedad_movilizada
    """
    aggregated = session.execute(text(sql), params).mappings().all()

    modulos_validos = {m.folio for m in modulos}

    concentrado_modulo: dict[str, dict[int, float]] = {
        "exportacion": defaultdict(float),
        "nacional":    defaultdict(float),
        "totales":     defaultdict(float),
    }
    concentrado_total: dict[str, float] = {"exportacion": 0.0, "nacional": 0.0, "totales": 0.0}

    detallado_map: dict[tuple[int, str], dict[int, float]] = defaultdict(lambda: defaultdict(float))
    totales_variedad: dict[int, float] = defaultdict(float)
    total_global = 0.0

    for row in aggregated:
        raw_modulo = row["modulo_folio"]
        if raw_modulo is None or int(raw_modulo) not in modulos_validos:
            continue
        modulo = int(raw_modulo)
        mercado = int(row["mercado"] or 0)
        variedad = int(row["variedad_folio"] or 0)
        cantidad = float(row["cantidad"] or 0) / UNIT_DIVISOR

        mercado_key = (
            "exportacion" if mercado == MERCADO_EXPORTACION
            else "nacional" if mercado == MERCADO_NACIONAL
            else None
        )

        concentrado_modulo["totales"][modulo] += cantidad
        concentrado_total["totales"] += cantidad
        totales_variedad[variedad] += cantidad
        total_global += cantidad

        if mercado_key:
            concentrado_modulo[mercado_key][modulo] += cantidad
            concentrado_total[mercado_key] += cantidad
            detallado_map[(modulo, mercado_key)][variedad] += cantidad

    concentrado = {
        key: MercadoConcentrado(
            por_modulo={int(k): round(v, 3) for k, v in concentrado_modulo[key].items()},
            total=round(concentrado_total[key], 3),
        )
        for key in ("exportacion", "nacional", "totales")
    }

    detallado: list[DetalladoFila] = []
    modulo_nombre = {m.folio: m.nombre for m in modulos}
    for m in modulos:
        for mercado_key, label in (("exportacion", "Exportación"), ("nacional", "Nacional")):
            por_variedad = detallado_map.get((m.folio, mercado_key), {})
            total = sum(por_variedad.values())
            detallado.append(DetalladoFila(
                folio_modulo=m.folio,
                nombre_modulo=modulo_nombre.get(m.folio, ""),
                mercado=label,
                por_variedad={int(k): round(v, 3) for k, v in por_variedad.items()},
                total=round(total, 3),
            ))

    return ConcentradoEnLineaResponse(
        modulos=modulos,
        variedades=variedades,
        concentrado=concentrado,
        detallado=detallado,
        totales_por_variedad={int(k): round(v, 3) for k, v in totales_variedad.items()},
        total_global=round(total_global, 3),
    )


@router.get("/concentrado-en-linea", response_model=ConcentradoEnLineaResponse)
def concentrado_en_linea(session: Session = Depends(get_legacy_db)) -> ConcentradoEnLineaResponse:
    return _compute_concentrado(session)


def _load_semanas_from_db(session: Session) -> list[dict]:
    # Solo semanas que ya iniciaron (incluye la semana actual), las 50 más recientes.
    rows = session.execute(text("""
        SELECT folio, no_semana, periodo, fecha_inicio, fecha_final
        FROM semanas
        WHERE fecha_inicio <= CURDATE()
        ORDER BY fecha_inicio DESC
        LIMIT 50
    """)).mappings().all()
    return [
        {
            "folio": int(r["folio"]),
            "no_semana": int(r["no_semana"]),
            "periodo": int(r["periodo"]),
            "fecha_inicio": r["fecha_inicio"],
            "fecha_final": r["fecha_final"],
            "label": f"Semana {int(r['no_semana']):02d} — {int(r['periodo'])} "
                     f"({r['fecha_inicio'].strftime('%d-%b')} a {r['fecha_final'].strftime('%d-%b')})",
        }
        for r in rows
    ]


@router.get("/semanas-disponibles", response_model=list[SemanaOption])
def semanas_disponibles(
    force_refresh: bool = Query(False, description="Ignora el caché y re-consulta"),
    claims: dict = Depends(get_current_legacy_claims),
    session: Session = Depends(get_legacy_db),
) -> list[SemanaOption]:
    clave = claims["legacy_db"]
    now = time.time()

    with _semanas_cache_lock:
        cached = _semanas_cache.get(clave)
        if not force_refresh and cached and (now - cached[0]) < SEMANAS_CACHE_TTL_SECONDS:
            data = cached[1]
        else:
            data = _load_semanas_from_db(session)
            _semanas_cache[clave] = (now, data)

    return [SemanaOption(**item) for item in data]


@router.get("/concentrado-en-linea-semanal", response_model=ConcentradoEnLineaResponse)
def concentrado_en_linea_semanal(
    semana_id: int = Query(..., ge=1, description="folio de la tabla semanas"),
    session: Session = Depends(get_legacy_db),
) -> ConcentradoEnLineaResponse:
    exists = session.execute(
        text("SELECT 1 FROM semanas WHERE folio = :id"), {"id": semana_id}
    ).first()
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"La semana folio={semana_id} no existe en el catálogo",
        )

    return _compute_concentrado(
        session,
        extra_where="AND tmi.semana = :semana_str",
        extra_params={"semana_str": str(semana_id)},
    )

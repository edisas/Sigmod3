from fastapi import APIRouter

from app.api.routes import (
    auth,
    autorizaciones,
    catalogos,
    configuracion_sistema,
    control_mecanico,
    control_quimico,
    dashboard,
    estimados_cosecha,
    health,
    identificaciones,
    identificaciones_lab,
    modulos,
    productores,
    revisiones,
    rutas,
    solicitudes,
    superficies,
    tipos_trampa,
    tmimfs,
    trampas,
    tramperos,
    unidades_produccion,
)
from app.api.routes.legacy import router as legacy_router

router = APIRouter()
router.include_router(health.router, tags=["health"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(solicitudes.router, prefix="/solicitudes", tags=["solicitudes"])
router.include_router(catalogos.router, prefix="/catalogos", tags=["catalogos"])
router.include_router(autorizaciones.router, prefix="/autorizaciones", tags=["autorizaciones"])
router.include_router(configuracion_sistema.router, prefix="/configuracion-sistema", tags=["configuracion_sistema"])
router.include_router(productores.router, prefix="/productores", tags=["productores"])
router.include_router(unidades_produccion.router, prefix="/unidades-produccion", tags=["unidades_produccion"])
router.include_router(modulos.router, prefix="/modulos", tags=["modulos"])
router.include_router(rutas.router, prefix="/rutas", tags=["rutas"])
router.include_router(tramperos.router, prefix="/tramperos", tags=["tramperos"])
router.include_router(tipos_trampa.router, prefix="/tipos-trampa", tags=["tipos_trampa"])
router.include_router(trampas.router, prefix="/trampas", tags=["trampas"])
router.include_router(revisiones.router, prefix="/revisiones", tags=["revisiones"])
router.include_router(identificaciones.router, prefix="/identificaciones", tags=["identificaciones"])
router.include_router(dashboard.router, prefix="/dashboard-v3", tags=["dashboard_v3"])
router.include_router(tmimfs.router, prefix="/tmimf", tags=["tmimf"])
router.include_router(estimados_cosecha.router, prefix="/estimados-cosecha", tags=["estimados_cosecha"])
router.include_router(estimados_cosecha.fenologia_router, prefix="/estados-fenologicos", tags=["estados_fenologicos"])
router.include_router(superficies.router, prefix="/superficies", tags=["superficies"])
router.include_router(identificaciones_lab.router, prefix="/identificaciones-lab", tags=["identificaciones_lab"])
router.include_router(control_quimico.router, prefix="/control-quimico", tags=["control_quimico"])
router.include_router(control_mecanico.router, prefix="/control-mecanico", tags=["control_mecanico"])
router.include_router(legacy_router, prefix="/legacy")

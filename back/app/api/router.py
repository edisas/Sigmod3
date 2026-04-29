from fastapi import APIRouter

from app.api.routes import (
    auth,
    autorizaciones,
    catalogos,
    configuracion_sistema,
    dashboard,
    health,
    identificaciones,
    modulos,
    productores,
    revisiones,
    rutas,
    solicitudes,
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
router.include_router(legacy_router, prefix="/legacy")

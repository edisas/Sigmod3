from fastapi import APIRouter

from app.api.routes import (
    auth,
    autorizaciones,
    catalogos,
    configuracion_sistema,
    health,
    modulos,
    productores,
    rutas,
    solicitudes,
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
router.include_router(legacy_router, prefix="/legacy")

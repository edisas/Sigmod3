from fastapi import APIRouter

from app.api.routes.legacy import (
    auth, catalogos, correcciones, correcciones_muestreo,
    dashboard, dashboard_muestreo, dashboard_trampeos,
    informe_general, reportes,
)

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["legacy-auth"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["legacy-dashboard"])
router.include_router(reportes.router, prefix="/reportes", tags=["legacy-reportes"])
router.include_router(
    informe_general.router,
    prefix="/reportes/informe-general",
    tags=["legacy-informe-general"],
)
router.include_router(catalogos.router, prefix="/catalogos", tags=["legacy-catalogos"])
router.include_router(correcciones.router, prefix="/correcciones", tags=["legacy-correcciones"])
router.include_router(correcciones_muestreo.router, prefix="/correcciones/muestreo", tags=["legacy-correcciones-muestreo"])
router.include_router(dashboard_trampeos.router, prefix="/dashboard-trampeos", tags=["legacy-dashboard-trampeos"])
router.include_router(dashboard_muestreo.router, prefix="/dashboard-muestreo", tags=["legacy-dashboard-muestreo"])

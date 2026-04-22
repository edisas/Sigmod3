from fastapi import APIRouter

from app.api.routes.legacy import auth, catalogos, correcciones, dashboard, informe_general, reportes

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

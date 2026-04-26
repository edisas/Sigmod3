from fastapi import APIRouter

from app.api.routes.legacy import (
    auth,
    cancelacion_tmimf,
    catalogos,
    correcciones,
    correcciones_estimado_cosecha,
    correcciones_muestreo,
    correcciones_tmimf_o,
    dashboard,
    dashboard_muestreo,
    dashboard_trampeos,
    informe_general,
    reportes,
    reportes_documentos,
    reportes_estimado_cosecha,
    reportes_informes_semanales,
    reportes_inventario,
    reportes_resumen_diario,
    reportes_tmimf,
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
router.include_router(correcciones_tmimf_o.router, prefix="/correcciones/tmimf-o", tags=["legacy-correcciones-tmimf-o"])
router.include_router(reportes_tmimf.router, prefix="/reportes/tmimf", tags=["legacy-reportes-tmimf"])
router.include_router(reportes_inventario.router, prefix="/reportes/inventario-pfa", tags=["legacy-reportes-inventario"])
router.include_router(reportes_informes_semanales.router, prefix="/reportes/informes-semanales", tags=["legacy-reportes-informes-semanales"])
router.include_router(reportes_resumen_diario.router, prefix="/reportes/resumen-diario", tags=["legacy-reportes-resumen-diario"])
router.include_router(reportes_estimado_cosecha.router, prefix="/reportes/estimado-cosecha", tags=["legacy-reportes-estimado-cosecha"])
router.include_router(reportes_documentos.router, prefix="/reportes/documentos", tags=["legacy-reportes-documentos"])
router.include_router(cancelacion_tmimf.router, prefix="/correcciones/cancelacion-tmimf", tags=["legacy-cancelacion-tmimf"])
router.include_router(correcciones_estimado_cosecha.router, prefix="/correcciones/estimado-cosecha", tags=["legacy-correcciones-estimado-cosecha"])
router.include_router(dashboard_trampeos.router, prefix="/dashboard-trampeos", tags=["legacy-dashboard-trampeos"])
router.include_router(dashboard_muestreo.router, prefix="/dashboard-muestreo", tags=["legacy-dashboard-muestreo"])

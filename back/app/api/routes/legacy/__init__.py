from fastapi import APIRouter

from app.api.routes.legacy import auth, dashboard, reportes

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["legacy-auth"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["legacy-dashboard"])
router.include_router(reportes.router, prefix="/reportes", tags=["legacy-reportes"])

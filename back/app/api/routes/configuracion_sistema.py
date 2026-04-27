from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.dependencies import get_current_user
from app.models import User

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[3]
SYSTEM_DIR = BASE_DIR / "storage" / "system"
ASSETS_DIR = SYSTEM_DIR / "assets"
CONFIG_FILE = SYSTEM_DIR / "system_config.json"

ADMIN_GENERAL_ROLES = {"admin", "administrador general", "administrador senasica"}


def _ensure_paths() -> None:
    SYSTEM_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_admin_general(current_user: User) -> None:
    role = (current_user.rol or "").strip().lower()
    if role not in ADMIN_GENERAL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Administrador General puede modificar la configuracion del sistema.",
        )


def _default_config() -> dict:
    current_palette = {
        "name": "SIGMOD Verde",
        "colors": {
            "primary": "#014421",
            "secondary": "#87CEEB",
            "accent": "#98FF98",
            "neutral_gray": "#D3D3D3",
            "background_light": "#F8FDFA",
            "background_dark": "#011A0D",
            "soft_gray": "#D3D3D3",
            "mint": "#98FF98",
            "sky_blue": "#87CEEB",
        },
    }
    return {
        "system": {
            "full_name": "Sistema para la Gestion de Moscas de la Fruta y Operaciones de Campo",
            "short_name": "SIGMOD 3",
        },
        "assets": {
            "favicon_url": "/favicon.ico",
            "login_logo_url": "/logo_Agricultura_Senasica.png",
            "dashboard_logo_url": "/logoSigmod3_large.svg",
            "report_logo_url": "/logoSigmod3.png",
        },
        "keys": {
            "google_maps_key": "",
            "captcha_site_key": "",
            "captcha_secret_key": "",
        },
        "security": {
            "two_factor_enabled": False,
            "session_timeout_minutes": 30,
            "session_warning_seconds": 60,
        },
        "palette": {
            "active_key": "sigmod_actual",
            "presets": {
                "sigmod_actual": current_palette,
                "oceano": {
                    "name": "Oceano",
                    "colors": {
                        "primary": "#0B3C5D",
                        "secondary": "#328CC1",
                        "accent": "#D9B310",
                        "neutral_gray": "#BFC7CE",
                        "background_light": "#F6FAFD",
                        "background_dark": "#071F2F",
                        "soft_gray": "#CED8E0",
                        "mint": "#7FD4E7",
                        "sky_blue": "#55B7F3",
                    },
                },
                "tierra": {
                    "name": "Tierra",
                    "colors": {
                        "primary": "#4E342E",
                        "secondary": "#8D6E63",
                        "accent": "#FFB74D",
                        "neutral_gray": "#D7CCC8",
                        "background_light": "#FAF7F4",
                        "background_dark": "#2E1F1B",
                        "soft_gray": "#DCCFCB",
                        "mint": "#C5E1A5",
                        "sky_blue": "#90CAF9",
                    },
                },
                "agave": {
                    "name": "Agave",
                    "colors": {
                        "primary": "#1B5E20",
                        "secondary": "#26A69A",
                        "accent": "#FFD54F",
                        "neutral_gray": "#CFD8DC",
                        "background_light": "#F4FBF8",
                        "background_dark": "#102516",
                        "soft_gray": "#D3E0E4",
                        "mint": "#80CBC4",
                        "sky_blue": "#81D4FA",
                    },
                },
            },
            "custom": current_palette,
        },
    }


def _load_config() -> dict:
    _ensure_paths()
    if not CONFIG_FILE.exists():
        cfg = _default_config()
        CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        return cfg
    try:
        raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        defaults = _default_config()
        merged = {
            **defaults,
            **raw,
            "system": {**defaults.get("system", {}), **raw.get("system", {})},
            "assets": {**defaults.get("assets", {}), **raw.get("assets", {})},
            "keys": {**defaults.get("keys", {}), **raw.get("keys", {})},
            "security": {**defaults.get("security", {}), **raw.get("security", {})},
            "palette": {**defaults.get("palette", {}), **raw.get("palette", {})},
        }
        _save_config(merged)
        return merged
    except json.JSONDecodeError:
        cfg = _default_config()
        CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        return cfg


def _save_config(config: dict) -> None:
    _ensure_paths()
    CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _redact_sensitive(config: dict) -> dict:
    safe = json.loads(json.dumps(config))
    keys = safe.get("keys", {})
    if isinstance(keys, dict):
        # Nunca regresar llaves sensibles al frontend.
        keys["google_maps_key"] = ""
        keys["captcha_site_key"] = ""
        keys["captcha_secret_key"] = ""
    safe["keys"] = keys
    return safe


def _store_asset(upload: UploadFile, key_prefix: str) -> str:
    content = upload.file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{key_prefix}: archivo vacio")
    ext = Path(upload.filename or "asset.bin").suffix.lower()[:10] or ".bin"
    file_name = f"{key_prefix}_{uuid4().hex}{ext}"
    file_path = ASSETS_DIR / file_name
    file_path.write_bytes(content)
    return f"/api/v1/configuracion-sistema/assets/{file_name}"


@router.get("/publico")
def get_public_config() -> dict:
    cfg = _load_config()
    security_cfg = cfg.get("security", {}) if isinstance(cfg.get("security", {}), dict) else {}
    return {
        "assets": cfg.get("assets", {}),
        "palette": cfg.get("palette", {}),
        "system": cfg.get("system", {}),
        "navigation": cfg.get("navigation", {}),
        "security": {
            "session_timeout_minutes": security_cfg.get("session_timeout_minutes", 30),
            "session_warning_seconds": security_cfg.get("session_warning_seconds", 60),
        },
    }


@router.get("")
def get_system_config(current_user: User = Depends(get_current_user)) -> dict:
    _ensure_admin_general(current_user)
    return _redact_sensitive(_load_config())


@router.put("")
def update_system_config(payload: dict, current_user: User = Depends(get_current_user)) -> dict:
    _ensure_admin_general(current_user)
    current = _load_config()
    incoming_keys = payload.get("keys", {}) if isinstance(payload.get("keys", {}), dict) else {}
    merged_keys = {**current.get("keys", {}), **incoming_keys}
    for key_name in ("google_maps_key", "captcha_site_key", "captcha_secret_key"):
        incoming_value = incoming_keys.get(key_name)
        if incoming_value is None or (isinstance(incoming_value, str) and incoming_value.strip() == ""):
            merged_keys[key_name] = current.get("keys", {}).get(key_name, "")

    merged = {
        **current,
        **payload,
        "system": {**current.get("system", {}), **payload.get("system", {})},
        "assets": {**current.get("assets", {}), **payload.get("assets", {})},
        "keys": merged_keys,
        "security": {**current.get("security", {}), **payload.get("security", {})},
        "palette": {**current.get("palette", {}), **payload.get("palette", {})},
    }
    security = merged.get("security", {})
    if isinstance(security, dict):
        timeout_raw = security.get("session_timeout_minutes", 30)
        warning_raw = security.get("session_warning_seconds", 60)
        try:
            timeout = max(1, min(24 * 60, int(timeout_raw)))
        except (TypeError, ValueError):
            timeout = 30
        try:
            warning = max(10, min(10 * 60, int(warning_raw)))
        except (TypeError, ValueError):
            warning = 60
        security["session_timeout_minutes"] = timeout
        security["session_warning_seconds"] = warning
        merged["security"] = security
    _save_config(merged)
    return _redact_sensitive(merged)


@router.post("/assets")
def upload_system_assets(
    favicon: UploadFile | None = File(default=None),
    login_logo: UploadFile | None = File(default=None),
    dashboard_logo: UploadFile | None = File(default=None),
    report_logo: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ensure_admin_general(current_user)
    current = _load_config()

    assets = current.get("assets", {})
    if favicon is not None:
        assets["favicon_url"] = _store_asset(favicon, "favicon")
    if login_logo is not None:
        assets["login_logo_url"] = _store_asset(login_logo, "login_logo")
    if dashboard_logo is not None:
        assets["dashboard_logo_url"] = _store_asset(dashboard_logo, "dashboard_logo")
    if report_logo is not None:
        assets["report_logo_url"] = _store_asset(report_logo, "report_logo")

    current["assets"] = assets
    _save_config(current)
    return _redact_sensitive(current)


@router.get("/assets/{file_name}")
def get_asset(file_name: str) -> FileResponse:
    _ensure_paths()
    file_path = ASSETS_DIR / file_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset no encontrado")
    return FileResponse(path=str(file_path), filename=file_path.name)

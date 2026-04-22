import json
from dataclasses import dataclass
from typing import Any
from urllib import parse, request

from app.core.config import get_settings


@dataclass
class CaptchaValidationResult:
    success: bool
    errors: list[str]


def validate_turnstile_token(token: str | None, remote_ip: str | None = None) -> CaptchaValidationResult:
    settings = get_settings()
    if not settings.turnstile_enabled:
        return CaptchaValidationResult(success=True, errors=[])
    if not token:
        return CaptchaValidationResult(success=False, errors=["missing-input-response"])

    payload: dict[str, Any] = {
        "secret": settings.turnstile_secret_key,
        "response": token,
    }
    if remote_ip:
        payload["remoteip"] = remote_ip

    data = parse.urlencode(payload).encode("utf-8")
    req = request.Request(settings.turnstile_verify_url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with request.urlopen(req, timeout=8) as response:
            raw = response.read().decode("utf-8")
            body = json.loads(raw)
    except Exception:
        return CaptchaValidationResult(success=False, errors=["turnstile-unreachable"])

    if not bool(body.get("success")):
        return CaptchaValidationResult(
            success=False,
            errors=[str(code) for code in body.get("error-codes", [])],
        )

    expected_hostname = settings.turnstile_expected_hostname
    if expected_hostname:
        response_hostname = str(body.get("hostname", "")).strip().lower()
        if response_hostname != expected_hostname.strip().lower():
            return CaptchaValidationResult(success=False, errors=["hostname-mismatch"])

    return CaptchaValidationResult(success=True, errors=[])

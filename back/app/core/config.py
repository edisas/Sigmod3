from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SIGMOD API"
    env: str = "dev"
    api_prefix: str = "/api/v1"

    secret_key: str = "change-this-secret-key"
    access_token_expire_minutes: int = 120

    database_url: str = "mysql+pymysql://sigmod_user:change_password@127.0.0.1:3306/sigmod_v3?charset=utf8mb4"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
    turnstile_enabled: bool = False
    turnstile_secret_key: str = ""
    turnstile_verify_url: str = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    turnstile_expected_hostname: str | None = None

    legacy_db_host: str = "127.0.0.1"
    legacy_db_port: int = 3306
    legacy_db_user: str = ""
    legacy_db_password: str = ""
    legacy_secret_key: str = "change-this-legacy-secret-key"
    legacy_token_expire_minutes: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

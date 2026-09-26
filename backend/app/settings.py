"""Configuration, read from the environment.

The database connection is held as separate parts rather than one URL. A
password is not URL-safe: a "/" in one terminates the URL's authority section
and the host then parses as the database name. See backend.md §9.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str = "im_master"
    postgres_user: str = "im_master"
    postgres_password: str = ""

    max_upload_mb: int = 8
    upload_dir: str = "/app/data/uploads"

    # Sales fetching. Empty by default so the app still starts without them —
    # only a sales fetch fails, and it says which one is missing.
    salesforce_username: str = ""
    salesforce_password: str = ""
    salesforce_security_token: str = ""
    shopify_store: str = ""
    shopify_api_version: str = "2026-01"
    shopify_access_token: str = ""
    shopify_client_id: str = ""
    shopify_client_secret: str = ""

    @property
    def conninfo(self) -> dict:
        """Connection parts for psycopg — never assembled into a URL."""
        return {
            "host": self.postgres_host,
            "port": self.postgres_port,
            "dbname": self.postgres_db,
            "user": self.postgres_user,
            "password": self.postgres_password,
        }


settings = Settings()

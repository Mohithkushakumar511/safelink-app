import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # MongoDB Database Settings
    MONGODB_URI: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "safelink"

    # JWT Authentication & Cryptography
    SECRET_KEY: str = "safelink_super_secure_jwt_secret_key_2026_production_grade"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: str = "*"

    # Demo Accounts Configuration (Provisioned on Startup)
    USER_DEMO_NAME: str = "Mohith"
    USER_DEMO_EMAIL: str = "mohith@safelink.org"
    USER_DEMO_PASSWORD: str = "SafeLink123!"

    ADMIN_DEMO_NAME: str = "Mohith"
    ADMIN_DEMO_EMAIL: str = "admin@safelink.org"
    ADMIN_DEMO_PASSWORD: str = "AdminSafeLink123!"

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

settings = Settings()

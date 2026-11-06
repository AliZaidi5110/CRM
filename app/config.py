import os
import json
import secrets
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

def _secret_keys():
    keys = {key: os.environ.get(key) for key in ("SECRET_KEY", "JWT_SECRET_KEY")}
    if all(keys.values()):
        return keys
    if os.environ.get("VERCEL"):
        # API requests remain disabled until persistent cloud secrets are supplied.
        return {key: value or secrets.token_hex(32) for key, value in keys.items()}
    # Keep local development keys stable without committing them to source control.
    path = os.path.join(BASE_DIR, ".local-secrets.json")
    try:
        with open(path, encoding="utf-8") as handle:
            local = json.load(handle)
    except FileNotFoundError:
        local = {key: secrets.token_hex(32) for key in keys}
        try:
            with open(path, "x", encoding="utf-8") as handle:
                json.dump(local, handle)
        except FileExistsError:
            with open(path, encoding="utf-8") as handle:
                local = json.load(handle)
    return {key: value or local[key] for key, value in keys.items()}

_keys = _secret_keys()

class Config:
    SECRET_KEY = _keys["SECRET_KEY"]
    JWT_SECRET_KEY = _keys["JWT_SECRET_KEY"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.environ.get("JWT_EXPIRY_HOURS", 12)))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", 30)))
    
    # Offline token expiry (cached login validity offline)
    OFFLINE_SESSION_MAX_DAYS = int(os.environ.get("OFFLINE_SESSION_MAX_DAYS", 7))
    
    # Database: Default to SQLite in project directory, configurable to PostgreSQL
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(BASE_DIR, 'crm.db')}"
    )
    if SQLALCHEMY_DATABASE_URI.startswith(("postgres://", "postgresql://")):
        SQLALCHEMY_DATABASE_URI = "postgresql+psycopg://" + SQLALCHEMY_DATABASE_URI.split("://", 1)[1]
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Security settings
    MAX_FAILED_LOGINS = 5
    LOCKOUT_DURATION_MINUTES = 15
    
    # Static & Upload folder
    STATIC_FOLDER = os.path.join(BASE_DIR, "static")
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "/tmp/crm-uploads" if os.environ.get("VERCEL") else os.path.join(BASE_DIR, "uploads"))
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    
    # System CRM defaults
    COMPANY_NAME = "CallPro Multi-Team CRM"
    TIMEZONE = "UTC"
    CURRENCY = "GBP"
    DATE_FORMAT = "YYYY-MM-DD HH:mm:ss"

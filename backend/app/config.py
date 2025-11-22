import os
from pathlib import Path

# App version
APP_VERSION = "0.1.1"

# Base dir (this file's folder is backend/app/)
BASE_DIR = Path(__file__).resolve().parent

# Historical compatibility shim (unused).
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# CORS: comma-separated list of origins. Default "*" (allow all).
# Example: ALLOW_ORIGINS="http://localhost:8081,http://192.168.0.148:19000"
_allow = os.environ.get("ALLOW_ORIGINS", "*")
ALLOW_ORIGINS = [o.strip() for o in _allow.split(",") if o.strip()] or ["*"]

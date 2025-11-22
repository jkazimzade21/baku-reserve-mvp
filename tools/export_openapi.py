#!/usr/bin/env python3
"""Export the FastAPI OpenAPI schema to artifacts/openapi.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import app  # noqa: E402

OUTPUT_PATH = Path("artifacts/openapi.json")


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    schema = app.openapi()
    OUTPUT_PATH.write_text(json.dumps(schema, indent=2), encoding="utf-8")
    print(f"[export_openapi] Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

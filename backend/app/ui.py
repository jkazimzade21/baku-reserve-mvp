from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

_HTML_DIR = Path(__file__).resolve().parent / "ui_pages"
_BOOK_HTML: str | None = None
_ADMIN_HTML: str | None = None


def _load_html(name: str) -> str:
    path = _HTML_DIR / name
    return path.read_text(encoding="utf-8")


@router.get("/book", response_class=HTMLResponse)
@router.get("/book/", response_class=HTMLResponse)
async def book_page() -> HTMLResponse:
    global _BOOK_HTML  # noqa: PLW0603
    if _BOOK_HTML is None:
        _BOOK_HTML = _load_html("book.html")
    return HTMLResponse(content=_BOOK_HTML)


@router.get("/admin", response_class=HTMLResponse)
@router.get("/admin/", response_class=HTMLResponse)
async def admin_page() -> HTMLResponse:
    global _ADMIN_HTML  # noqa: PLW0603
    if _ADMIN_HTML is None:
        _ADMIN_HTML = _load_html("admin.html")
    return HTMLResponse(content=_ADMIN_HTML)

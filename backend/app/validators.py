"""Shared input sanitizers for API models."""

from __future__ import annotations

import re
from collections.abc import Iterable

NAME_MAX_LENGTH = 80
NOTE_MAX_LENGTH = 400
PREP_ITEM_MAX = 12
PREP_ITEM_MAX_LENGTH = 80
PHONE_PATTERN = re.compile(r"^[0-9+()\-\.\s]{6,32}$")


def _squash_whitespace(text: str) -> str:
    return " ".join(text.split())


def normalize_display_name(value: str, *, field: str = "name") -> str:
    if not isinstance(value, str):  # pragma: no cover - Pydantic guards by default
        raise ValueError(f"{field} must be a string")
    cleaned = _squash_whitespace(value.strip())
    if not cleaned:
        raise ValueError(f"{field} cannot be blank")
    if len(cleaned) > NAME_MAX_LENGTH:
        raise ValueError(f"{field} must be <= {NAME_MAX_LENGTH} characters")
    return cleaned


def normalize_phone(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if not PHONE_PATTERN.fullmatch(cleaned):
        raise ValueError(
            "guest_phone must contain digits, spaces, '.', '-', '()' or '+' and be 6-32 characters"
        )
    return cleaned


def normalize_note(
    value: str | None, *, field: str = "notes", max_length: int = NOTE_MAX_LENGTH
) -> str | None:
    if value is None:
        return None
    cleaned = _squash_whitespace(value.strip())
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        raise ValueError(f"{field} must be <= {max_length} characters")
    return cleaned


def normalize_prep_items(
    items: Iterable[str] | None,
    *,
    max_items: int = PREP_ITEM_MAX,
    max_length: int = PREP_ITEM_MAX_LENGTH,
) -> list[str] | None:
    if not items:
        return None
    cleaned: list[str] = []
    for raw in items:
        if not isinstance(raw, str):
            continue
        entry = _squash_whitespace(raw.strip())
        if not entry:
            continue
        if len(entry) > max_length:
            raise ValueError(f"prep item '{entry[:20]}…' must be <= {max_length} characters")
        cleaned.append(entry)
        if len(cleaned) > max_items:
            raise ValueError(f"prep_items accepts at most {max_items} entries")
    return cleaned or None


__all__ = [
    "NAME_MAX_LENGTH",
    "NOTE_MAX_LENGTH",
    "PREP_ITEM_MAX",
    "PREP_ITEM_MAX_LENGTH",
    "normalize_display_name",
    "normalize_note",
    "normalize_phone",
    "normalize_prep_items",
]

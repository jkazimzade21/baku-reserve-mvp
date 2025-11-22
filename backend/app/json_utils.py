from __future__ import annotations

import json
import re
from typing import Any

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def extract_json_dict(raw: str) -> dict[str, Any]:
    """Extract a JSON object from LLM output that may contain prose or code fences."""

    if not isinstance(raw, str):
        raise ValueError("payload must be a string")
    text = raw.strip()
    if not text:
        raise ValueError("payload is empty")

    fence_match = _CODE_FENCE_RE.search(text)
    if fence_match:
        text = fence_match.group(1).strip()

    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char not in "{[":
            continue
        try:
            obj, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            return obj
        raise ValueError("JSON root must be an object")

    raise ValueError("No JSON object found in payload")

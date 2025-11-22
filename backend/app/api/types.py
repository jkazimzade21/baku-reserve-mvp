from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import Query

DateQuery = Annotated[date, Query(alias="date")]

CoordinateString = Annotated[
    str,
    Query(
        ...,  # value required
        min_length=3,
        max_length=64,
        description="Latitude,Longitude (e.g., 40.4093,49.8671)",
    ),
]

RestaurantSearch = Annotated[
    str | None,
    Query(
        min_length=1,
        max_length=80,
        description="Optional search term for restaurants",
    ),
]

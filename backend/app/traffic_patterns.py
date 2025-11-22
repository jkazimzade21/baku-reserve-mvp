"""
Historical traffic pattern tracking and prediction system.

This module implements machine learning-based traffic prediction using
historical data patterns to provide more accurate ETAs.
"""

import logging
import math
import sqlite3
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .settings import settings

logger = logging.getLogger(__name__)


@dataclass
class TrafficPattern:
    """Traffic pattern for a specific time and location."""

    day_of_week: int  # 0=Monday, 6=Sunday
    hour: int  # 0-23
    severity_avg: float
    severity_std: float
    speed_factor: float  # Multiplier for travel time
    sample_count: int
    last_updated: datetime


@dataclass
class TrafficPrediction:
    """Predicted traffic conditions."""

    expected_severity: float
    confidence: float  # 0.0-1.0
    speed_factor: float
    historical_samples: int
    prediction_method: str
    message: str


class TrafficPatternTracker:
    """
    Track and predict traffic patterns based on historical data.

    Features:
    - Stores traffic observations in SQLite
    - Analyzes patterns by day/hour
    - Predicts future traffic conditions
    - Adapts to seasonal changes
    """

    def __init__(self, db_path: Path | None = None):
        """Initialize traffic pattern tracker."""
        if db_path is None:
            db_path = settings.data_dir / "traffic_patterns.db"

        self.db_path = db_path
        self._init_database()

        # Pattern cache
        self._pattern_cache: dict[str, TrafficPattern] = {}
        self._cache_expires = datetime.now()

    def _init_database(self) -> None:
        """Initialize SQLite database for traffic data."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS traffic_observations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TIMESTAMP NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    grid_id TEXT NOT NULL,
                    severity INTEGER NOT NULL,
                    speed_kmh REAL,
                    delay_minutes INTEGER,
                    day_of_week INTEGER NOT NULL,
                    hour INTEGER NOT NULL,
                    minute INTEGER NOT NULL,
                    is_holiday BOOLEAN DEFAULT 0,
                    weather_condition TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
            )

            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_grid_time
                ON traffic_observations (grid_id, day_of_week, hour)
                """
            )

            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_timestamp
                ON traffic_observations (timestamp)
                """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS traffic_patterns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    grid_id TEXT NOT NULL,
                    day_of_week INTEGER NOT NULL,
                    hour INTEGER NOT NULL,
                    severity_avg REAL NOT NULL,
                    severity_std REAL NOT NULL,
                    speed_factor REAL NOT NULL,
                    sample_count INTEGER NOT NULL,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(grid_id, day_of_week, hour)
                )
            """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS traffic_anomalies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TIMESTAMP NOT NULL,
                    grid_id TEXT NOT NULL,
                    expected_severity REAL NOT NULL,
                    actual_severity INTEGER NOT NULL,
                    deviation REAL NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
            )

            conn.commit()

    def record_observation(
        self,
        latitude: float,
        longitude: float,
        severity: int,
        speed_kmh: float | None = None,
        delay_minutes: int | None = None,
        timestamp: datetime | None = None,
        weather: str | None = None,
    ) -> None:
        """
        Record a traffic observation.

        Args:
            latitude: Location latitude
            longitude: Location longitude
            severity: Traffic severity (0-4)
            speed_kmh: Current speed
            delay_minutes: Delay due to traffic
            timestamp: Observation time (default: now)
            weather: Weather condition
        """
        if timestamp is None:
            timestamp = datetime.now()

        # Convert location to grid ID for aggregation
        grid_id = self._get_grid_id(latitude, longitude)

        # Extract time components
        day_of_week = timestamp.weekday()
        hour = timestamp.hour
        minute = timestamp.minute

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO traffic_observations
                (timestamp, latitude, longitude, grid_id, severity,
                 speed_kmh, delay_minutes, day_of_week, hour, minute,
                 weather_condition)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    timestamp,
                    latitude,
                    longitude,
                    grid_id,
                    severity,
                    speed_kmh,
                    delay_minutes,
                    day_of_week,
                    hour,
                    minute,
                    weather,
                ),
            )
            conn.commit()

        # Update patterns if enough data
        self._update_patterns(grid_id, day_of_week, hour)

        # Check for anomalies
        self._check_anomaly(grid_id, severity, timestamp)

        logger.debug(
            "Recorded traffic observation: grid=%s, severity=%d, time=%s",
            grid_id,
            severity,
            timestamp.strftime("%a %H:%M"),
        )

    def predict_traffic(
        self,
        latitude: float,
        longitude: float,
        target_time: datetime | None = None,
        look_ahead_minutes: int = 0,
    ) -> TrafficPrediction:
        """
        Predict traffic conditions for a location and time.

        Args:
            latitude: Location latitude
            longitude: Location longitude
            target_time: Time to predict for (default: now)
            look_ahead_minutes: Minutes to look ahead

        Returns:
            Traffic prediction with confidence score
        """
        if target_time is None:
            target_time = datetime.now()

        if look_ahead_minutes > 0:
            target_time += timedelta(minutes=look_ahead_minutes)

        grid_id = self._get_grid_id(latitude, longitude)
        day_of_week = target_time.weekday()
        hour = target_time.hour

        # Try to get pattern from cache
        pattern = self._get_pattern(grid_id, day_of_week, hour)

        if pattern and pattern.sample_count >= 5:
            # Good historical data available
            confidence = min(1.0, pattern.sample_count / 40.0)

            # Adjust for time of day trends
            severity = pattern.severity_avg
            if 7 <= hour <= 9 or 17 <= hour <= 19:
                # Rush hour adjustment
                severity *= 1.15
            elif 0 <= hour <= 6:
                # Night time adjustment
                severity *= 0.8

            return TrafficPrediction(
                expected_severity=severity,
                confidence=confidence,
                speed_factor=pattern.speed_factor,
                historical_samples=pattern.sample_count,
                prediction_method="historical_pattern",
                message=self._get_traffic_message(severity, day_of_week, hour),
            )

        # Fallback: Use general patterns
        return self._predict_from_general_patterns(day_of_week, hour)

    def _get_pattern(self, grid_id: str, day_of_week: int, hour: int) -> TrafficPattern | None:
        """Get traffic pattern from cache or database."""
        cache_key = f"{grid_id}:{day_of_week}:{hour}"

        # Check cache
        if cache_key in self._pattern_cache:
            if datetime.now() < self._cache_expires:
                return self._pattern_cache[cache_key]

        # Query database
        with sqlite3.connect(self.db_path) as conn:
            result = conn.execute(
                """
                SELECT severity_avg, severity_std, speed_factor,
                       sample_count, last_updated
                FROM traffic_patterns
                WHERE grid_id = ? AND day_of_week = ? AND hour = ?
            """,
                (grid_id, day_of_week, hour),
            ).fetchone()

            if result:
                pattern = TrafficPattern(
                    day_of_week=day_of_week,
                    hour=hour,
                    severity_avg=result[0],
                    severity_std=result[1],
                    speed_factor=result[2],
                    sample_count=result[3],
                    last_updated=datetime.fromisoformat(result[4]),
                )

                # Cache for 10 minutes
                self._pattern_cache[cache_key] = pattern
                if datetime.now() >= self._cache_expires:
                    self._cache_expires = datetime.now() + timedelta(minutes=10)

                return pattern

        return None

    def _update_patterns(self, grid_id: str, day_of_week: int, hour: int) -> None:
        """Update traffic patterns based on recent observations."""
        with sqlite3.connect(self.db_path) as conn:
            # Get recent observations (last 8 weeks)
            cutoff_date = datetime.now() - timedelta(weeks=8)

            results = conn.execute(
                """
                SELECT severity, speed_kmh, delay_minutes
                FROM traffic_observations
                WHERE grid_id = ? AND day_of_week = ? AND hour = ?
                AND timestamp > ?
                ORDER BY timestamp DESC
                LIMIT 100
            """,
                (grid_id, day_of_week, hour, cutoff_date),
            ).fetchall()

            if len(results) < 5:
                return  # Not enough data

            # Calculate statistics
            severities = [r[0] for r in results]
            severity_avg = statistics.mean(severities)
            severity_std = statistics.stdev(severities) if len(severities) > 1 else 0

            # Calculate speed factor
            speed_factor = self._calculate_speed_factor(severity_avg)

            # Update or insert pattern
            conn.execute(
                """
                INSERT OR REPLACE INTO traffic_patterns
                (grid_id, day_of_week, hour, severity_avg, severity_std,
                 speed_factor, sample_count, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    grid_id,
                    day_of_week,
                    hour,
                    severity_avg,
                    severity_std,
                    speed_factor,
                    len(results),
                    datetime.now(),
                ),
            )
            conn.commit()

    def _check_anomaly(self, grid_id: str, severity: int, timestamp: datetime) -> None:
        """Check if current observation is anomalous."""
        pattern = self._get_pattern(grid_id, timestamp.weekday(), timestamp.hour)

        if not pattern or pattern.sample_count < 20:
            return  # Not enough history

        # Calculate deviation
        deviation = abs(severity - pattern.severity_avg)
        threshold = 2 * pattern.severity_std if pattern.severity_std > 0 else 1.5

        if deviation > threshold:
            # Anomaly detected
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO traffic_anomalies
                    (timestamp, grid_id, expected_severity,
                     actual_severity, deviation, description)
                    VALUES (?, ?, ?, ?, ?, ?)
                """,
                    (
                        timestamp,
                        grid_id,
                        pattern.severity_avg,
                        severity,
                        deviation,
                        f"Unusual traffic: expected {pattern.severity_avg:.1f}, got {severity}",
                    ),
                )
                conn.commit()

            logger.info(
                "Traffic anomaly detected at %s: expected %.1f, got %d",
                grid_id,
                pattern.severity_avg,
                severity,
            )

    def _predict_from_general_patterns(self, day_of_week: int, hour: int) -> TrafficPrediction:
        """Predict using general time-based patterns."""
        # Default patterns based on typical traffic
        is_weekday = day_of_week < 5
        is_rush_hour = (7 <= hour <= 9) or (17 <= hour <= 19)
        is_night = 0 <= hour <= 6

        if is_weekday and is_rush_hour:
            severity = 3.0
            speed_factor = 1.4
            message = "Typical rush hour traffic expected"
        elif is_weekday:
            severity = 2.0
            speed_factor = 1.15
            message = "Normal weekday traffic expected"
        elif is_night:
            severity = 1.0
            speed_factor = 0.9
            message = "Light nighttime traffic expected"
        else:
            severity = 1.5
            speed_factor = 1.0
            message = "Light weekend traffic expected"

        return TrafficPrediction(
            expected_severity=severity,
            confidence=0.3,  # Low confidence without data
            speed_factor=speed_factor,
            historical_samples=0,
            prediction_method="general_pattern",
            message=message,
        )

    def _get_grid_id(self, lat: float, lon: float) -> str:
        """Convert coordinates to grid ID for aggregation."""
        # Use ~1km grid cells
        grid_lat = round(lat, 2)  # ~1.1km resolution
        grid_lon = round(lon, 2)
        return f"{grid_lat:.2f},{grid_lon:.2f}"

    def _calculate_speed_factor(self, severity: float) -> float:
        """Calculate speed factor from severity."""
        # Map severity to travel time multiplier
        if severity <= 1:
            return 1.0
        elif severity <= 2:
            return 1.15
        elif severity <= 3:
            return 1.35
        else:
            return 1.6

    def _get_traffic_message(self, severity: float, day_of_week: int, hour: int) -> str:
        """Generate human-readable traffic message."""
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        day = day_names[day_of_week]

        if severity < 1.5:
            level = "light"
        elif severity < 2.5:
            level = "moderate"
        elif severity < 3.5:
            level = "heavy"
        else:
            level = "severe"

        time_str = f"{hour:02d}:00"
        return f"Typically {level} traffic on {day} at {time_str}"

    def get_statistics(self) -> dict[str, Any]:
        """Get traffic tracking statistics."""
        with sqlite3.connect(self.db_path) as conn:
            stats = {}

            # Total observations
            stats["total_observations"] = conn.execute(
                "SELECT COUNT(*) FROM traffic_observations"
            ).fetchone()[0]

            # Patterns tracked
            stats["patterns_tracked"] = conn.execute(
                "SELECT COUNT(*) FROM traffic_patterns"
            ).fetchone()[0]

            # Anomalies detected
            stats["anomalies_detected"] = conn.execute(
                "SELECT COUNT(*) FROM traffic_anomalies"
            ).fetchone()[0]

            # Recent activity
            recent_cutoff = datetime.now() - timedelta(days=7)
            stats["observations_last_week"] = conn.execute(
                "SELECT COUNT(*) FROM traffic_observations WHERE timestamp > ?", (recent_cutoff,)
            ).fetchone()[0]

            # Most congested times
            congested = conn.execute(
                """
                SELECT day_of_week, hour, AVG(severity) as avg_severity
                FROM traffic_observations
                WHERE timestamp > ?
                GROUP BY day_of_week, hour
                ORDER BY avg_severity DESC
                LIMIT 5
            """,
                (recent_cutoff,),
            ).fetchall()

            stats["most_congested_times"] = [
                {
                    "day": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][r[0]],
                    "hour": f"{r[1]:02d}:00",
                    "severity": round(r[2], 1),
                }
                for r in congested
            ]

        return stats


# Global tracker instance
_traffic_tracker: TrafficPatternTracker | None = None


def get_traffic_tracker() -> TrafficPatternTracker:
    """Get the global traffic pattern tracker."""
    global _traffic_tracker
    if _traffic_tracker is None:
        _traffic_tracker = TrafficPatternTracker()
    return _traffic_tracker


def predict_traffic_for_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    departure_time: datetime | None = None,
) -> dict[str, Any]:
    """
    Predict traffic conditions for a route.

    Returns combined prediction for origin and destination.
    """
    tracker = get_traffic_tracker()

    if departure_time is None:
        departure_time = datetime.now()

    # Predict at origin
    origin_pred = tracker.predict_traffic(origin_lat, origin_lon, departure_time)

    # Estimate arrival time (rough)
    distance_km = (
        math.sqrt((dest_lat - origin_lat) ** 2 + (dest_lon - origin_lon) ** 2) * 111
    )  # Rough km conversion

    travel_minutes = int((distance_km / 30) * 60)  # Assume 30 km/h average
    arrival_time = departure_time + timedelta(minutes=travel_minutes)

    # Predict at destination for arrival time
    dest_pred = tracker.predict_traffic(dest_lat, dest_lon, arrival_time)

    # Combine predictions
    avg_severity = (origin_pred.expected_severity + dest_pred.expected_severity) / 2
    avg_factor = (origin_pred.speed_factor + dest_pred.speed_factor) / 2
    min_confidence = min(origin_pred.confidence, dest_pred.confidence)

    return {
        "origin": {
            "severity": origin_pred.expected_severity,
            "message": origin_pred.message,
        },
        "destination": {
            "severity": dest_pred.expected_severity,
            "message": dest_pred.message,
        },
        "combined": {
            "severity": avg_severity,
            "speed_factor": avg_factor,
            "confidence": min_confidence,
            "eta_multiplier": avg_factor,
            "message": f"Based on {origin_pred.historical_samples + dest_pred.historical_samples} historical observations",
        },
    }


__all__ = [
    "TrafficPatternTracker",
    "TrafficPattern",
    "TrafficPrediction",
    "get_traffic_tracker",
    "predict_traffic_for_route",
]

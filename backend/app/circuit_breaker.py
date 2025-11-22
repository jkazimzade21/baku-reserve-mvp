"""Circuit breaker pattern implementation for resilient API calls."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from threading import Lock
from typing import Any, TypeVar

logger = logging.getLogger(__name__)

# Import Redis client (lazy loaded)
_redis_client_module = None


def _get_redis():
    """Lazy import of Redis client to avoid import errors if Redis is not available."""
    global _redis_client_module
    if _redis_client_module is None:
        try:
            from . import redis_client as _redis_client_module
        except ImportError:
            pass
    return _redis_client_module


T = TypeVar("T")


class CircuitState(Enum):
    """Circuit breaker states"""

    CLOSED = "closed"  # Normal operation, requests allowed
    OPEN = "open"  # Circuit broken, requests rejected
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitBreakerStats:
    """Statistics for circuit breaker monitoring"""

    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    last_failure_time: float | None = None
    last_success_time: float | None = None
    consecutive_failures: int = 0
    circuit_opened_count: int = 0


class CircuitBreaker:
    """
    Circuit breaker to protect against cascading failures.

    The circuit breaker has three states:
    - CLOSED: Normal operation, all requests pass through
    - OPEN: After failure threshold, requests are immediately rejected
    - HALF_OPEN: After cooldown, one test request is allowed
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int | None = None,
        cooldown_seconds: float | None = None,
        success_threshold: int = 1,
        enabled: bool | None = None,
    ):
        """
        Initialize circuit breaker.

        Args:
            name: Identifier for this circuit breaker
            failure_threshold: Number of consecutive failures before opening circuit
            cooldown_seconds: Time to wait before attempting recovery
            success_threshold: Successes needed in half-open state to close circuit
            enabled: Whether circuit breaker is active
        """
        self.name = name
        self.failure_threshold = failure_threshold if failure_threshold is not None else 3
        self.cooldown_seconds = cooldown_seconds if cooldown_seconds is not None else 300.0
        self.success_threshold = success_threshold
        self.enabled = enabled if enabled is not None else True

        self._state = CircuitState.CLOSED
        self._stats = CircuitBreakerStats()
        self._lock = Lock()
        self._last_state_change = time.time()
        self._half_open_successes = 0

        # Attempt to restore state from Redis
        self._restore_state()

    @property
    def state(self) -> CircuitState:
        """Get current circuit state, checking for automatic transitions."""
        with self._lock:
            if self._state == CircuitState.OPEN:
                # Check if cooldown period has passed
                if time.time() - self._last_state_change >= self.cooldown_seconds:
                    self._transition_to(CircuitState.HALF_OPEN)
            return self._state

    @property
    def stats(self) -> CircuitBreakerStats:
        """Get circuit breaker statistics."""
        return self._stats

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to a new state."""
        old_state = self._state
        self._state = new_state
        self._last_state_change = time.time()

        if new_state == CircuitState.OPEN:
            self._stats.circuit_opened_count += 1
            logger.warning(
                "Circuit breaker '%s' opened after %d consecutive failures",
                self.name,
                self._stats.consecutive_failures,
            )
        elif new_state == CircuitState.CLOSED:
            self._stats.consecutive_failures = 0
            self._half_open_successes = 0
            if old_state == CircuitState.HALF_OPEN:
                logger.info("Circuit breaker '%s' closed after successful recovery", self.name)
        elif new_state == CircuitState.HALF_OPEN:
            self._half_open_successes = 0
            logger.info("Circuit breaker '%s' entering half-open state for testing", self.name)

        # Persist state to Redis if available
        self._persist_state()

    def _persist_state(self) -> None:
        """Persist circuit breaker state to Redis (if available)."""
        redis_module = _get_redis()
        if not redis_module:
            return

        redis = redis_module.get_redis_client()
        if not redis:
            return

        try:
            key = f"circuit_breaker:{self.name}:state"
            ttl = int(self.cooldown_seconds * 2)  # Keep state for 2x cooldown period

            # Store state as a hash
            redis.hset(
                key,
                mapping={
                    "state": self._state.value,
                    "consecutive_failures": str(self._stats.consecutive_failures),
                    "last_state_change": str(self._last_state_change),
                    "circuit_opened_count": str(self._stats.circuit_opened_count),
                },
            )
            redis.expire(key, ttl)

        except Exception as exc:
            logger.warning(
                "Failed to persist circuit breaker state to Redis",
                circuit=self.name,
                error=str(exc),
            )

    def _restore_state(self) -> None:
        """Restore circuit breaker state from Redis (if available)."""
        redis_module = _get_redis()
        if not redis_module:
            return

        redis = redis_module.get_redis_client()
        if not redis:
            return

        try:
            key = f"circuit_breaker:{self.name}:state"
            state_data = redis.hgetall(key)

            if not state_data:
                return  # No persisted state

            # Restore state
            state_value = state_data.get("state")
            if state_value:
                self._state = CircuitState(state_value)

            consecutive_failures = state_data.get("consecutive_failures")
            if consecutive_failures:
                self._stats.consecutive_failures = int(consecutive_failures)

            last_state_change = state_data.get("last_state_change")
            if last_state_change:
                self._last_state_change = float(last_state_change)

            circuit_opened_count = state_data.get("circuit_opened_count")
            if circuit_opened_count:
                self._stats.circuit_opened_count = int(circuit_opened_count)

            logger.info(
                "Restored circuit breaker state from Redis",
                circuit=self.name,
                state=self._state.value,
                consecutive_failures=self._stats.consecutive_failures,
            )

        except Exception as exc:
            logger.warning(
                "Failed to restore circuit breaker state from Redis",
                circuit=self.name,
                error=str(exc),
            )

    def call(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """
        Execute a function through the circuit breaker.

        Args:
            func: Function to execute
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func

        Returns:
            Result of func execution

        Raises:
            CircuitOpenError: If circuit is open
            Original exception: If func fails
        """
        if not self.enabled:
            # Circuit breaker disabled, execute normally
            return func(*args, **kwargs)

        # Check if circuit allows request
        if not self._can_execute():
            self._stats.rejected_calls += 1
            raise CircuitOpenError(
                f"Circuit breaker '{self.name}' is open. "
                f"Service will be retried after {self.cooldown_seconds} seconds."
            )

        # Execute the function
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception:
            self._on_failure()
            raise

    def _can_execute(self) -> bool:
        """Check if execution is allowed based on circuit state."""
        current_state = self.state  # This checks for automatic transitions
        return current_state != CircuitState.OPEN

    def _on_success(self) -> None:
        """Handle successful execution."""
        with self._lock:
            self._stats.total_calls += 1
            self._stats.successful_calls += 1
            self._stats.last_success_time = time.time()
            self._stats.consecutive_failures = 0

            if self._state == CircuitState.HALF_OPEN:
                self._half_open_successes += 1
                if self._half_open_successes >= self.success_threshold:
                    self._transition_to(CircuitState.CLOSED)

    def _on_failure(self) -> None:
        """Handle failed execution."""
        with self._lock:
            self._stats.total_calls += 1
            self._stats.failed_calls += 1
            self._stats.last_failure_time = time.time()
            self._stats.consecutive_failures += 1

            if self._state == CircuitState.HALF_OPEN:
                # Failure in half-open state immediately opens circuit
                self._transition_to(CircuitState.OPEN)
            elif (
                self._state == CircuitState.CLOSED
                and self._stats.consecutive_failures >= self.failure_threshold
            ):
                # Threshold reached, open circuit
                self._transition_to(CircuitState.OPEN)

    def reset(self) -> None:
        """Manually reset the circuit breaker to closed state."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._stats.consecutive_failures = 0
            self._half_open_successes = 0
            self._last_state_change = time.time()
            logger.info("Circuit breaker '%s' manually reset", self.name)

    def is_open(self) -> bool:
        """Check if circuit is currently open."""
        return self.state == CircuitState.OPEN

    def is_closed(self) -> bool:
        """Check if circuit is currently closed."""
        return self.state == CircuitState.CLOSED


class CircuitOpenError(Exception):
    """Exception raised when circuit breaker is open."""

    pass


# Global circuit breakers for different services
_circuit_breakers: dict[str, CircuitBreaker] = {}
_breakers_lock = Lock()


def get_circuit_breaker(name: str = "default_api") -> CircuitBreaker:
    """
    Get or create a circuit breaker instance.

    Args:
        name: Name of the circuit breaker

    Returns:
        CircuitBreaker instance
    """
    with _breakers_lock:
        if name not in _circuit_breakers:
            _circuit_breakers[name] = CircuitBreaker(name)
        return _circuit_breakers[name]


def with_circuit_breaker(
    func: Callable[..., T],
    circuit_name: str = "default_api",
    *args: Any,
    **kwargs: Any,
) -> T:
    """
    Execute a function with circuit breaker protection.

    Args:
        func: Function to execute
        circuit_name: Name of the circuit breaker to use
        *args: Positional arguments for func
        **kwargs: Keyword arguments for func

    Returns:
        Result of func execution

    Raises:
        CircuitOpenError: If circuit is open
        Original exception: If func fails
    """
    breaker = get_circuit_breaker(circuit_name)
    return breaker.call(func, *args, **kwargs)


__all__ = [
    "CircuitBreaker",
    "CircuitOpenError",
    "CircuitState",
    "CircuitBreakerStats",
    "get_circuit_breaker",
    "with_circuit_breaker",
]

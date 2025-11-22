"""Test circuit breaker implementation."""

import time
from unittest.mock import Mock

import pytest
from backend.app.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
    get_circuit_breaker,
    with_circuit_breaker,
)


class CircuitTestFailure(RuntimeError):
    """Custom error for circuit breaker tests."""


class TestCircuitBreaker:
    """Test the circuit breaker pattern implementation."""

    def test_circuit_starts_closed(self):
        """Circuit should start in closed state."""
        breaker = CircuitBreaker("test", failure_threshold=3, cooldown_seconds=1)
        assert breaker.state == CircuitState.CLOSED
        assert breaker.is_closed()
        assert not breaker.is_open()

    def test_successful_calls_pass_through(self):
        """Successful calls should pass through when circuit is closed."""
        breaker = CircuitBreaker("test", failure_threshold=3)
        func = Mock(return_value="success")

        result = breaker.call(func, "arg1", key="value")

        assert result == "success"
        func.assert_called_once_with("arg1", key="value")
        assert breaker.state == CircuitState.CLOSED
        assert breaker.stats.successful_calls == 1
        assert breaker.stats.failed_calls == 0

    def test_circuit_opens_after_threshold(self):
        """Circuit should open after consecutive failures reach threshold."""
        breaker = CircuitBreaker("test", failure_threshold=3, cooldown_seconds=10)
        failing_func = Mock(side_effect=CircuitTestFailure("Test failure"))

        # First two failures shouldn't open circuit
        for _ in range(2):
            with pytest.raises(CircuitTestFailure, match="Test failure"):
                breaker.call(failing_func)
            assert breaker.state == CircuitState.CLOSED

        # Third failure should open the circuit
        with pytest.raises(CircuitTestFailure, match="Test failure"):
            breaker.call(failing_func)
        assert breaker.state == CircuitState.OPEN
        assert breaker.stats.consecutive_failures == 3

    def test_open_circuit_rejects_calls(self):
        """Open circuit should reject calls immediately."""
        breaker = CircuitBreaker("test", failure_threshold=1, cooldown_seconds=10)
        failing_func = Mock(side_effect=CircuitTestFailure("Test failure"))

        # Open the circuit
        with pytest.raises(CircuitTestFailure):
            breaker.call(failing_func)
        assert breaker.state == CircuitState.OPEN

        # Subsequent calls should be rejected
        func = Mock(return_value="success")
        with pytest.raises(CircuitOpenError) as exc_info:
            breaker.call(func)

        # Function should not be called when circuit is open
        func.assert_not_called()
        assert "Circuit breaker 'test' is open" in str(exc_info.value)
        assert breaker.stats.rejected_calls == 1

    def test_circuit_transitions_to_half_open(self):
        """Circuit should transition to half-open after cooldown."""
        breaker = CircuitBreaker("test", failure_threshold=1, cooldown_seconds=0.1)
        failing_func = Mock(side_effect=CircuitTestFailure("Test failure"))

        # Open the circuit
        with pytest.raises(CircuitTestFailure):
            breaker.call(failing_func)
        assert breaker.state == CircuitState.OPEN

        # Wait for cooldown
        time.sleep(0.15)

        # Circuit should now be half-open
        assert breaker.state == CircuitState.HALF_OPEN

    def test_half_open_closes_on_success(self):
        """Half-open circuit should close after successful call."""
        breaker = CircuitBreaker(
            "test", failure_threshold=1, cooldown_seconds=0.1, success_threshold=1
        )
        failing_func = Mock(side_effect=CircuitTestFailure("Test failure"))
        success_func = Mock(return_value="success")

        # Open the circuit
        with pytest.raises(CircuitTestFailure):
            breaker.call(failing_func)
        assert breaker.state == CircuitState.OPEN

        # Wait for cooldown
        time.sleep(0.15)
        assert breaker.state == CircuitState.HALF_OPEN

        # Successful call should close the circuit
        result = breaker.call(success_func)
        assert result == "success"
        assert breaker.state == CircuitState.CLOSED
        assert breaker.stats.consecutive_failures == 0

    def test_half_open_reopens_on_failure(self):
        """Half-open circuit should reopen immediately on failure."""
        breaker = CircuitBreaker("test", failure_threshold=2, cooldown_seconds=0.1)
        failing_func = Mock(side_effect=CircuitTestFailure("Test failure"))

        # Open the circuit
        for _ in range(2):
            with pytest.raises(CircuitTestFailure):
                breaker.call(failing_func)
        assert breaker.state == CircuitState.OPEN

        # Wait for cooldown
        time.sleep(0.15)
        assert breaker.state == CircuitState.HALF_OPEN

        # Failure in half-open should immediately reopen
        with pytest.raises(CircuitTestFailure):
            breaker.call(failing_func)
        assert breaker.state == CircuitState.OPEN

    def test_manual_reset(self):
        """Manual reset should close the circuit."""
        breaker = CircuitBreaker("test", failure_threshold=1)
        failing_func = Mock(side_effect=CircuitTestFailure("Test failure"))

        # Open the circuit
        with pytest.raises(CircuitTestFailure):
            breaker.call(failing_func)
        assert breaker.state == CircuitState.OPEN

        # Manual reset
        breaker.reset()
        assert breaker.state == CircuitState.CLOSED
        assert breaker.stats.consecutive_failures == 0

        # Should be able to call again
        success_func = Mock(return_value="success")
        result = breaker.call(success_func)
        assert result == "success"

    def test_disabled_circuit_breaker(self):
        """Disabled circuit breaker should always pass through calls."""
        breaker = CircuitBreaker("test", failure_threshold=1, enabled=False)
        failing_func = Mock(side_effect=CircuitTestFailure("Test failure"))

        # Should pass through failures without opening
        for _ in range(5):
            with pytest.raises(CircuitTestFailure, match="Test failure"):
                breaker.call(failing_func)

        # Circuit should remain closed
        assert breaker.state == CircuitState.CLOSED
        # Stats should not be updated when disabled
        assert breaker.stats.failed_calls == 0

    def test_circuit_breaker_stats(self):
        """Circuit breaker should track statistics correctly."""
        breaker = CircuitBreaker("test", failure_threshold=2)
        success_func = Mock(return_value="success")
        failing_func = Mock(side_effect=CircuitTestFailure("failure"))

        # Some successful calls
        for _ in range(3):
            breaker.call(success_func)

        # Some failures
        with pytest.raises(CircuitTestFailure):
            breaker.call(failing_func)

        stats = breaker.stats
        assert stats.total_calls == 4
        assert stats.successful_calls == 3
        assert stats.failed_calls == 1
        assert stats.consecutive_failures == 1

    def test_global_circuit_breaker_instances(self):
        """Global circuit breaker instances should be reused."""
        breaker1 = get_circuit_breaker("test_api")
        breaker2 = get_circuit_breaker("test_api")
        breaker3 = get_circuit_breaker("other_api")

        assert breaker1 is breaker2
        assert breaker1 is not breaker3

    def test_with_circuit_breaker_wrapper(self):
        """with_circuit_breaker function should wrap calls correctly."""
        success_func = Mock(return_value="result")

        result = with_circuit_breaker(success_func, "test_circuit", "arg", key="value")

        assert result == "result"
        success_func.assert_called_once_with("arg", key="value")

    def test_uses_default_thresholds(self):
        """Circuit breaker should fall back to built-in defaults."""
        breaker = CircuitBreaker("test")

        assert breaker.failure_threshold == 3
        assert breaker.cooldown_seconds == 300.0
        assert breaker.enabled is True

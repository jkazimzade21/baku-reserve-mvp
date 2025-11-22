"""File locking utilities for safe concurrent database access."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

try:
    import fcntl  # Unix/Linux/macOS

    HAS_FCNTL = True
except ImportError:
    HAS_FCNTL = False
    try:
        import msvcrt  # Windows

        HAS_MSVCRT = True
    except ImportError:
        HAS_MSVCRT = False


class FileLock:
    """
    Cross-platform file locking for safe concurrent access.

    Uses fcntl on Unix/Linux/macOS and msvcrt on Windows.
    Implements exclusive locking with timeout and retry logic.

    Usage:
        with FileLock(path, timeout=5.0):
            # Exclusive access to file
            data = path.read_text()
            # ... modify data ...
            path.write_text(data)
    """

    def __init__(
        self,
        path: Path | str,
        *,
        timeout: float = 10.0,
        poll_interval: float = 0.01,
    ):
        """
        Initialize file lock.

        Args:
            path: Path to file to lock
            timeout: Maximum time to wait for lock (seconds)
            poll_interval: How often to retry lock acquisition (seconds)
        """
        self.path = Path(path)
        self.timeout = timeout
        self.poll_interval = poll_interval
        self._lock_file: Any = None
        self._lock_path = self.path.parent / f".{self.path.name}.lock"

    def __enter__(self) -> FileLock:
        """Acquire exclusive lock on file."""
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Release lock on file."""
        self.release()

    def acquire(self) -> None:
        """
        Acquire exclusive lock with timeout.

        Raises:
            TimeoutError: If lock cannot be acquired within timeout
            RuntimeError: If file locking is not available on this platform
        """
        if not HAS_FCNTL and not HAS_MSVCRT:
            raise RuntimeError(
                "File locking not available on this platform. "
                "Install fcntl (Unix) or use Windows with msvcrt."
            )

        # Ensure lock directory exists
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)

        start_time = time.monotonic()

        while True:
            try:
                # Open lock file (create if doesn't exist)
                self._lock_file = open(self._lock_path, "a+")

                # Try to acquire lock
                if HAS_FCNTL:
                    # Unix/Linux/macOS: use fcntl
                    fcntl.flock(self._lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                elif HAS_MSVCRT:
                    # Windows: use msvcrt
                    msvcrt.locking(
                        self._lock_file.fileno(),
                        msvcrt.LK_NBLCK,
                        1,
                    )

                # Lock acquired successfully
                return

            except OSError:
                # Lock is held by another process
                if time.monotonic() - start_time >= self.timeout:
                    # Timeout exceeded
                    if self._lock_file:
                        self._lock_file.close()
                        self._lock_file = None
                    raise TimeoutError(
                        f"Could not acquire lock on {self.path} within {self.timeout}s"
                    )

                # Wait before retry
                time.sleep(self.poll_interval)

            except Exception as exc:
                # Unexpected error
                if self._lock_file:
                    self._lock_file.close()
                    self._lock_file = None
                raise RuntimeError(f"Failed to acquire lock on {self.path}") from exc

    def release(self) -> None:
        """Release the file lock."""
        if not self._lock_file:
            return

        try:
            if HAS_FCNTL:
                # Unix/Linux/macOS: unlock with fcntl
                fcntl.flock(self._lock_file.fileno(), fcntl.LOCK_UN)
            elif HAS_MSVCRT:
                # Windows: unlock with msvcrt
                msvcrt.locking(
                    self._lock_file.fileno(),
                    msvcrt.LK_UNLCK,
                    1,
                )
        finally:
            # Always close file handle
            self._lock_file.close()
            self._lock_file = None

            # Clean up lock file (best effort)
            try:
                if self._lock_path.exists():
                    self._lock_path.unlink()
            except Exception:
                pass  # Ignore cleanup errors


__all__ = ["FileLock"]

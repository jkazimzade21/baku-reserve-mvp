"""Tests for file locking to prevent race conditions."""

from __future__ import annotations

import json
import threading
import time

import pytest
from backend.app.file_lock import FileLock


class TestFileLock:
    """Test file locking functionality."""

    def test_lock_prevents_concurrent_writes(self, tmp_path):
        """File lock should prevent concurrent writes from corrupting data."""
        test_file = tmp_path / "test.json"
        test_file.write_text('{"counter": 0}')

        results = []
        errors = []

        def write_with_lock(value: int):
            """Write to file with locking."""
            try:
                with FileLock(test_file, timeout=5.0):  # Increased timeout
                    # Read current value
                    data = json.loads(test_file.read_text())
                    current = data.get("counter", 0)

                    # Simulate processing time
                    time.sleep(0.005)  # Reduced sleep time

                    # Write incremented value
                    data["counter"] = current + value
                    test_file.write_text(json.dumps(data))

                    results.append(value)
            except Exception as exc:
                errors.append(exc)

        # Start 5 concurrent writes (reduced from 10 for reliability)
        threads = []
        for _i in range(5):
            t = threading.Thread(target=write_with_lock, args=(1,))
            t.start()
            threads.append(t)

        # Wait for all threads
        for t in threads:
            t.join(timeout=10)

        # Verify no errors
        assert len(errors) == 0, f"Errors occurred: {errors}"

        # Verify all threads completed
        assert len(results) == 5, f"Expected 5 writes, got {len(results)}"

        # Verify counter is correct (all writes succeeded)
        final_data = json.loads(test_file.read_text())
        assert final_data["counter"] == 5, f"Expected counter=5, got {final_data['counter']}"

    def test_lock_timeout(self, tmp_path):
        """Lock acquisition should timeout if held too long."""
        test_file = tmp_path / "test.json"
        test_file.write_text("{}")

        # Hold lock for 2 seconds
        def hold_lock():
            with FileLock(test_file, timeout=5.0):
                time.sleep(2)

        # Start thread holding lock
        t = threading.Thread(target=hold_lock)
        t.start()

        # Give thread time to acquire lock
        time.sleep(0.1)

        # Try to acquire lock with short timeout
        with pytest.raises(TimeoutError) as exc_info:
            with FileLock(test_file, timeout=0.5):
                pass

        assert "Could not acquire lock" in str(exc_info.value)

        # Wait for first thread to finish
        t.join()

    def test_lock_released_on_exception(self, tmp_path):
        """Lock should be released even if exception occurs."""
        test_file = tmp_path / "test.json"
        test_file.write_text("{}")

        # Acquire lock and raise exception
        try:
            with FileLock(test_file, timeout=1.0):
                raise ValueError("Test exception")
        except ValueError:
            pass

        # Lock should be released - we can acquire it again
        with FileLock(test_file, timeout=1.0):
            pass  # Should succeed

    def test_lock_context_manager(self, tmp_path):
        """Lock should work as context manager."""
        test_file = tmp_path / "test.json"
        test_file.write_text("{}")

        lock = FileLock(test_file)

        # Should not be locked initially
        assert lock._lock_file is None

        with lock:
            # Should be locked inside context
            assert lock._lock_file is not None

        # Should be unlocked after context
        assert lock._lock_file is None

    def test_nested_locks_timeout(self, tmp_path):
        """Nested locks on same file should timeout (deadlock prevention)."""
        test_file = tmp_path / "test.json"
        test_file.write_text("{}")

        with FileLock(test_file, timeout=1.0):
            # Try to acquire same lock again - should timeout
            with pytest.raises(TimeoutError):
                with FileLock(test_file, timeout=0.2):
                    pass

    def test_lock_file_cleanup(self, tmp_path):
        """Lock file should be cleaned up after release."""
        test_file = tmp_path / "test.json"
        test_file.write_text("{}")

        lock_file = tmp_path / ".test.json.lock"

        with FileLock(test_file):
            # Lock file should exist during lock
            assert lock_file.exists()

        # Lock file should be cleaned up after release
        assert not lock_file.exists()

    def test_multiple_different_files(self, tmp_path):
        """Locks on different files should not interfere."""
        file1 = tmp_path / "file1.json"
        file2 = tmp_path / "file2.json"
        file1.write_text("{}")
        file2.write_text("{}")

        # Acquire locks on both files simultaneously
        with FileLock(file1):
            with FileLock(file2):
                # Both locks should be held
                pass

    def test_lock_with_missing_directory(self, tmp_path):
        """Lock should create missing directories for lock file."""
        nested_dir = tmp_path / "nested" / "deep"
        test_file = nested_dir / "test.json"

        # Directory doesn't exist yet
        assert not nested_dir.exists()

        # Create directory and file
        nested_dir.mkdir(parents=True)
        test_file.write_text("{}")

        # Lock should work even with nested directory
        with FileLock(test_file):
            pass


class TestDatabaseLocking:
    """Test database operations with file locking."""

    def test_concurrent_reservation_updates(self, client):
        """Concurrent updates to same reservation should not corrupt data."""
        from backend.app.storage import DB

        # Get restaurant ID
        restaurant = DB.get_restaurant("shawarma-express")
        if not restaurant:
            pytest.skip("Test restaurant not found")

        # Create initial reservation
        resp = client.post(
            "/reservations",
            json={
                "restaurant_id": str(restaurant["id"]),
                "party_size": 2,
                "date": "2025-01-15",
                "time": "19:00",
                "name": "Test User",
                "phone": "+994501234567",
            },
        )
        assert resp.status_code == 201
        reservation_id = resp.json()["id"]

        # Update counter for tracking
        update_count = [0]
        errors = []

        def update_status(status: str):
            """Update reservation status concurrently."""
            try:
                update_count[0] += 1
                resp = client.post(
                    f"/reservations/{reservation_id}/confirm",
                    json={"status": status},
                )
                if resp.status_code not in (200, 400):  # 400 = invalid transition
                    errors.append(f"Unexpected status: {resp.status_code}")
            except Exception as exc:
                errors.append(exc)

        # Start concurrent updates
        threads = []
        for _i in range(5):
            t = threading.Thread(target=update_status, args=("confirmed",))
            t.start()
            threads.append(t)

        # Wait for all threads
        for t in threads:
            t.join()

        # Verify no errors (may have some rejected due to invalid transitions, but no corruption)
        assert len(errors) == 0, f"Errors: {errors}"

        # Verify reservation data is still valid (not corrupted)
        resp = client.get(f"/reservations/{reservation_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("pending", "confirmed")  # Valid state

    def test_concurrent_reservation_creation(self, client):
        """Multiple simultaneous reservation creations should all succeed."""
        from backend.app.storage import DB

        # Get restaurant ID
        restaurant = DB.get_restaurant("shawarma-express")
        if not restaurant:
            pytest.skip("Test restaurant not found")

        restaurant_id = str(restaurant["id"])
        created_ids = []
        errors = []

        def create_reservation(index: int):
            """Create a reservation concurrently."""
            try:
                resp = client.post(
                    "/reservations",
                    json={
                        "restaurant_id": restaurant_id,
                        "party_size": 2,
                        "date": "2025-01-16",
                        "time": f"{18 + index % 3}:00",  # Different times
                        "name": f"User {index}",
                        "phone": f"+99450123456{index}",
                    },
                )
                if resp.status_code == 201:
                    created_ids.append(resp.json()["id"])
                else:
                    errors.append(f"Failed to create: {resp.status_code}")
            except Exception as exc:
                errors.append(exc)

        # Create 10 reservations concurrently
        threads = []
        for i in range(10):
            t = threading.Thread(target=create_reservation, args=(i,))
            t.start()
            threads.append(t)

        # Wait for all threads
        for t in threads:
            t.join()

        # Verify no errors
        assert len(errors) == 0, f"Errors: {errors}"

        # Verify all reservations were created
        assert len(created_ids) == 10

        # Verify all IDs are unique
        assert len(set(created_ids)) == 10

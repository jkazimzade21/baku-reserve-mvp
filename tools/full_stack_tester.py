#!/usr/bin/env python3
"""
Full-stack tester for the Baku Reserve project.

This harness maximises coverage by:
  • Exercising every public HTTP endpoint against a live FastAPI server.
  • Verifying reservation lifecycle rules (conflicts, auto-pick, cancel, confirm, delete).
  • Checking CORS behaviour and HTML console availability.
  • Ensuring the SQLite reservation store is written and cleaned up.
  • Delegating to the existing mega tester to run the in-process API suite, pytest, and TypeScript checks.

Usage:
    python tools/full_stack_tester.py
    python tools/full_stack_tester.py --base http://127.0.0.1:8000
    python tools/full_stack_tester.py --skip-http --skip-mega
"""

from __future__ import annotations

import argparse
import os
import random
import subprocess
import sys
import textwrap
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable, Iterable, List, Optional, Sequence, Tuple

import httpx
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))
try:  # align with FastAPI runtime so we observe the same DATA_DIR rules
    from app.settings import settings as backend_settings
except Exception:  # pragma: no cover - falls back when settings import fails
    backend_settings = None


def resolve_data_dir() -> Path:
    env_override = os.environ.get("DATA_DIR")
    if env_override:
        return Path(env_override).expanduser().resolve()
    if backend_settings:
        return backend_settings.data_dir
    return (Path.home() / ".baku-reserve-data").resolve()


DATA_DIR = resolve_data_dir()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "baku_reserve.db"


@dataclass
class StepResult:
    name: str
    ok: bool
    details: str = ""


def start_backend_server(port: int) -> subprocess.Popen[bytes]:
    """Spawn uvicorn pointing at the repo backend."""
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]
    proc = subprocess.Popen(  # noqa: S603
        cmd,
        cwd=str(BACKEND_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_for_health(f"http://127.0.0.1:{port}/health")
    except Exception:
        proc.terminate()
        raise
    return proc


def stop_backend_server(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:  # pragma: no cover - emergency teardown
            proc.kill()


def wait_for_health(url: str, timeout: float = 20.0) -> None:
    deadline = time.time() + timeout
    last_error: str | None = None
    while time.time() < deadline:
        try:
            resp = httpx.get(url, timeout=2.0)
            if resp.status_code < 500:
                return
            last_error = f"status {resp.status_code}"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(0.25)
    raise RuntimeError(f"Backend did not become ready at {url}: {last_error}")


class HttpEndToEndSuite:
    """Exercises the running API over HTTP to mimic real clients."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(base_url=self.base_url, timeout=10.0)
        self.created_reservation_ids: List[str] = []
        self.primary_restaurant: Optional[dict] = None
        self.primary_availability: Optional[list[dict]] = None

    # ---- runner ---------------------------------------------------------
    def run(self) -> List[StepResult]:
        steps: Sequence[Tuple[str, Callable[[], str]]] = (
            ("reset state", self.reset_state),
            ("health & consoles", self.health_and_consoles),
            ("restaurant catalogue", self.restaurant_catalogue),
            ("availability & reservations", self.availability_and_reservations),
            ("validation rules", self.validation_rules),
            ("CORS preflight", self.cors_preflight),
        )
        results: List[StepResult] = []
        try:
            for name, func in steps:
                ok = True
                detail = ""
                try:
                    detail = func()
                except AssertionError as exc:
                    ok = False
                    detail = str(exc)
                except Exception as exc:  # noqa: BLE001
                    ok = False
                    detail = f"Unexpected error: {exc!r}"
                results.append(StepResult(name, ok, detail))
                if not ok:
                    break
            cleanup_detail = self.cleanup()
            results.append(StepResult("cleanup", True, cleanup_detail))
        finally:
            try:
                self.client.close()
            finally:
                # Defensive cleanup even if we errored before recording the step.
                try:
                    self._delete_created_reservations()
                except Exception:
                    pass
        return results

    # ---- helpers --------------------------------------------------------
    def _delete_created_reservations(self) -> None:
        for resid in list(self.created_reservation_ids):
            try:
                resp = self.client.delete(f"/reservations/{resid}")
                if resp.status_code in (200, 404):
                    self.created_reservation_ids.remove(resid)
            except Exception:  # noqa: BLE001
                pass

    def _assert(self, condition: bool, message: str) -> None:
        if not condition:
            raise AssertionError(message)

    def _first_slot_with_table(self, slots: Iterable[dict], *, earliest: str | None = None) -> dict:
        for slot in slots:
            if earliest and slot["start"] < earliest:
                continue
            if slot["count"] > 0 and slot.get("available_table_ids"):
                return slot
        raise AssertionError("No available slot with tables found for scenario")

    # ---- scenario steps -------------------------------------------------
    def reset_state(self) -> str:
        reset_script = BACKEND_DIR / "reset_backend_state.sh"
        if reset_script.exists():
            subprocess.run([str(reset_script)], cwd=str(BACKEND_DIR), check=False)  # noqa: S603
        resp = self.client.get("/reservations")
        resp.raise_for_status()
        reservations = resp.json()
        for rec in reservations:
            self.client.delete(f"/reservations/{rec['id']}").raise_for_status()
        self.created_reservation_ids.clear()
        return f"cleared {len(reservations)} existing reservations"

    def health_and_consoles(self) -> str:
        endpoints = {
            "/health": lambda r: r.json().get("ok") is True,
            "/docs": lambda r: "text/html" in (r.headers.get("content-type", "")).lower(),
            "/openapi.json": lambda r: r.headers.get("content-type", "").startswith("application/json"),
            "/book/": lambda r: "book a table" in r.text.lower(),
            "/admin/": lambda r: "admin console" in r.text.lower(),
        }
        for path, validator in endpoints.items():
            resp = self.client.get(path)
            resp.raise_for_status()
            self._assert(validator(resp), f"{path} did not return expected payload")
        root = self.client.get("/", follow_redirects=False)
        self._assert(root.status_code in (307, 308), "root should redirect to booking console")
        self._assert(root.headers.get("location") in ("/book/", "/book"), "root redirect target unexpected")
        return "health, docs, OpenAPI, book/admin consoles, and root redirect confirmed"

    def restaurant_catalogue(self) -> str:
        resp = self.client.get("/restaurants")
        resp.raise_for_status()
        restaurants = resp.json()
        self._assert(isinstance(restaurants, list) and restaurants, "/restaurants returned no data")
        self._assert(
            any(r["name"] == "Sahil Bar & Restaurant" for r in restaurants),
            "Expected Sahil Bar & Restaurant in catalogue",
        )
        primary = restaurants[0]
        detail = self.client.get(f"/restaurants/{primary['id']}")
        detail.raise_for_status()
        detail_json = detail.json()
        self._assert(detail_json.get("areas"), "Restaurant detail missing areas data")
        floorplan = self.client.get(f"/restaurants/{primary['id']}/floorplan")
        floorplan.raise_for_status()
        self._assert(floorplan.json().get("areas"), "Floorplan missing areas data")
        query = self.client.get("/restaurants", params={"q": "steak"})
        query.raise_for_status()
        q_results = query.json()
        self._assert(any("Steak" in ", ".join(r.get("cuisine", [])) for r in q_results), "Search did not match steak")
        self.primary_restaurant = primary
        return f"catalogued {len(restaurants)} restaurants with detail, floorplan, and search verified"

    def availability_and_reservations(self) -> str:
        self._assert(self.primary_restaurant is not None, "restaurant catalogue step must run first")
        rid = self.primary_restaurant["id"]
        today = date.today().isoformat()
        availability = self.client.get(
            f"/restaurants/{rid}/availability",
            params={"date": today, "party_size": 2},
        )
        availability.raise_for_status()
        slots = availability.json().get("slots", [])
        self._assert(slots, "availability returned no slots")
        slot = self._first_slot_with_table(slots)
        table_id = slot["available_table_ids"][0]
        payload = {
            "restaurant_id": rid,
            "party_size": 2,
            "start": slot["start"],
            "end": slot["end"],
            "guest_name": "FullStack Tester",
            "guest_phone": "+15551234567",
            "table_id": table_id,
        }
        created = self.client.post("/reservations", json=payload)
        created.raise_for_status()
        booking = created.json()
        resid = booking["id"]
        self.created_reservation_ids.append(resid)
        self._assert(booking["table_id"] == table_id, "explicit reservation did not honour table selection")

        # Verify persistence hit disk.
        if DB_PATH.exists():
            with sqlite3.connect(DB_PATH) as conn:
                cursor = conn.execute(
                    "SELECT COUNT(1) FROM reservations WHERE guest_name = ?",
                    ("FullStack Tester",),
                )
                count = cursor.fetchone()[0]
            self._assert(count > 0, "Database missing the new booking")

        overlap = self.client.post("/reservations", json=payload)
        self._assert(overlap.status_code == 409, f"overlap should return 409, got {overlap.status_code}")

        cancel_once = self.client.post(f"/reservations/{resid}/cancel")
        cancel_once.raise_for_status()
        cancel_twice = self.client.post(f"/reservations/{resid}/cancel")
        cancel_twice.raise_for_status()
        confirm_after_cancel = self.client.post(f"/reservations/{resid}/confirm")
        confirm_after_cancel.raise_for_status()

        refreshed = self.client.get(
            f"/restaurants/{rid}/availability",
            params={"date": today, "party_size": 2},
        )
        refreshed.raise_for_status()
        refreshed_slots = refreshed.json().get("slots", [])
        follow_slot = self._first_slot_with_table(refreshed_slots, earliest=slot["end"])
        autopayload = {
            "restaurant_id": rid,
            "party_size": 4,
            "start": follow_slot["start"],
            "end": follow_slot["end"],
            "guest_name": "AutoPick Tester",
        }
        autopick = self.client.post("/reservations", json=autopayload)
        autopick.raise_for_status()
        auto_booking = autopick.json()
        self.created_reservation_ids.append(auto_booking["id"])
        self._assert(auto_booking["table_id"], "auto-pick did not assign a table")

        listings = self.client.get("/reservations")
        listings.raise_for_status()
        listed_ids = {rec["id"] for rec in listings.json()}
        self._assert(
            set(self.created_reservation_ids).issubset(listed_ids),
            "reservations listing missing active bookings",
        )

        # Clean the auto booking via DELETE; base booking via DELETE after tests.
        self.client.delete(f"/reservations/{auto_booking['id']}").raise_for_status()
        self.created_reservation_ids.remove(auto_booking["id"])
        self.client.delete(f"/reservations/{resid}").raise_for_status()
        self.created_reservation_ids.remove(resid)
        return "explicit bookings, overlap detection, cancel/confirm, auto-pick, and cleanup succeeded"

    def validation_rules(self) -> str:
        self._assert(self.primary_restaurant is not None, "restaurant catalogue step must run first")
        rid = self.primary_restaurant["id"]
        base_start = datetime.combine(date.today(), datetime.min.time())
        invalid_cases = [
            {},
            {"restaurant_id": rid, "party_size": 0, "start": base_start.isoformat(), "end": (base_start + timedelta(hours=1)).isoformat()},
            {"restaurant_id": rid, "party_size": 2, "start": "bad", "end": "bad"},
            {"restaurant_id": rid, "party_size": 2, "start": (base_start + timedelta(hours=3)).isoformat(), "end": (base_start + timedelta(hours=2)).isoformat()},
        ]
        for payload in invalid_cases:
            resp = self.client.post("/reservations", json=payload)
            self._assert(resp.status_code == 422, f"expected 422 for payload {payload}, got {resp.status_code}")
        missing = self.client.get("/restaurants/00000000-0000-0000-0000-000000000000")
        self._assert(missing.status_code == 404, "unknown restaurant should return 404")
        return "invalid payloads rejected with 422 and unknown restaurant returns 404"

    def cors_preflight(self) -> str:
        resp = self.client.options(
            "/reservations",
            headers={
                "Origin": "http://example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        self._assert(resp.status_code in (200, 204), f"preflight returned {resp.status_code}")
        header_names = {name.lower() for name in resp.headers}
        self._assert("access-control-allow-origin" in header_names, "allow-origin header missing in preflight")
        return "CORS preflight exposes access-control-allow-origin"

    def cleanup(self) -> str:
        before = len(self.created_reservation_ids)
        self._delete_created_reservations()
        remaining = self.client.get("/reservations")
        remaining.raise_for_status()
        self._assert(
            all(rec["id"] not in self.created_reservation_ids for rec in remaining.json()),
            "reservations still present after cleanup",
        )
        return f"cleaned up {before} ephemeral reservations"


def run_mega_tester(skip_mobile: bool, skip_pytest: bool) -> StepResult:
    cmd = [sys.executable, str(ROOT / "tools" / "mega_tester.py")]
    if skip_mobile:
        cmd.append("--skip-mobile")
    if skip_pytest:
        cmd.append("--skip-pytest")
    env = os.environ.copy()
    venv_dir = BACKEND_DIR / ".venv"
    if "VIRTUAL_ENV" not in env and venv_dir.exists():
        env["VIRTUAL_ENV"] = str(venv_dir)
        # Ensure virtualenv bin dir comes first in PATH so subprocesses pick local tools.
        bin_dir = venv_dir / "bin"
        if bin_dir.exists():
            env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH','')}"
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, env=env)  # noqa: S603
    if proc.returncode == 0:
        return StepResult("mega tester", True, "Mega tester (API suite + pytest + tsc) passed")
    details = textwrap.dedent(
        f"""\
        Mega tester failed with exit code {proc.returncode}
        STDOUT:
        {proc.stdout}
        STDERR:
        {proc.stderr}
        """.strip()
    )
    return StepResult("mega tester", False, details)


def choose_ephemeral_port(start: int = 8800, end: int = 8990) -> int:
    return random.randint(start, end)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run comprehensive full-stack tests for Baku Reserve.")
    parser.add_argument("--base", help="Use an already running backend at this base URL")
    parser.add_argument("--skip-http", action="store_true", help="Skip HTTP end-to-end checks")
    parser.add_argument("--skip-mega", action="store_true", help="Skip invoking tools/mega_tester.py")
    parser.add_argument("--skip-mobile", action="store_true", help="Skip mobile TypeScript checks inside mega tester")
    parser.add_argument("--skip-pytest", action="store_true", help="Skip pytest invocation inside mega tester")
    parser.add_argument("--port", type=int, default=0, help="Override port when auto-starting backend (default random 8800-8990)")
    args = parser.parse_args()

    summary: List[StepResult] = []
    server_proc: subprocess.Popen[bytes] | None = None
    base_url = args.base

    if not args.skip_http:
        if base_url is None:
            port = args.port or choose_ephemeral_port()
            try:
                server_proc = start_backend_server(port)
            except Exception as exc:  # noqa: BLE001
                summary.append(StepResult("start backend", False, f"Failed to start local backend: {exc}"))
            else:
                base_url = f"http://127.0.0.1:{port}"
        if base_url:
            suite = HttpEndToEndSuite(base_url)
            summary.extend(suite.run())

    if server_proc is not None:
        stop_backend_server(server_proc)

    if not args.skip_mega:
        summary.append(run_mega_tester(skip_mobile=args.skip_mobile, skip_pytest=args.skip_pytest))

    width = max((len(step.name) for step in summary), default=0)
    print("\n=== Full Stack Tester Summary ===")
    for step in summary:
        status = "PASS" if step.ok else "FAIL"
        detail = f" - {step.details}" if step.details else ""
        print(f"[{status}] {step.name.ljust(width)}{detail}")

    failures = [step for step in summary if not step.ok]
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()

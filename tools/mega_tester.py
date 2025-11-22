#!/usr/bin/env python3
"""
Mega tester for the Baku Reserve project.

Executes an end-to-end FastAPI scenario suite, then delegates to the backend
pytest suite and the mobile TypeScript type-checker to provide broad coverage.
Usage examples:
  python tools/mega_tester.py
  python tools/mega_tester.py --skip-mobile
"""

from __future__ import annotations

import argparse
import os
import time as monotonic_time
import subprocess
import sys
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Callable, List, Sequence
from urllib import error as urlerror
from urllib import request as urlrequest

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
MOBILE_DIR = ROOT / "mobile"

VENV_SITE_PACKAGES = None
venv_dir = BACKEND_DIR / ".venv"
if venv_dir.exists():
    venv_python = venv_dir / "bin" / "python"
    if venv_python.exists():
        if os.environ.get("VIRTUAL_ENV") != str(venv_dir):
            os.execv(str(venv_python), [str(venv_python), str(Path(__file__).resolve()), *sys.argv[1:]])
    candidates = list((venv_dir / "lib").glob("python*/site-packages"))
    if candidates:
        VENV_SITE_PACKAGES = candidates[0]
        sys.path.insert(0, str(VENV_SITE_PACKAGES))

sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # type: ignore  # noqa: E402

from app.main import app  # type: ignore  # noqa: E402
from app.storage import DB  # type: ignore  # noqa: E402
from app.settings import settings  # type: ignore  # noqa: E402

DB_PATH = settings.data_dir / "baku_reserve.db"


@dataclass
class StepResult:
    name: str
    ok: bool
    details: str = ""


class BackendScenarioSuite:
    """
    Exercises critical backend flows with FastAPI's TestClient.
    Interacts with the in-memory caches and persisted SQLite DB to guarantee clean state.
    """

    def __init__(self) -> None:
        self.client = TestClient(app)
        self.results: List[StepResult] = []

    def run(self) -> List[StepResult]:
        self._reset()
        scenarios: Sequence[Callable[[], str]] = (
            self.health_and_docs,
            self.restaurants_listing,
            self.availability_flow,
            self.reservation_lifecycle,
            self.validation_errors,
            self.cors_preflight,
            self.persistence_roundtrip,
        )
        for scenario in scenarios:
            name = scenario.__name__.replace("_", " ")
            try:
                details = scenario()
            except AssertionError as exc:
                self.results.append(StepResult(name, False, str(exc)))
            except Exception as exc:  # pragma: no cover - defensive guardrail
                self.results.append(StepResult(name, False, f"Unexpected error: {exc!r}"))
            else:
                self.results.append(StepResult(name, True, details))
                self._reset()
        return self.results

    def _reset(self) -> None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("DELETE FROM reservations")
            conn.commit()

    @staticmethod
    def _assert(condition: bool, message: str) -> None:
        if not condition:
            raise AssertionError(message)

    def health_and_docs(self) -> str:
        health = self.client.get("/health")
        self._assert(health.status_code == 200, f"/health expected 200 got {health.status_code}")
        payload = health.json()
        self._assert(payload.get("ok") is True, "health ok flag is false")
        docs = self.client.get("/docs")
        openapi = self.client.get("/openapi.json")
        self._assert(docs.status_code == 200, f"/docs expected 200 got {docs.status_code}")
        self._assert(openapi.status_code == 200, f"/openapi.json expected 200 got {openapi.status_code}")
        root = self.client.get("/", follow_redirects=False)
        self._assert(root.status_code in (307, 308), f"/ root redirect unexpected {root.status_code}")
        self._assert(root.headers.get("location") in ("/book/", "/book"), "root should redirect to /book/")
        book = self.client.get("/book/")
        self._assert(book.status_code == 200, f"/book/ expected 200 got {book.status_code}")
        self._assert("text/html" in book.headers.get("content-type", ""), "/book/ should return HTML")
        book_qs = self.client.get("/book", params={"rid": "demo", "date": "2030-01-01"})
        self._assert(book_qs.status_code == 200, f"/book with query expected 200 got {book_qs.status_code}")
        self._assert("text/html" in book_qs.headers.get("content-type", ""), "/book should return HTML")
        admin = self.client.get("/admin/")
        self._assert(admin.status_code == 200, f"/admin/ expected 200 got {admin.status_code}")
        self._assert("text/html" in admin.headers.get("content-type", ""), "/admin/ should return HTML")
        return "health checks, documentation, and web consoles reachable"

    def restaurants_listing(self) -> str:
        resp = self.client.get("/restaurants")
        self._assert(resp.status_code == 200, f"/restaurants expected 200 got {resp.status_code}")
        items = resp.json()
        self._assert(len(items) >= 3, "expected at least three seeded restaurants")
        sahil = next((r for r in items if r["name"] == "Sahil Bar & Restaurant"), None)
        self._assert(sahil is not None, "Sahil Bar & Restaurant missing from listing")
        detail = self.client.get(f"/restaurants/{sahil['id']}")
        self._assert(detail.status_code == 200, f"/restaurants/{{id}} expected 200 got {detail.status_code}")
        detail_json = detail.json()
        self._assert(detail_json.get("areas"), "restaurant detail must include at least one area")
        floorplan = self.client.get(f"/restaurants/{sahil['id']}/floorplan")
        self._assert(floorplan.status_code == 200, f"/restaurants/{{id}}/floorplan status {floorplan.status_code}")
        query = self.client.get("/restaurants", params={"q": "steak"})
        self._assert(any("Steakhouse" in r["cuisine"] for r in query.json()), "query filter did not match cuisine")
        return "listing, detail, floorplan, and query filter validated"

    def availability_flow(self) -> str:
        today = date.today()
        restaurants = self.client.get("/restaurants").json()
        rid = restaurants[0]["id"]
        avail = self.client.get(f"/restaurants/{rid}/availability", params={"date": today.isoformat(), "party_size": 2})
        self._assert(avail.status_code == 200, f"availability expected 200 got {avail.status_code}")
        slots = avail.json()["slots"]
        self._assert(slots, "availability returned no slots")
        for slot in slots:
            self._assert(slot["count"] == len(slot["available_table_ids"]), "slot count does not match table ids")
        ten_am = [slot for slot in slots if slot["start"].endswith("T10:00:00")]
        self._assert(ten_am, "expected a 10:00 slot")
        return f"{len(slots)} slots validated with consistent counts"

    def reservation_lifecycle(self) -> str:
        today = date.today()
        start = datetime.combine(today, time(12, 0))
        end = start + timedelta(minutes=90)
        restaurants = self.client.get("/restaurants").json()
        rid = restaurants[0]["id"]

        create_payload = {
            "restaurant_id": rid,
            "party_size": 2,
            "start": start.isoformat(timespec="seconds"),
            "end": end.isoformat(timespec="seconds"),
            "guest_name": "Mega Tester",
            "guest_phone": "+15550000000",
        }
        created = self.client.post("/reservations", json=create_payload)
        self._assert(created.status_code == 201, f"create reservation expected 201 got {created.status_code}")
        rid1 = created.json()["id"]

        overlap = self.client.post("/reservations", json={**create_payload, "guest_name": "Overlap"})
        self._assert(overlap.status_code == 409, "overlapping booking should return 409")

        cancel = self.client.post(f"/reservations/{rid1}/cancel")
        self._assert(cancel.status_code == 200, "first cancel should succeed")
        confirm = self.client.post(f"/reservations/{rid1}/confirm")
        self._assert(confirm.status_code == 200, "confirm after cancel should succeed")

        deletion = self.client.delete(f"/reservations/{rid1}")
        self._assert(deletion.status_code == 200, "delete should succeed")
        missing_delete = self.client.delete(f"/reservations/{rid1}")
        self._assert(missing_delete.status_code == 404, "repeat delete should return 404")

        autopick_start = datetime.combine(today, time(14, 0))
        autopick = self.client.post("/reservations", json={
            **create_payload,
            "start": autopick_start.isoformat(timespec="seconds"),
            "end": (autopick_start + timedelta(minutes=90)).isoformat(timespec="seconds"),
            "table_id": None,
        })
        self._assert(autopick.status_code == 201, "autopick reservation expected 201")
        table_id = autopick.json()["table_id"]
        self._assert(table_id is not None, "autopick did not assign a table")
        self.client.delete(f"/reservations/{autopick.json()['id']}")
        return "create, conflict handling, cancel/confirm, delete, and autopick paths verified"

    def validation_errors(self) -> str:
        restaurants = self.client.get("/restaurants").json()
        rid = restaurants[0]["id"]
        base_day = date.today().isoformat()
        bad_uuid = self.client.get("/restaurants/00000000-0000-0000-0000-000000000000")
        self._assert(bad_uuid.status_code == 404, "unknown restaurant should 404")
        invalid_payloads = [
            {},
            {"restaurant_id": rid, "party_size": 0},
            {"restaurant_id": rid, "party_size": 2, "start": "bad", "end": "bad"},
            {"restaurant_id": rid, "party_size": 2, "start": f"{base_day}T10:00:00", "end": f"{base_day}T09:00:00"},
        ]
        for payload in invalid_payloads:
            res = self.client.post("/reservations", json=payload)
            self._assert(res.status_code == 422, f"expected 422 for payload {payload}")
        return "input validation rejects malformed payloads"

    def cors_preflight(self) -> str:
        preflight = self.client.options(
            "/reservations",
            headers={
                "Origin": "http://example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        self._assert(preflight.status_code in (200, 204), f"preflight status {preflight.status_code}")
        self._assert("access-control-allow-origin" in {h.lower() for h in preflight.headers}, "CORS header missing")
        return "CORS preflight responds with allow-origin header"

    def persistence_roundtrip(self) -> str:
        restaurants = self.client.get("/restaurants").json()
        rid = restaurants[0]["id"]
        start = datetime.combine(date.today(), time(18, 0))
        payload = {
            "restaurant_id": rid,
            "party_size": 4,
            "start": start.isoformat(timespec="seconds"),
            "end": (start + timedelta(minutes=90)).isoformat(timespec="seconds"),
            "guest_name": "Persist Tester",
        }
        created = self.client.post("/reservations", json=payload)
        self._assert(created.status_code == 201, "expected successful create for persistence test")
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute(
                "SELECT COUNT(1) FROM reservations WHERE guest_name = ?",
                ("Persist Tester",),
            )
            count = cursor.fetchone()[0]
        self._assert(count > 0, "reservations table should contain persisted data")
        reservations = self.client.get("/reservations")
        self._assert(reservations.status_code == 200, "listing reservations should return 200")
        items = reservations.json()
        self._assert(any(r["guest_name"] == "Persist Tester" for r in items), "persisted reservation missing in list")
        return "reservations persist to SQLite and reload correctly"


def wait_for_health(url: str, timeout: float = 15.0) -> None:
    start = monotonic_time.time()
    while monotonic_time.time() - start < timeout:
        try:
            with urlrequest.urlopen(url, timeout=1.0) as resp:  # noqa: S310 - internal health check
                if resp.status < 500:
                    return
        except urlerror.URLError:
            monotonic_time.sleep(0.25)
    raise RuntimeError(f"Backend did not become ready at {url} within {timeout} seconds")


def start_backend_server(port: int) -> subprocess.Popen[bytes]:
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
        cwd=BACKEND_DIR,
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
        except subprocess.TimeoutExpired:
            proc.kill()


def run_pytest(py_args: Sequence[str], env: dict[str, str]) -> None:
    cmd = [sys.executable, "-m", "pytest", "-q", *py_args]
    subprocess.run(cmd, cwd=BACKEND_DIR, check=True, env=env)


def run_mobile_typecheck() -> None:
    # Prefer the local tsc from node_modules; fall back to npx.
    candidate = MOBILE_DIR / "node_modules" / ".bin" / "tsc"
    if candidate.exists():
        subprocess.run([str(candidate), "--noEmit"], cwd=MOBILE_DIR, check=True)
    else:
        subprocess.run(["npx", "--yes", "tsc", "--noEmit"], cwd=MOBILE_DIR, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Baku Reserve mega test suite.")
    parser.add_argument("--skip-mobile", action="store_true", help="Skip mobile TypeScript checks")
    parser.add_argument("--skip-pytest", action="store_true", help="Skip invoking the backend pytest suite")
    parser.add_argument("pytest_args", nargs=argparse.REMAINDER, help="Extra args passed to pytest")
    args = parser.parse_args()

    suite = BackendScenarioSuite()
    results = suite.run()

    summary: List[StepResult] = results.copy()

    if not args.skip_pytest:
        backend_env = os.environ.copy()
        server_proc: subprocess.Popen[bytes] | None = None
        start_needed = not backend_env.get("BASE")
        if start_needed:
            try:
                port = int(backend_env.get("MEGA_TEST_PORT", "8765"))
                server_proc = start_backend_server(port)
                backend_env["BASE"] = f"http://127.0.0.1:{port}"
            except Exception as exc:
                summary.append(StepResult("pytest backend", False, f"could not start backend server: {exc}"))
                server_proc = None
        if server_proc or not start_needed:
            try:
                run_pytest(args.pytest_args, backend_env)
            except subprocess.CalledProcessError as exc:
                summary.append(StepResult("pytest backend", False, f"pytest failed with exit code {exc.returncode}"))
            else:
                summary.append(StepResult("pytest backend", True, "pytest suite passed"))
            finally:
                if server_proc is not None:
                    stop_backend_server(server_proc)

    if not args.skip_mobile:
        try:
            run_mobile_typecheck()
        except FileNotFoundError:
            summary.append(StepResult("mobile typecheck", False, "TypeScript compiler not installed (run npm install)"))
        except subprocess.CalledProcessError as exc:
            summary.append(StepResult("mobile typecheck", False, f"tsc failed with exit code {exc.returncode}"))
        else:
            summary.append(StepResult("mobile typecheck", True, "tsc completed without errors"))

    width = max(len(step.name) for step in summary)
    print("\n=== Mega Tester Summary ===")
    for step in summary:
        status = "PASS" if step.ok else "FAIL"
        detail = f" - {step.details}" if step.details else ""
        print(f"[{status}] {step.name.ljust(width)}{detail}")

    failures = [step for step in summary if not step.ok]
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()

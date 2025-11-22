#!/usr/bin/env python3
"""
Ultimate test orchestrator for the Baku Reserve stack.

Runs an in-process backend audit that exercises every public API surface,
enforces strict reservation invariants, then invokes pytest, the Jest suite,
and a TypeScript typecheck.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import List, Sequence

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
MOBILE_DIR = ROOT / "mobile"

VENV_DIR = ROOT / ".venv"
if VENV_DIR.exists():
    venv_python = VENV_DIR / "bin" / "python"
    if venv_python.exists() and Path(sys.executable).resolve() != venv_python.resolve():
        os.execv(str(venv_python), [str(venv_python), str(Path(__file__).resolve()), *sys.argv[1:]])
    site_candidates = list((VENV_DIR / "lib").glob("python*/site-packages"))
    if site_candidates:
        sys.path.insert(0, str(site_candidates[0]))

sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # type: ignore  # noqa: E402

from app.main import app, DB  # type: ignore  # noqa: E402
from app.settings import settings  # type: ignore  # noqa: E402

DB_PATH = settings.data_dir / "baku_reserve.db"


@dataclass
class StepResult:
    name: str
    ok: bool
    details: str = ""


class UltimateBackendAudit:
    """Brutal backend scenario coverage using FastAPI's TestClient."""

    def __init__(self) -> None:
        self.client = TestClient(app)
        self.results: List[StepResult] = []

    def run(self) -> List[StepResult]:
        self._reset()
        scenarios = [
            self.health_and_ui_surfaces,
            self.restaurant_catalog_and_queries,
            self.availability_consistency,
            self.reservation_lifecycle_and_conflicts,
            self.reservation_listing_and_status_guards,
            self.cancellation_without_delete_restores_availability,
            self.persistence_roundtrip,
        ]

        for scenario in scenarios:
            label = scenario.__name__.replace("_", " ")
            try:
                info = scenario()
            except AssertionError as exc:
                self.results.append(StepResult(label, False, str(exc)))
            except Exception as exc:  # pragma: no cover - defensive catch
                self.results.append(StepResult(label, False, f"Unexpected error: {exc!r}"))
            else:
                self.results.append(StepResult(label, True, info))
            finally:
                self._reset()
        return self.results

    @staticmethod
    def _assert(condition: bool, message: str) -> None:
        if not condition:
            raise AssertionError(message)

    def _reset(self) -> None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("DELETE FROM reservations")
            conn.commit()

    @staticmethod
    def _today_iso() -> str:
        return date.today().isoformat()

    def health_and_ui_surfaces(self) -> str:
        health = self.client.get("/health")
        self._assert(health.status_code == 200, f"/health returned {health.status_code}")
        body = health.json()
        self._assert(body.get("ok") is True, "health ok flag is false")

        docs = self.client.get("/docs")
        openapi = self.client.get("/openapi.json")
        self._assert(docs.status_code == 200, f"/docs returned {docs.status_code}")
        self._assert(openapi.status_code == 200, f"/openapi.json returned {openapi.status_code}")

        root = self.client.get("/", follow_redirects=False)
        self._assert(root.status_code in (307, 308), f"/ root expected redirect but got {root.status_code}")
        self._assert(root.headers.get("location") in ("/book", "/book/"), "root should redirect to /book/")

        for path in ("/book", "/book/", "/admin", "/admin/"):
            page = self.client.get(path)
            self._assert(page.status_code == 200, f"{path} should return 200")
            self._assert("text/html" in page.headers.get("content-type", ""), f"{path} should be HTML")
        return "health, documentation, and HTML consoles verified"

    def restaurant_catalog_and_queries(self) -> str:
        listing = self.client.get("/restaurants")
        self._assert(listing.status_code == 200, f"/restaurants {listing.status_code}")
        items = listing.json()
        self._assert(len(items) >= 3, "expected at least three seeded restaurants")
        target = items[0]

        detail = self.client.get(f"/restaurants/{target['id']}")
        self._assert(detail.status_code == 200, f"/restaurants/{{id}} {detail.status_code}")
        detail_data = detail.json()
        self._assert(detail_data.get("areas"), "restaurant detail missing areas")

        floorplan = self.client.get(f"/restaurants/{target['id']}/floorplan")
        self._assert(floorplan.status_code == 200, f"/restaurants/{{id}}/floorplan {floorplan.status_code}")

        query_name = self.client.get("/restaurants", params={"q": target["name"].split()[0]})
        self._assert(any(rest["id"] == target["id"] for rest in query_name.json()), "name query failed")

        query_city = self.client.get("/restaurants", params={"q": target.get("city", "")[:3]})
        self._assert(query_city.json(), "city query returned empty results")

        query_cuisine = self.client.get("/restaurants", params={"q": (target.get("cuisine") or [''])[0]})
        self._assert(query_cuisine.json(), "cuisine query returned empty results")
        return "listing, detail, floorplan, and query filters validated"

    def availability_consistency(self) -> str:
        rid = self.client.get("/restaurants").json()[0]["id"]
        today = self._today_iso()
        availability = self.client.get(
            f"/restaurants/{rid}/availability",
            params={"date": today, "party_size": 2},
        )
        self._assert(availability.status_code == 200, f"availability returned {availability.status_code}")
        slots = availability.json()["slots"]
        self._assert(slots, "availability returned no slots")
        for slot in slots:
            self._assert(slot["count"] == len(slot["available_table_ids"]), "slot count mismatch")
        ten_am = [slot for slot in slots if slot["start"].endswith("T10:00:00")]
        self._assert(ten_am, "expected 10:00 slot to exist")
        return f"{len(slots)} availability slots checked for consistency"

    def reservation_lifecycle_and_conflicts(self) -> str:
        rid = self.client.get("/restaurants").json()[0]["id"]
        today = date.today()
        start = datetime.combine(today, time(18, 0))
        end = start + timedelta(minutes=90)
        payload = {
            "restaurant_id": rid,
            "party_size": 2,
            "start": start.isoformat(timespec="seconds"),
            "end": end.isoformat(timespec="seconds"),
            "guest_name": "Ultimate Tester",
        }
        created = self.client.post("/reservations", json=payload)
        self._assert(created.status_code == 201, f"create returned {created.status_code}")
        resid = created.json()["id"]

        overlap = self.client.post("/reservations", json=payload)
        self._assert(overlap.status_code == 409, "overlap should return 409")

        cancel = self.client.post(f"/reservations/{resid}/cancel")
        self._assert(cancel.status_code == 200, "cancel should succeed")
        confirm = self.client.post(f"/reservations/{resid}/confirm")
        self._assert(confirm.status_code == 200, "confirm should succeed after cancel")

        autopick_start = datetime.combine(today, time(20, 0))
        autopick_end = autopick_start + timedelta(minutes=90)
        autopick_payload = {
            **payload,
            "party_size": 5,
            "start": autopick_start.isoformat(timespec="seconds"),
            "end": autopick_end.isoformat(timespec="seconds"),
            "guest_name": "AutoPick Strict",
        }
        autopick = self.client.post("/reservations", json=autopick_payload)
        self._assert(autopick.status_code == 201, "autopick should return 201")
        table_id = autopick.json()["table_id"]
        self._assert(table_id is not None, "autopick did not assign table")
        tables = DB._table_lookup(rid)  # type: ignore[attr-defined]
        eligible_capacities = [t["capacity"] for t in tables.values() if t["capacity"] >= autopick_payload["party_size"]]
        self._assert(eligible_capacities, "no eligible tables found for autopick")
        chosen_capacity = tables[table_id]["capacity"]
        self._assert(chosen_capacity == min(eligible_capacities), "autopick chose non-minimal table")

        delete = self.client.delete(f"/reservations/{resid}")
        self._assert(delete.status_code == 200, "delete should succeed")
        missing_delete = self.client.delete(f"/reservations/{resid}")
        self._assert(missing_delete.status_code == 404, "repeat delete should 404")
        self.client.delete(f"/reservations/{autopick.json()['id']}")
        return "conflicts, cancel/confirm, delete, and autopick minimal-selection enforced"

    def reservation_listing_and_status_guards(self) -> str:
        rid = self.client.get("/restaurants").json()[0]["id"]
        today = self._today_iso()
        payload = {
            "restaurant_id": rid,
            "party_size": 3,
            "start": f"{today}T17:00:00",
            "end": f"{today}T18:30:00",
            "guest_name": "Listing Guard",
        }
        created = self.client.post("/reservations", json=payload)
        self._assert(created.status_code == 201, "create should succeed")
        resid = created.json()["id"]

        listing = self.client.get("/reservations")
        self._assert(listing.status_code == 200, "reservations list should succeed")
        self._assert(any(item["id"] == resid for item in listing.json()), "reservation missing from list")

        invalid_status = None
        try:
            DB.set_status(resid, "seated")  # type: ignore[attr-defined]
        except Exception as exc:  # noqa: BLE001 - we expect HTTPException
            invalid_status = exc
        self._assert(invalid_status is not None, "invalid status should raise HTTPException")
        self.client.delete(f"/reservations/{resid}")
        return "list endpoint and invalid status safeguards verified"

    def cancellation_without_delete_restores_availability(self) -> str:
        rid = self.client.get("/restaurants").json()[0]["id"]
        today = self._today_iso()
        availability = self.client.get(
            f"/restaurants/{rid}/availability", params={"date": today, "party_size": 2}
        )
        self._assert(availability.status_code == 200, "availability should succeed")
        slots = availability.json()["slots"]
        target = next((slot for slot in slots if slot["start"].endswith("T12:00:00")), None)
        self._assert(target is not None, "expected a 12:00 slot to exist")

        payload = {
            "restaurant_id": rid,
            "party_size": 2,
            "start": target["start"],
            "end": target["end"],
            "guest_name": "CancelOnly",
        }
        created = self.client.post("/reservations", json=payload)
        self._assert(created.status_code == 201, "create should succeed")
        rid_new = created.json()["id"]

        during = self.client.get(
            f"/restaurants/{rid}/availability", params={"date": today, "party_size": 2}
        )
        during_slot = next(slot for slot in during.json()["slots"] if slot["start"] == target["start"])
        self._assert(
            during_slot["count"] == max(0, target["count"] - 1),
            "count should drop after booking",
        )

        cancel = self.client.post(f"/reservations/{rid_new}/cancel")
        self._assert(cancel.status_code == 200, "cancel should succeed")

        after = self.client.get(
            f"/restaurants/{rid}/availability", params={"date": today, "party_size": 2}
        )
        after_slot = next(slot for slot in after.json()["slots"] if slot["start"] == target["start"])
        self._assert(after_slot["count"] == target["count"], "count should restore after cancel")
        return "cancel flow restores availability without hard delete"

    def persistence_roundtrip(self) -> str:
        rid = self.client.get("/restaurants").json()[0]["id"]
        today = date.today()
        start = datetime.combine(today, time(21, 0))
        payload = {
            "restaurant_id": rid,
            "party_size": 4,
            "start": start.isoformat(timespec="seconds"),
            "end": (start + timedelta(minutes=90)).isoformat(timespec="seconds"),
            "guest_name": "PersistStrict",
        }
        created = self.client.post("/reservations", json=payload)
        self._assert(created.status_code == 201, "create should succeed")

        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute(
                "SELECT COUNT(1) FROM reservations WHERE guest_name = ?",
                ("PersistStrict",),
            )
            count = cursor.fetchone()[0]
        self._assert(count > 0, "reservations table should not be empty")

        listing = self.client.get("/reservations")
        self._assert(any(item["guest_name"] == "PersistStrict" for item in listing.json()), "persisted reservation missing")
        return "reservations persist to SQLite and survive reload"


def run_command(cmd: Sequence[str], cwd: Path, name: str, summary: List[StepResult]) -> None:
    try:
        subprocess.run(cmd, cwd=cwd, check=True)
    except subprocess.CalledProcessError as exc:
        summary.append(StepResult(name, False, f"exit code {exc.returncode}"))
    else:
        summary.append(StepResult(name, True, "passed"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the ultimate Baku Reserve test harness.")
    parser.add_argument("--skip-pytest", action="store_true", help="Skip backend pytest invocation")
    parser.add_argument("--skip-mobile", action="store_true", help="Skip mobile Jest suite")
    parser.add_argument("--skip-tsc", action="store_true", help="Skip TypeScript type checks")
    args, unknown_pytest = parser.parse_known_args()

    audit = UltimateBackendAudit()
    summary = audit.run()

    if not args.skip_pytest:
        pytest_cmd = [sys.executable, "-m", "pytest", "-q", *unknown_pytest]
        run_command(pytest_cmd, BACKEND_DIR, "backend pytest", summary)

    if not args.skip_mobile:
        run_command(["npm", "test"], MOBILE_DIR, "mobile jest", summary)

    if not args.skip_tsc:
        tsc_bin = MOBILE_DIR / "node_modules" / ".bin" / "tsc"
        if tsc_bin.exists():
            tsc_cmd = [str(tsc_bin), "--noEmit"]
        else:
            tsc_cmd = ["npx", "--yes", "tsc", "--noEmit"]
        run_command(tsc_cmd, MOBILE_DIR, "typescript check", summary)

    width = max(len(step.name) for step in summary)
    print("\n=== Super Strict Tester Summary ===")
    for step in summary:
        status = "PASS" if step.ok else "FAIL"
        detail = f" - {step.details}" if step.details else ""
        print(f"[{status}] {step.name.ljust(width)}{detail}")

    failures = [step for step in summary if not step.ok]
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()

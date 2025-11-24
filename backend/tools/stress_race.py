import argparse
import asyncio
import datetime as dt
import json
import os

import httpx


def iso(day, hhmm, dur="01:30"):
    h, m = map(int, hhmm.split(":"))
    sd = dt.datetime.strptime(day, "%Y-%m-%d")
    start = sd.replace(hour=h, minute=m, second=0, microsecond=0)
    dh, dm = map(int, dur.split(":"))
    end = start + dt.timedelta(hours=dh, minutes=dm)
    return start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("BASE", "http://192.168.0.148:8000"))
    ap.add_argument("--rid", required=True)
    ap.add_argument("--tid", required=True)
    ap.add_argument("--start", default="10:00")
    ap.add_argument("--duration", default="01:30")
    ap.add_argument("--tasks", type=int, default=12)
    args = ap.parse_args()

    day = dt.date.today().strftime("%Y-%m-%d")
    s, e = iso(day, args.start, args.duration)

    async with httpx.AsyncClient(base_url=args.base, timeout=10) as client:
        existing = (await client.get("/reservations")).json()
        for rec in existing:
            await client.delete(f"/reservations/{rec['id']}")

        payload = dict(
            restaurant_id=args.rid,
            party_size=2,
            start=s,
            end=e,
            guest_name="RACE",
            table_id=args.tid,
        )

        async def attempt(i):
            r = await client.post("/reservations", json=payload)
            return r.status_code, r.text

        results = await asyncio.gather(*[attempt(i) for i in range(args.tasks)])

        successes = sum(1 for code, _ in results if code == 201)
        conflicts = sum(1 for code, _ in results if code == 409)
        others = [(code, body) for code, body in results if code not in (201, 409)]

        for rec in (await client.get("/reservations")).json():
            await client.delete(f"/reservations/{rec['id']}")

        print(
            json.dumps(
                {
                    "slot": {"start": s, "end": e, "table_id": args.tid},
                    "attempts": args.tasks,
                    "successes": successes,
                    "conflicts": conflicts,
                    "others": others,
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    asyncio.run(main())

import datetime as dt

from locust import HttpUser, between, task

RID = "fc34a984-0b39-4f0a-afa2-5b677c61f044"
T2 = "e5c360cf-31df-4276-841e-8cd720b5942c"


def iso(day, hhmm, dur="01:30"):
    h, m = map(int, hhmm.split(":"))
    sd = dt.datetime.strptime(day, "%Y-%m-%d")
    start = sd.replace(hour=h, minute=m, second=0, microsecond=0)
    dh, dm = map(int, dur.split(":"))
    end = start + dt.timedelta(hours=dh, minutes=dm)
    return start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")


class ReserveUser(HttpUser):
    wait_time = between(0.5, 2.0)

    @task
    def flow(self):
        self.client.get("/health")
        day = dt.date.today().strftime("%Y-%m-%d")
        self.client.get(f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2})
        s, e = iso(day, "10:00")
        r = self.client.post(
            "/reservations",
            json={
                "restaurant_id": RID,
                "party_size": 2,
                "start": s,
                "end": e,
                "guest_name": "Locust",
                "table_id": T2,
            },
        )
        if r.status_code == 201:
            rid = r.json()["id"]
            self.client.post(f"/reservations/{rid}/cancel")
            self.client.delete(f"/reservations/{rid}")

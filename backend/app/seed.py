from .schemas import Area, Restaurant, Table
from .storage import DB


def seed():
    if DB.restaurants:
        return

    def t(name, cap, x, y):
        return Table(name=name, capacity=cap, position=(x, y))

    sahil = Restaurant(
        name="Sahil Bar & Restaurant",
        cuisine=["Azerbaijani", "Seafood"],
        city="Baku",
        address="Neftchilar Ave, Seaside Boulevard",
        phone="+994 12 000 0000",
        photos=["https://picsum.photos/seed/sahil/800/500"],
        areas=[
            Area(
                name="Main Hall",
                tables=[t("T1", 4, 200, 300), t("T2", 2, 350, 320), t("T3", 4, 480, 310)],
            ),
            Area(name="Terrace", tables=[t("W1", 2, 700, 220), t("W2", 4, 820, 260)]),
        ],
    )

    gunaydin = Restaurant(
        name="Günaydın Steakhouse (Bulvar)",
        cuisine=["Steakhouse", "Turkish"],
        city="Baku",
        address="Bulvar Mall",
        phone="+994 12 111 1111",
        photos=["https://picsum.photos/seed/gunaydin/800/500"],
        areas=[
            Area(
                name="Steak Hall",
                tables=[t("S1", 2, 180, 600), t("S2", 4, 260, 640), t("S3", 6, 360, 620)],
            ),
            Area(name="Window", tables=[t("W1", 2, 700, 650), t("W2", 2, 780, 660)]),
        ],
    )

    mari = Restaurant(
        name="Mari Vanna",
        cuisine=["Eastern European", "Russian"],
        city="Baku",
        address="Old City",
        phone="+994 12 222 2222",
        photos=["https://picsum.photos/seed/marivanna/800/500"],
        areas=[
            Area(name="Parlor", tables=[t("P1", 2, 240, 200), t("P2", 4, 340, 240)]),
            Area(name="Garden", tables=[t("G1", 2, 720, 300), t("G2", 4, 820, 320)]),
        ],
    )

    for r in (sahil, gunaydin, mari):
        DB.add_restaurant(r)

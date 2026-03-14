import random
import uuid
from datetime import datetime, timedelta
from data.card_registry import CARD_REGISTRY, OPERATORS

OUTLETS = [
    {"id": "IOCL-PUNE-NH48-0032",   "highway": "NH-48",  "lat": 18.52, "lng": 73.85},
    {"id": "IOCL-NAGP-NH44-0015",   "highway": "NH-44",  "lat": 21.14, "lng": 79.08},
    {"id": "IOCL-MUM-WEH-0071",     "highway": "WEH",    "lat": 19.07, "lng": 72.87},
    {"id": "IOCL-AURNG-NH752-0009", "highway": "NH-752", "lat": 19.87, "lng": 75.34},
    {"id": "IOCL-NASHK-NH160-0022", "highway": "NH-160", "lat": 19.99, "lng": 73.78},
]

DIESEL_RATE = 89.62


def generate_xtrapower_feed(days: int = 45) -> list:
    """
    Generates synthetic XTRAPOWER fuel transactions for all operators.
    Each card (vehicle) fuels every 1.5-3.5 days depending on archetype.

    Archetypes affect transaction patterns:
    - delayed_receivable: normal consistent burn throughout
    - demand_spike: burn rate increases sharply after day 15
    - route_contraction: vehicles go idle progressively after day 20

    Returns list of transactions sorted by timestamp ascending.
    """
    all_transactions = []
    start = datetime.now() - timedelta(days=days)

    for card_pan, card_data in CARD_REGISTRY.items():
        operator  = OPERATORS[card_data["operator_id"]]
        archetype = operator["archetype"]

        current  = start + timedelta(hours=random.uniform(0, 48))
        odometer = random.randint(80000, 200000)

        while current < datetime.now():
            days_elapsed = (current - start).days

            # Route contraction: vehicles go idle after day 20
            if archetype == "route_contraction" and days_elapsed > 20:
                if random.random() < 0.55:
                    current += timedelta(days=random.uniform(3, 7))
                    continue

            # Base fueling interval
            interval = random.uniform(1.5, 3.5)

            # Demand spike: more frequent fueling after day 15
            if archetype == "demand_spike" and days_elapsed > 15:
                interval = random.uniform(0.7, 1.6)

            litres   = round(random.uniform(150, 320), 1)
            odometer += random.randint(260, 540)

            route_outlets = [o for o in OUTLETS
                             if o["highway"] == card_data["route_primary"]]
            outlet = random.choice(route_outlets if route_outlets else OUTLETS)

            all_transactions.append({
                "transaction_id":  f"XTP-{uuid.uuid4().hex[:12].upper()}",
                "card_pan":        card_pan,
                "vehicle_id":      card_data["vehicle_id"],
                "driver_id":       card_data["driver_id"],
                "operator_id":     card_data["operator_id"],
                "timestamp":       current.isoformat(),
                "outlet_id":       outlet["id"],
                "highway":         outlet["highway"],
                "lat":             outlet["lat"],
                "lng":             outlet["lng"],
                "product":         "HSD",
                "litres":          litres,
                "rate_per_litre":  DIESEL_RATE,
                "amount":          round(litres * DIESEL_RATE, 2),
                "odometer_km":     odometer,
                "trip_id":         f"TRIP-2026-{random.randint(1000, 9999)}"
            })

            current += timedelta(days=interval)

    return sorted(all_transactions, key=lambda x: x["timestamp"])

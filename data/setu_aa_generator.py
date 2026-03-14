import random
import uuid
from datetime import datetime, timedelta
from data.card_registry import OPERATORS, CLIENT_PAYMENT_PROFILES


# Additional realistic transaction types for fleet operators
MISC_DEBITS = [
    {"narration": "SALARY TRANSFER - DRIVERS",       "range": (80000, 150000), "freq": 30},
    {"narration": "TOLL PLAZA FASTAG RECHARGE",       "range": (15000, 40000),  "freq": 7},
    {"narration": "VEHICLE INSURANCE PREMIUM",         "range": (25000, 60000),  "freq": 90},
    {"narration": "TYRE REPLACEMENT - APOLLO",         "range": (18000, 35000),  "freq": 20},
    {"narration": "VEHICLE SERVICE & MAINTENANCE",     "range": (12000, 28000),  "freq": 14},
    {"narration": "OFFICE RENT - TRANSPORT NAGAR",     "range": (35000, 55000),  "freq": 30},
    {"narration": "GST PAYMENT - CGST/SGST",          "range": (40000, 90000),  "freq": 30},
    {"narration": "EMI - VEHICLE LOAN HDFC BANK",     "range": (65000, 120000), "freq": 30},
    {"narration": "MOBILE RECHARGE BULK - DRIVERS",    "range": (3000, 8000),    "freq": 30},
    {"narration": "UREA/DEF FLUID PURCHASE",           "range": (8000, 15000),   "freq": 10},
]

MISC_CREDITS = [
    {"narration": "PENALTY RECOVERY - LATE DELIVERY",  "range": (5000, 15000),   "freq": 45},
    {"narration": "INSURANCE CLAIM SETTLEMENT",        "range": (30000, 80000),  "freq": 60},
    {"narration": "GST INPUT CREDIT REFUND",           "range": (20000, 50000),  "freq": 30},
]


def generate_setu_aa_feed(operator_id: str, days: int = 90) -> dict:
    """
    Generates synthetic Setu AA bank account data for one fleet operator.
    Mirrors the exact ReBIT AA v2.0 FI data schema for DEPOSIT type.

    Produces rich, realistic transaction history with:
    - Daily fuel spend (scaled to be realistic per-vehicle)
    - Freight payments with client-specific cycles and delays
    - Misc debits (salaries, tolls, maintenance, EMIs, insurance)
    - Misc credits (claim settlements, GST refunds)
    - Archetype-specific patterns that create distinct financial signatures

    Archetypes:
    - delayed_receivable: normal ops, Reliance pays 12d late, healthy but cash-tight
    - demand_spike: fuel burn grows, new contracts, payments haven't caught up
    - route_contraction: vehicles going idle, clients reducing contracts
    """
    operator  = OPERATORS[operator_id]
    archetype = operator["archetype"]
    clients   = operator["primary_clients"]

    transactions = []

    # Starting balance: realistic for a fleet operator
    # Calculate expected monthly revenue from clients to size the balance
    monthly_revenue = sum(
        CLIENT_PAYMENT_PROFILES[c]["amount"] * (30 / CLIENT_PAYMENT_PROFILES[c]["cycle_days"])
        for c in clients
    )
    # Fuel should be ~65% of revenue; derive per-vehicle cost from that
    # Healthy operators run leaner (fuel is ~55% of revenue)
    fuel_pct = 0.55 if archetype == "healthy" else 0.65
    target_daily_fuel = monthly_revenue * fuel_pct / 30
    per_vehicle_base = target_daily_fuel / operator["num_vehicles"]

    # Healthy operators are well-capitalized (~45-60 days cash)
    # Others have tighter cash (~12-18 days)
    if archetype == "healthy":
        balance = target_daily_fuel * random.uniform(45, 60)
    else:
        balance = target_daily_fuel * random.uniform(12, 18)

    start   = datetime.now() - timedelta(days=days)
    current = start

    # Track next payment dates per client (more realistic than modulo)
    next_payment = {}
    for client_name in clients:
        profile = CLIENT_PAYMENT_PROFILES[client_name]
        # First payment arrives within the first cycle
        first_day = profile["cycle_days"] + random.randint(-3, profile["avg_delay"])
        next_payment[client_name] = first_day

    while current < datetime.now():
        days_elapsed = (current - start).days
        day_transactions = []

        # --- Active vehicle count (archetype-driven) ---
        active_vehicles = operator["num_vehicles"]
        if archetype == "route_contraction" and days_elapsed > 25:
            drop_pct = min((days_elapsed - 25) / 65, 0.65)
            active_vehicles = max(8, int(operator["num_vehicles"] * (1 - drop_pct)))
        if archetype == "demand_spike" and days_elapsed > 15:
            ramp = min((days_elapsed - 15) / 30, 0.5)
            active_vehicles = int(operator["num_vehicles"] * (1 + ramp))

        # --- Daily fuel spend (main debit) ---
        # Per-vehicle daily fuel calibrated so total fuel = ~65% of revenue
        per_vehicle_fuel = per_vehicle_base * random.uniform(0.85, 1.15)
        daily_fuel = active_vehicles * per_vehicle_fuel

        # Demand spike: per-vehicle cost also increases (longer routes, more loads)
        if archetype == "demand_spike" and days_elapsed > 15:
            daily_fuel *= random.uniform(1.15, 1.35)

        balance -= daily_fuel
        day_transactions.append({
            "txnId":                str(uuid.uuid4()),
            "type":                 "DEBIT",
            "mode":                 "OTHERS",
            "amount":               round(daily_fuel, 2),
            "currentBalance":       round(balance, 2),
            "transactionTimestamp": current.isoformat(),
            "valueDate":            current.strftime("%Y-%m-%d"),
            "narration":            "IOCL XTRAPOWER FLEET FUEL",
            "reference":            f"XTP{random.randint(100000, 999999)}"
        })

        # --- Misc debits (salaries, tolls, maintenance, etc.) ---
        for misc in MISC_DEBITS:
            # Use a small random offset so not every operator pays on the same day
            offset = hash(operator_id + misc["narration"]) % 3
            if days_elapsed > 0 and (days_elapsed + offset) % misc["freq"] == 0:
                amount = random.uniform(*misc["range"])
                # Scale salary/EMI by fleet size relative to a 30-truck baseline
                if "SALARY" in misc["narration"] or "EMI" in misc["narration"]:
                    amount *= (operator["num_vehicles"] / 30)
                # Keep misc debits small relative to fuel (~10-15% of daily fuel)
                amount = min(amount, daily_fuel * 0.6)
                balance -= amount
                day_transactions.append({
                    "txnId":                str(uuid.uuid4()),
                    "type":                 "DEBIT",
                    "mode":                 "NEFT",
                    "amount":               round(amount, 2),
                    "currentBalance":       round(balance, 2),
                    "transactionTimestamp": (current + timedelta(hours=random.uniform(0, 8))).isoformat(),
                    "valueDate":            current.strftime("%Y-%m-%d"),
                    "narration":            misc["narration"],
                    "reference":            f"NEFT{random.randint(10000000, 99999999)}"
                })

        # --- Freight inflows: client-specific payment cycles ---
        for client_name in clients:
            profile = CLIENT_PAYMENT_PROFILES[client_name]

            if days_elapsed >= next_payment.get(client_name, 999):
                # Route contraction: increasing chance of missed/reduced payments
                if archetype == "route_contraction" and days_elapsed > 25:
                    skip_chance = 0.3 + min((days_elapsed - 25) / 100, 0.4)
                    if random.random() < skip_chance:
                        # Missed payment — reschedule further out
                        next_payment[client_name] = days_elapsed + profile["cycle_days"] + random.randint(10, 25)
                        continue
                    # Reduced payment amounts (getting worse over time)
                    reduction = 1 - min((days_elapsed - 25) / 80, 0.6)
                else:
                    reduction = 1.0

                amount = profile["amount"] * reduction * random.uniform(0.9, 1.1)

                # Demand spike: new contracts pay more
                if archetype == "demand_spike" and days_elapsed > 20:
                    amount *= random.uniform(1.2, 1.6)

                balance += amount
                day_transactions.append({
                    "txnId":                str(uuid.uuid4()),
                    "type":                 "CREDIT",
                    "mode":                 "NEFT",
                    "amount":               round(amount, 2),
                    "currentBalance":       round(balance, 2),
                    "transactionTimestamp": (current + timedelta(hours=random.uniform(10, 16))).isoformat(),
                    "valueDate":            current.strftime("%Y-%m-%d"),
                    "narration":            f"NEFT CR {client_name.upper()} FREIGHT PMT",
                    "reference":            f"NEFT{random.randint(10000000, 99999999)}"
                })

                # Schedule next payment
                if archetype == "healthy":
                    delay = random.randint(-1, 2)  # Always near on-time
                elif archetype == "delayed_receivable" and "Reliance" in client_name:
                    delay = profile["avg_delay"] + random.randint(2, 8)  # Reliance consistently late
                else:
                    delay = profile["avg_delay"] + random.randint(-3, 5)
                next_payment[client_name] = days_elapsed + profile["cycle_days"] + delay

        # --- Misc credits (claim settlements, GST refunds) ---
        for misc in MISC_CREDITS:
            if days_elapsed > 0 and days_elapsed % misc["freq"] == 0 and random.random() < 0.4:
                amount = random.uniform(*misc["range"])
                balance += amount
                day_transactions.append({
                    "txnId":                str(uuid.uuid4()),
                    "type":                 "CREDIT",
                    "mode":                 "NEFT",
                    "amount":               round(amount, 2),
                    "currentBalance":       round(balance, 2),
                    "transactionTimestamp": (current + timedelta(hours=random.uniform(10, 18))).isoformat(),
                    "valueDate":            current.strftime("%Y-%m-%d"),
                    "narration":            misc["narration"],
                    "reference":            f"NEFT{random.randint(10000000, 99999999)}"
                })

        # Sort this day's transactions by timestamp
        day_transactions.sort(key=lambda t: t["transactionTimestamp"])
        transactions.extend(day_transactions)

        current += timedelta(days=1)

    # --- Archetype-specific ending adjustments ---
    # For delayed_receivable: ensure the LAST Reliance payment is overdue
    # (makes the gap clearly a timing issue)
    if archetype == "delayed_receivable":
        # Remove any Reliance credit in the last 15 days to simulate the delay
        cutoff = (datetime.now() - timedelta(days=15)).isoformat()
        removed_amount = 0
        kept = []
        for t in transactions:
            if (t["type"] == "CREDIT" and "RELIANCE" in t["narration"]
                    and t["transactionTimestamp"] > cutoff):
                removed_amount += t["amount"]
            else:
                kept.append(t)
        transactions = kept
        balance -= removed_amount

    return {
        "ver":       "1.0",
        "timestamp": datetime.now().isoformat(),
        "consentId": str(uuid.uuid4()),
        "fipId":     f"{operator['bank']}-FIP",
        "accounts": [{
            "maskedAccNumber": operator["bank_account"],
            "linkRefNumber":   str(uuid.uuid4()),
            "depositSummary": {
                "currentBalance": round(balance, 2),
                "currency":       "INR"
            },
            "transactions": {"transaction": transactions}
        }]
    }

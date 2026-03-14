import random
import uuid
from datetime import datetime, timedelta
from data.card_registry import OPERATORS, CLIENT_PAYMENT_PROFILES


def generate_setu_aa_feed(operator_id: str, days: int = 90) -> dict:
    """
    Generates synthetic Setu AA bank account data for one fleet operator.
    Mirrors the exact ReBIT AA v2.0 FI data schema for DEPOSIT type.

    Outflows: daily fuel spend (consistent with XTRAPOWER burn)
    Inflows:  freight payments, client-specific cycle + delay patterns

    Archetypes:
    - delayed_receivable: normal ops, Reliance Logistics reliably pays 12d late
    - demand_spike: fuel burn grows after day 15, new contract inflows appear
    - route_contraction: active vehicles decline, clients reduce/drop contracts
    """
    operator  = OPERATORS[operator_id]
    archetype = operator["archetype"]
    clients   = operator["primary_clients"]

    transactions = []
    balance  = 500000.0
    start    = datetime.now() - timedelta(days=days)
    current  = start

    while current < datetime.now():
        days_elapsed = (current - start).days

        # --- Active vehicle count drives daily fuel outflow ---
        active_vehicles = operator["num_vehicles"]
        if archetype == "route_contraction" and days_elapsed > 20:
            active_vehicles = max(8, int(operator["num_vehicles"] *
                                         (1 - (days_elapsed - 20) / 100)))
        if archetype == "demand_spike" and days_elapsed > 15:
            active_vehicles = int(operator["num_vehicles"] * 1.4)

        daily_fuel = active_vehicles * random.uniform(3800, 5400)
        balance   -= daily_fuel

        transactions.append({
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

        # --- Freight inflows: client-specific patterns ---
        for client_name in clients:
            profile = CLIENT_PAYMENT_PROFILES[client_name]

            # Does a payment land today (accounting for delay)?
            due_day    = profile["cycle_days"]
            actual_day = due_day + profile["avg_delay"] + random.randint(-2, 2)

            if days_elapsed > 0 and days_elapsed % actual_day == 0:

                # Route contraction: clients reducing or dropping
                if archetype == "route_contraction" and days_elapsed > 30:
                    if random.random() < 0.45:
                        continue

                amount = profile["amount"]
                # Demand spike: growing contract values
                if archetype == "demand_spike" and days_elapsed > 15:
                    amount = int(amount * random.uniform(1.3, 1.9))

                balance += amount
                transactions.append({
                    "txnId":                str(uuid.uuid4()),
                    "type":                 "CREDIT",
                    "mode":                 "NEFT",
                    "amount":               amount,
                    "currentBalance":       round(balance, 2),
                    "transactionTimestamp": current.isoformat(),
                    "valueDate":            current.strftime("%Y-%m-%d"),
                    "narration":            f"NEFT CR {client_name.upper()} FREIGHT PMT",
                    "reference":            f"NEFT{random.randint(10000000, 99999999)}"
                })

        current += timedelta(days=1)

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

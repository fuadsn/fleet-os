# Every XTRAPOWER card maps to exactly one vehicle.
# The card PAN is the primary key that joins fuel transactions
# to vehicle identity, route, driver, and operator.

OPERATORS = {
    # ── DELAYED RECEIVABLE (Tier 1 — auto-disburse) ──────────────
    "OP-SHARMA-001": {
        "name": "Sharma Logistics",
        "num_vehicles": 40,
        "archetype": "delayed_receivable",
        # Reliance pays 12 days late. Business is healthy.
        # Agent: gap → delayed receivable → Tier 1 auto-disburse
        "primary_clients": ["Reliance Logistics", "Tata Motors Dispatch"],
        "bank_account": "XXXXXXXX4821",
        "bank": "HDFC"
    },
    "OP-PATEL-004": {
        "name": "Patel Roadways",
        "num_vehicles": 55,
        "archetype": "delayed_receivable",
        # Large, well-established fleet. Two reliable clients.
        # Tata pays on time, but Reliance always late.
        # Agent: gap → delayed receivable → Tier 1 auto-disburse
        "primary_clients": ["Reliance Logistics", "Tata Motors Dispatch"],
        "bank_account": "XXXXXXXX3156",
        "bank": "HDFC"
    },

    # ── DEMAND SPIKE (Tier 2 — human review) ─────────────────────
    "OP-VERMA-002": {
        "name": "Verma Transport",
        "num_vehicles": 22,
        "archetype": "demand_spike",
        # New Flipkart + Amazon contracts. Fuel burn up sharply.
        # Good risk but newer operator — needs human verification.
        # Agent: gap → demand spike → Tier 2 human review
        "primary_clients": ["Flipkart Supply Chain", "Amazon Logistics"],
        "bank_account": "XXXXXXXX7734",
        "bank": "ICICI"
    },
    "OP-KHAN-005": {
        "name": "Khan Brothers Freight",
        "num_vehicles": 18,
        "archetype": "demand_spike",
        # Small fleet, just landed a big Flipkart contract.
        # Revenue ramping up but fuel costs hit first.
        # Agent: gap → demand spike → Tier 2 human review
        "primary_clients": ["Flipkart Supply Chain"],
        "bank_account": "XXXXXXXX8901",
        "bank": "AXIS"
    },

    # ── ROUTE CONTRACTION (Tier 3 — no credit) ──────────────────
    "OP-GUPTA-003": {
        "name": "Gupta Fleet Services",
        "num_vehicles": 31,
        "archetype": "route_contraction",
        # Losing Maersk contract. Vehicles going idle.
        # Agent: gap → route contraction → Tier 3 withhold credit
        "primary_clients": ["Maersk India"],
        "bank_account": "XXXXXXXX2209",
        "bank": "SBI"
    },
    "OP-REDDY-006": {
        "name": "Reddy Cargo Movers",
        "num_vehicles": 26,
        "archetype": "route_contraction",
        # Was running Amazon routes, volumes dropping.
        # Fleet utilization falling week over week.
        # Agent: gap → route contraction → Tier 3 withhold credit
        "primary_clients": ["Amazon Logistics", "Maersk India"],
        "bank_account": "XXXXXXXX5543",
        "bank": "BOB"
    },

    # ── HEALTHY (No gap — no action needed) ──────────────────────
    "OP-SINGH-007": {
        "name": "Singh Express Lines",
        "num_vehicles": 48,
        "archetype": "healthy",
        # Large, well-capitalized fleet. Multiple reliable clients.
        # Payments arrive on time. No cash gap.
        # Agent: no gap → no action
        "primary_clients": ["Tata Motors Dispatch", "Amazon Logistics"],
        "bank_account": "XXXXXXXX1290",
        "bank": "KOTAK"
    },
    "OP-JOSHI-008": {
        "name": "Joshi Haulage",
        "num_vehicles": 15,
        "archetype": "healthy",
        # Small but profitable. Single reliable client.
        # Tight margins but never misses a payment cycle.
        # Agent: no gap → no action
        "primary_clients": ["Maersk India"],
        "bank_account": "XXXXXXXX6677",
        "bank": "PNB"
    },
}

# Generate card registry: each vehicle gets one dedicated card
# Card PAN format mirrors real XTRAPOWER cards: starts with 7116910
CARD_REGISTRY = {}
card_counter = 533170

for op_id, op_data in OPERATORS.items():
    for i in range(op_data["num_vehicles"]):
        pan = f"711691{str(card_counter).zfill(10)}"
        vehicle_num = 4421 + (card_counter - 533170)
        CARD_REGISTRY[pan] = {
            "vehicle_id":     f"MH12AB{vehicle_num}",
            "vehicle_type":   "HCV",
            "tank_capacity":  400,
            "driver_id":      f"DRV-{300 + card_counter - 533170:03d}",
            "route_primary":  ["NH-48", "NH-44", "WEH", "NH-752"][i % 4],
            "operator_id":    op_id
        }
        card_counter += 1

CLIENT_PAYMENT_PROFILES = {
    "Reliance Logistics":     {"cycle_days": 21, "avg_delay": 12, "reliability": 0.95, "amount": 520000},
    "Tata Motors Dispatch":   {"cycle_days": 14, "avg_delay":  3, "reliability": 0.98, "amount": 340000},
    "Maersk India":           {"cycle_days": 18, "avg_delay":  0, "reliability": 0.99, "amount": 380000},
    "Flipkart Supply Chain":  {"cycle_days": 10, "avg_delay":  5, "reliability": 0.97, "amount": 220000},
    "Amazon Logistics":       {"cycle_days": 10, "avg_delay":  2, "reliability": 0.99, "amount": 190000},
}

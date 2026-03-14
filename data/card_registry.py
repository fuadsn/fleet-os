# Every XTRAPOWER card maps to exactly one vehicle.
# The card PAN is the primary key that joins fuel transactions
# to vehicle identity, route, driver, and operator.

OPERATORS = {
    "OP-SHARMA-001": {
        "name": "Sharma Logistics",
        "num_vehicles": 40,
        "archetype": "delayed_receivable",
        # Cash gap caused by Reliance Logistics paying 12 days late.
        # Business is healthy. Gap is a timing problem, not distress.
        # Agent should: detect gap -> diagnose delayed receivable ->
        #               Tier 1 auto-disburse (high confidence)
        "primary_clients": ["Reliance Logistics", "Tata Motors Dispatch"],
        "bank_account": "XXXXXXXX4821",
        "bank": "HDFC"
    },
    "OP-VERMA-002": {
        "name": "Verma Transport",
        "num_vehicles": 22,
        "archetype": "demand_spike",
        # New contracts came in 2 weeks ago. Fuel burn up 3x.
        # Good risk, but operator history < 6 months in system.
        # Agent should: detect gap -> diagnose demand spike ->
        #               Tier 2 human review (medium confidence, new operator)
        "primary_clients": ["Flipkart Supply Chain", "Amazon Logistics"],
        "bank_account": "XXXXXXXX7734",
        "bank": "ICICI"
    },
    "OP-GUPTA-003": {
        "name": "Gupta Fleet Services",
        "num_vehicles": 31,
        "archetype": "route_contraction",
        # Losing contracts. Vehicles going idle week over week.
        # Lending here accelerates the problem.
        # Agent should: detect gap -> diagnose route contraction ->
        #               Tier 3 no credit, health alert only
        "primary_clients": ["Maersk India"],
        "bank_account": "XXXXXXXX2209",
        "bank": "SBI"
    }
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
    "Reliance Logistics":     {"cycle_days": 45, "avg_delay": 12, "reliability": 0.95, "amount": 480000},
    "Tata Motors Dispatch":   {"cycle_days": 30, "avg_delay":  3, "reliability": 0.98, "amount": 320000},
    "Maersk India":           {"cycle_days": 30, "avg_delay":  0, "reliability": 0.99, "amount": 280000},
    "Flipkart Supply Chain":  {"cycle_days": 15, "avg_delay":  5, "reliability": 0.97, "amount": 180000},
    "Amazon Logistics":       {"cycle_days": 15, "avg_delay":  2, "reliability": 0.99, "amount": 160000},
}

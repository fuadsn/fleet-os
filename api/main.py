import json
import os
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from agent.orchestrator import run_fleet_agent
from agent.gap_detector import detect_gap

app = FastAPI(title="Fleet Treasury OS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load pre-generated mock data at startup
def load_mock():
    from data.card_registry import OPERATORS
    with open("data/mock/xtrapower_feed.json") as f:
        xtrapower = json.load(f)
    setu = {}
    for op_id in OPERATORS:
        name_slug = op_id.split('-')[1].lower()
        fname = f"data/mock/setu_{name_slug}.json"
        with open(fname) as f:
            setu[op_id] = json.load(f)
    return xtrapower, setu

xtrapower_feed, setu_feeds = load_mock()

# In-memory state (fine for hackathon)
audit_store   = {}
officer_queue = []
activity_log  = []   # chronological log of all agent runs


# --- Endpoints ---

@app.get("/")
def root():
    return {"status": "Fleet Treasury OS running",
            "operators": list(setu_feeds.keys())}


@app.get("/fleet/{operator_id}/briefing")
def get_briefing(operator_id: str):
    """Returns current cash position snapshot. No LLM. Fast."""
    return detect_gap(operator_id, xtrapower_feed, setu_feeds[operator_id])


@app.get("/fleet/{operator_id}/detail")
def get_detail(operator_id: str):
    """Returns full operator profile, bank transactions, and fuel summary."""
    from data.card_registry import OPERATORS, CARD_REGISTRY, CLIENT_PAYMENT_PROFILES

    op = OPERATORS.get(operator_id)
    if not op:
        return {"error": "operator_not_found"}

    # Bank transactions (last 30 items)
    setu = setu_feeds.get(operator_id, {})
    all_txns = setu.get("accounts", [{}])[0].get("transactions", {}).get("transaction", [])
    recent_bank = all_txns[-40:]

    # Fuel transactions for this operator
    op_fuel = [t for t in xtrapower_feed if t["operator_id"] == operator_id]

    # Vehicle summary
    vehicles = [v for v in CARD_REGISTRY.values() if v["operator_id"] == operator_id]
    routes = {}
    for v in vehicles:
        r = v["route_primary"]
        routes[r] = routes.get(r, 0) + 1

    # Client payment info
    client_info = []
    for client_name in op["primary_clients"]:
        profile = CLIENT_PAYMENT_PROFILES.get(client_name, {})
        # Count recent payments from this client
        client_payments = [t for t in all_txns
                          if t["type"] == "CREDIT" and client_name.upper() in t.get("narration", "").upper()]
        client_info.append({
            "name": client_name,
            "cycle_days": profile.get("cycle_days"),
            "avg_delay": profile.get("avg_delay"),
            "reliability": profile.get("reliability"),
            "expected_amount": profile.get("amount"),
            "payments_received": len(client_payments),
            "total_received": sum(p["amount"] for p in client_payments),
        })

    # Daily fuel spend aggregation (last 14 days)
    from datetime import datetime, timedelta
    cutoff_14d = (datetime.now() - timedelta(days=14)).isoformat()
    recent_fuel = [t for t in op_fuel if t["timestamp"] > cutoff_14d]
    daily_fuel = {}
    for t in recent_fuel:
        day = t["timestamp"][:10]
        daily_fuel[day] = daily_fuel.get(day, 0) + t["amount"]

    return {
        "operator_id": operator_id,
        "name": op["name"],
        "num_vehicles": op["num_vehicles"],
        "archetype": op["archetype"],
        "bank": op["bank"],
        "bank_account": op["bank_account"],
        "primary_clients": op["primary_clients"],
        "client_details": client_info,
        "route_distribution": routes,
        "recent_bank_transactions": recent_bank,
        "fuel_transactions_count": len(op_fuel),
        "daily_fuel_last_14d": daily_fuel,
        "total_vehicles_registered": len(vehicles),
    }


@app.post("/fleet/{operator_id}/run")
def run_agent(operator_id: str):
    """
    Runs the full agent loop for one operator:
    gap detection -> diagnosis -> credit decision
    Returns outcome + full audit log for this run.
    """
    run_start = datetime.now()
    result = run_fleet_agent(operator_id, xtrapower_feed, setu_feeds[operator_id])
    run_end = datetime.now()

    audit_store[operator_id] = result.get("audit_log", [])

    if result.get("outcome", {}).get("status") == "pending_approval":
        offer = result.get("offer")
        if offer and offer not in officer_queue:
            officer_queue.append(offer)

    # Record detailed activity log entry
    gap = result.get("gap_result", {})
    diag = result.get("diagnosis", {})
    offer_data = result.get("offer", {})
    outcome = result.get("outcome", {})

    from data.card_registry import OPERATORS
    op_name = OPERATORS.get(operator_id, {}).get("name", operator_id)

    steps = []
    steps.append({
        "agent": "gap_detector",
        "action": "Gap detected" if gap.get("gap_detected") else "No gap found",
        "detail": f"Balance: ₹{gap.get('current_balance', 0):,.0f} | Burn: ₹{gap.get('daily_burn_rate', 0):,.0f}/day" if gap else None,
    })
    if diag:
        steps.append({
            "agent": "diagnosis_agent",
            "action": f"Classified as {diag.get('cause', 'unknown')}",
            "detail": f"Confidence: {(diag.get('confidence', 0) * 100):.0f}% | Tier {diag.get('recommended_tier', '?')}",
        })
    if offer_data:
        steps.append({
            "agent": "credit_agent",
            "action": f"Offer ₹{offer_data.get('amount', 0):,.0f} for {offer_data.get('tenor_days', 0)} days",
            "detail": f"Cost: ₹{offer_data.get('total_cost', 0):,.0f} | Pine Labs spread: ₹{offer_data.get('pine_spread', 0):,.0f}",
        })
    steps.append({
        "agent": "orchestrator",
        "action": outcome.get("status", "unknown"),
        "detail": f"TXN: {outcome.get('txn_id')}" if outcome.get("txn_id") else None,
    })

    activity_log.append({
        "id": f"RUN-{len(activity_log) + 1:03d}",
        "operator_id": operator_id,
        "operator_name": op_name,
        "timestamp": run_start.isoformat(),
        "duration_ms": int((run_end - run_start).total_seconds() * 1000),
        "gap_detected": gap.get("gap_detected", False) if gap else False,
        "cause": diag.get("cause") if diag else None,
        "confidence": diag.get("confidence") if diag else None,
        "tier": diag.get("recommended_tier") if diag else None,
        "outcome": outcome.get("status") if outcome else "unknown",
        "offer_amount": offer_data.get("amount") if offer_data else None,
        "steps": steps,
    })

    return {
        "operator_id": operator_id,
        "outcome":     outcome,
        "gap_result":  gap,
        "diagnosis":   diag,
        "offer":       offer_data,
    }


@app.get("/fleet/{operator_id}/audit")
def get_audit(operator_id: str):
    return audit_store.get(operator_id, [])


@app.get("/activity")
def get_activity():
    """Returns all agent run logs, newest first."""
    return list(reversed(activity_log))


@app.get("/officer/queue")
def get_queue():
    return officer_queue


class ApprovalRequest(BaseModel):
    modified_amount: Optional[float] = None
    officer_note:    Optional[str]   = None


@app.post("/officer/approve/{offer_id}")
def approve_offer(offer_id: str, req: ApprovalRequest = ApprovalRequest()):
    offer = next((o for o in officer_queue if o["offer_id"] == offer_id), None)
    if not offer:
        return {"error": "offer_not_found"}

    if req.modified_amount:
        offer["amount"]         = req.modified_amount
        offer["human_modified"] = True
        offer["officer_note"]   = req.officer_note

    offer["status"] = "disbursed"
    offer["txn_id"] = f"PL-APPROVED-{offer_id}"
    officer_queue.remove(offer)

    # Update the activity log entry for this operator
    for entry in activity_log:
        if entry["operator_id"] == offer.get("operator_id") and entry["outcome"] == "pending_approval":
            entry["outcome"] = "disbursed"
            entry["steps"].append({
                "agent": "officer",
                "action": f"Approved by officer — TXN: {offer['txn_id']}",
                "detail": f"Amount: ₹{offer['amount']:,.0f}",
            })
            break

    return {"status": "disbursed", "offer": offer}


@app.post("/officer/reject/{offer_id}")
def reject_offer(offer_id: str):
    offer = next((o for o in officer_queue if o["offer_id"] == offer_id), None)
    if not offer:
        return {"error": "offer_not_found"}
    offer["status"] = "rejected"
    officer_queue.remove(offer)

    # Update activity log
    for entry in activity_log:
        if entry["operator_id"] == offer.get("operator_id") and entry["outcome"] == "pending_approval":
            entry["outcome"] = "rejected"
            entry["steps"].append({
                "agent": "officer",
                "action": "Rejected by officer",
                "detail": None,
            })
            break

    return {"status": "rejected", "offer_id": offer_id}

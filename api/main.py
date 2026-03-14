import json
import os
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
    with open("data/mock/xtrapower_feed.json") as f:
        xtrapower = json.load(f)
    setu = {}
    for op_id, fname in [
        ("OP-SHARMA-001", "data/mock/setu_sharma.json"),
        ("OP-VERMA-002",  "data/mock/setu_verma.json"),
        ("OP-GUPTA-003",  "data/mock/setu_gupta.json"),
    ]:
        with open(fname) as f:
            setu[op_id] = json.load(f)
    return xtrapower, setu

xtrapower_feed, setu_feeds = load_mock()

# In-memory state (fine for hackathon)
audit_store  = {}
officer_queue = []


# --- Endpoints ---

@app.get("/")
def root():
    return {"status": "Fleet Treasury OS running",
            "operators": list(setu_feeds.keys())}


@app.get("/fleet/{operator_id}/briefing")
def get_briefing(operator_id: str):
    """Returns current cash position snapshot. No LLM. Fast."""
    return detect_gap(operator_id, xtrapower_feed, setu_feeds[operator_id])


@app.post("/fleet/{operator_id}/run")
def run_agent(operator_id: str):
    """
    Runs the full agent loop for one operator:
    gap detection -> diagnosis -> credit decision
    Returns outcome + full audit log for this run.
    """
    result = run_fleet_agent(operator_id, xtrapower_feed, setu_feeds[operator_id])

    audit_store[operator_id] = result.get("audit_log", [])

    if result.get("outcome", {}).get("status") == "pending_approval":
        offer = result.get("offer")
        if offer and offer not in officer_queue:
            officer_queue.append(offer)

    return {
        "operator_id": operator_id,
        "outcome":     result.get("outcome"),
        "gap_result":  result.get("gap_result"),
        "diagnosis":   result.get("diagnosis"),
        "offer":       result.get("offer"),
    }


@app.get("/fleet/{operator_id}/audit")
def get_audit(operator_id: str):
    return audit_store.get(operator_id, [])


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

    return {"status": "disbursed", "offer": offer}


@app.post("/officer/reject/{offer_id}")
def reject_offer(offer_id: str):
    offer = next((o for o in officer_queue if o["offer_id"] == offer_id), None)
    if not offer:
        return {"error": "offer_not_found"}
    offer["status"] = "rejected"
    officer_queue.remove(offer)
    return {"status": "rejected", "offer_id": offer_id}

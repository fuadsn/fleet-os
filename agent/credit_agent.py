import uuid
from datetime import datetime

DAILY_RATE      = 0.00038   # ~14% annualized
AUTO_LIMIT      = 5000000   # Rs.50L ceiling for auto-disburse
NBFC_RATE       = 0.00027   # Pine Labs' cost of funds (~10% annualized)


def generate_offer(gap_result: dict, diagnosis) -> dict:
    """
    Generates a credit offer calibrated to the exact gap.
    Amount = projected deficit (not a round number).
    Tenor  = days until next inflow + 3 day buffer.
    """
    amount     = round(gap_result["projected_deficit"], -2)  # round to nearest Rs.100
    tenor_days = max(int(gap_result["days_to_next_inflow"]) + 3, 7)
    total_cost = round(amount * DAILY_RATE * tenor_days, 2)
    pine_spread = round(amount * (DAILY_RATE - NBFC_RATE) * tenor_days, 2)

    return {
        "offer_id":      f"OFR-{uuid.uuid4().hex[:8].upper()}",
        "operator_id":   gap_result["operator_id"],
        "amount":        amount,
        "tenor_days":    tenor_days,
        "daily_rate":    DAILY_RATE,
        "total_cost":    total_cost,
        "pine_spread":   pine_spread,       # Pine Labs revenue on this offer
        "cause":         diagnosis.cause,
        "confidence":    diagnosis.confidence,
        "evidence":      diagnosis.evidence,
        "reasoning":     diagnosis.reasoning,
        "tier":          diagnosis.recommended_tier,
        "generated_at":  datetime.now().isoformat(),
        "status":        "pending",
        "txn_id":        None,
        "human_modified": False
    }


def mock_plural_payout(offer: dict) -> str:
    """
    In production: POST to Pine Labs Plural Payouts API.
    Returns mock transaction ID in Plural format.
    """
    return f"PL-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"


def execute_tier(offer: dict, audit_log: list) -> dict:
    """
    Tier 1: amount <= AUTO_LIMIT and confidence > 0.85 -> auto-disburse
    Tier 2: queue for officer review
    Tier 3: withhold credit, log health alert
    """
    tier = offer["tier"]

    if tier == 3:
        record = {**offer, "action": "withheld",
                  "reason": f"cause={offer['cause']}, confidence={offer['confidence']:.2f}"}
        audit_log.append(record)
        return {"status": "withheld", "offer": offer,
                "alert": "health_flag_raised"}

    # Tier 1 and Tier 2 -> human review (officer approves, then Plural disburses)
    offer["status"] = "pending_approval"
    audit_log.append({**offer, "action": "queued_for_review",
                      "queued_at": datetime.now().isoformat()})
    return {"status": "pending_approval", "offer": offer}

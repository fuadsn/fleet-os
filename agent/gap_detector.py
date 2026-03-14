import pandas as pd
from datetime import datetime, timedelta


def detect_gap(operator_id: str, xtrapower_feed: list, setu_feed: dict) -> dict:
    """
    Pure deterministic cash flow gap detection. No LLM.

    Takes XTRAPOWER fuel transactions + Setu AA bank data for one operator.
    Returns:
      - current balance
      - daily burn rate (7-day rolling average)
      - active vehicle count (unique cards transacting in last 3 days)
      - days until projected zero balance
      - projected deficit amount
      - gap_detected boolean
      - projected gap date
    """
    # --- Burn rate from XTRAPOWER card transactions ---
    op_txns = [t for t in xtrapower_feed if t["operator_id"] == operator_id]

    if not op_txns:
        return {"error": "no_xtrapower_data", "gap_detected": False}

    df = pd.DataFrame(op_txns)
    df["date"] = pd.to_datetime(df["timestamp"]).dt.date

    daily_spend = df.groupby("date")["amount"].sum()
    burn_rate   = float(daily_spend.tail(7).mean())

    # Active vehicles: unique card PANs that transacted in last 3 days
    cutoff        = datetime.now() - timedelta(days=3)
    recent        = df[pd.to_datetime(df["timestamp"]) > cutoff]
    active_vehicles = int(recent["card_pan"].nunique())

    # --- Cash position from Setu AA ---
    bank_txns   = setu_feed["accounts"][0]["transactions"]["transaction"]
    current_bal = float(setu_feed["accounts"][0]["depositSummary"]["currentBalance"])

    # Estimate next inflow: average cycle between historical credits
    credits = sorted(
        [t for t in bank_txns if t["type"] == "CREDIT"],
        key=lambda x: x["transactionTimestamp"]
    )

    if len(credits) >= 2:
        credit_dates = [datetime.fromisoformat(c["transactionTimestamp"])
                        for c in credits]
        gaps = [(credit_dates[i+1] - credit_dates[i]).days
                for i in range(len(credit_dates) - 1)]
        avg_cycle          = sum(gaps) / len(gaps) if gaps else 30.0
        last_credit_date   = credit_dates[-1]
        days_since_last    = (datetime.now() - last_credit_date).days
        days_to_inflow     = max(avg_cycle - days_since_last, 1)
        recent_credit_amounts = [c["amount"] for c in credits[-4:]]
        next_inflow_amount = sum(recent_credit_amounts) / len(recent_credit_amounts)
    elif len(credits) == 1:
        last_credit_date   = datetime.fromisoformat(credits[0]["transactionTimestamp"])
        days_since_last    = (datetime.now() - last_credit_date).days
        days_to_inflow     = max(30 - days_since_last, 1)
        next_inflow_amount = credits[0]["amount"]
    else:
        days_to_inflow    = 30.0
        next_inflow_amount = 0.0

    # Core gap calculation
    projected_spend   = burn_rate * days_to_inflow
    projected_deficit = projected_spend - current_bal

    # Gap is detected only if:
    # 1. There's a projected deficit, AND
    # 2. Current balance can't cover at least 7 days of burn
    #    (operators with 7+ days of runway are considered healthy)
    days_of_runway = current_bal / burn_rate if burn_rate > 0 and current_bal > 0 else -1
    gap_detected = projected_deficit > 0 and days_of_runway < 5

    gap_date = None
    if gap_detected and burn_rate > 0:
        days_until_zero = current_bal / burn_rate
        gap_date = (datetime.now() + timedelta(days=days_until_zero)).strftime("%Y-%m-%d")

    return {
        "operator_id":          operator_id,
        "current_balance":      round(current_bal, 2),
        "daily_burn_rate":      round(burn_rate, 2),
        "active_vehicles":      active_vehicles,
        "days_to_next_inflow":  round(days_to_inflow, 1),
        "next_inflow_amount":   round(next_inflow_amount, 2),
        "projected_spend":      round(projected_spend, 2),
        "projected_deficit":    round(projected_deficit, 2),
        "gap_detected":         gap_detected,
        "gap_date":             gap_date,
    }

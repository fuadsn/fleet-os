"""
DIAGNOSIS AGENT — LLM-powered causal classification
=====================================================

THIS FILE NEEDS YOUR WORK (Person 1 — Agent Core)

This agent takes a detected cash gap and classifies WHY it's happening
using Claude with structured output via the `instructor` library.

WHAT TO IMPLEMENT:
1. The `diagnose_gap()` function that calls Claude via instructor
2. The prompt that gives Claude the gap data + classification rules
3. Structured output that returns a validated DiagnosisResult

HOW IT WORKS:
- instructor wraps the Anthropic client to return Pydantic models
- You send a prompt with all the gap data + classification rules
- Claude returns a DiagnosisResult with cause, confidence, evidence, tier, reasoning
- The result is used by credit_agent.py to decide what to do

SETUP:
  pip install instructor anthropic
  Make sure ANTHROPIC_API_KEY is in your .env

KEY REFERENCES:
  - instructor docs: https://python.useinstructor.com/
  - Anthropic client: https://docs.anthropic.com/en/docs/client-sdks/python

TIER ASSIGNMENT RULES (the LLM must follow these):
  Tier 1: confidence > 0.85 AND cause == delayed_receivable -> auto-disburse
  Tier 2: confidence 0.65-0.85 OR cause == demand_spike -> human review
  Tier 3: cause == route_contraction OR confidence < 0.65 -> no credit
"""

import os
import anthropic
import instructor
from pydantic import BaseModel
from enum import Enum
from typing import List
from datetime import datetime, timedelta
import pandas as pd
from dotenv import load_dotenv

load_dotenv()


class GapCause(str, Enum):
    DELAYED_RECEIVABLE = "delayed_receivable"
    DEMAND_SPIKE       = "demand_spike"
    ROUTE_CONTRACTION  = "route_contraction"
    INSUFFICIENT_DATA  = "insufficient_data"


class DiagnosisResult(BaseModel):
    cause:            GapCause
    confidence:       float        # 0.0 to 1.0
    evidence:         List[str]    # 2-4 specific observations from data
    recommended_tier: int          # 1, 2, or 3
    reasoning:        str          # one paragraph, readable by credit officer


# Initialize the instructor-wrapped Anthropic Bedrock client
# Uses standard AWS IAM credentials (access key + secret + session token)
bedrock_client = anthropic.AnthropicBedrock(
    aws_access_key=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
    aws_region=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
)
client = instructor.from_anthropic(bedrock_client)


def diagnose_gap(gap_result: dict, xtrapower_feed: list, setu_feed: dict) -> DiagnosisResult:
    """
    LLM-powered causal diagnosis of why a cash gap is occurring.
    Uses structured output — returns a validated Pydantic model, never freeform text.

    TODO — Implement these steps:

    STEP 1: Compute vehicle activity trend
      - Filter xtrapower_feed for this operator
      - Count unique card_pan values in last 7 days vs prior 7 days
      - Determine trend: INCREASING / STABLE / DECREASING

    STEP 2: Extract recent credit history from Setu AA
      - Get last 10 CREDIT transactions from the bank feed
      - Format as list of {amount, date, from} dicts

    STEP 3: Calculate operator history length
      - Find earliest transaction timestamp in xtrapower_feed for this operator
      - Compute days from earliest to now

    STEP 4: Build the prompt
      - Include: gap summary numbers, vehicle trend, credit history, history length
      - Include the classification rules (DELAYED_RECEIVABLE, DEMAND_SPIKE,
        ROUTE_CONTRACTION, INSUFFICIENT_DATA) with tier mapping
      - Tell Claude to cite specific numbers as evidence

    STEP 5: Call Claude via instructor
      result = client.messages.create(
          model="claude-sonnet-4-20250514",
          max_tokens=1024,
          messages=[{"role": "user", "content": prompt}],
          response_model=DiagnosisResult
      )

    STEP 6: Return the DiagnosisResult
    """
    # --- STEP 1: Vehicle activity trend ---
    op_id   = gap_result["operator_id"]
    op_txns = [t for t in xtrapower_feed if t["operator_id"] == op_id]

    df = pd.DataFrame(op_txns)
    df["ts"] = pd.to_datetime(df["timestamp"])
    last_week  = int(df[df["ts"] > datetime.now() - timedelta(days=7)]["card_pan"].nunique())
    prior_week = int(df[(df["ts"] > datetime.now() - timedelta(days=14)) &
                        (df["ts"] <= datetime.now() - timedelta(days=7))]["card_pan"].nunique())

    trend_str = ("INCREASING" if last_week > prior_week else
                 "STABLE"     if last_week == prior_week else "DECREASING")

    # --- STEP 2: Recent credit history ---
    bank_txns      = setu_feed["accounts"][0]["transactions"]["transaction"]
    recent_credits = [t for t in bank_txns if t["type"] == "CREDIT"][-10:]
    credit_summary = [{"amount": c["amount"],
                       "date":   c["valueDate"],
                       "from":   c["narration"]} for c in recent_credits]

    # --- STEP 3: Operator history length ---
    if op_txns:
        earliest = min(datetime.fromisoformat(t["timestamp"]) for t in op_txns)
        history_days = (datetime.now() - earliest).days
    else:
        history_days = 0

    # --- STEP 4: Build prompt ---
    # TODO: Construct the full prompt string here.
    # See the module docstring for classification rules.
    # The prompt should include all the data computed above
    # plus the tier assignment rules.
    prompt = f"""You are a credit analyst for Fleet Treasury OS, a working capital
product for Indian fleet operators built on Pine Labs' XTRAPOWER fuel data.

A cash flow gap has been detected. Diagnose the root cause.

GAP SUMMARY:
- Operator: {op_id}
- Current bank balance: Rs.{gap_result['current_balance']:,.0f}
- Daily fuel burn rate: Rs.{gap_result['daily_burn_rate']:,.0f}/day
- Projected deficit: Rs.{gap_result['projected_deficit']:,.0f}
- Days until zero balance: {gap_result['days_to_next_inflow']:.0f} days
- Operator history in system: {history_days} days

XTRAPOWER VEHICLE ACTIVITY:
- Active vehicles last 7 days: {last_week}
- Active vehicles prior 7 days: {prior_week}
- Trend: {trend_str}

LAST 10 FREIGHT INFLOWS (Setu AA):
{credit_summary}

CLASSIFICATION RULES — follow these exactly:

DELAYED_RECEIVABLE:
  Vehicle activity stable or slightly variable.
  Inflows exist historically but latest is overdue by 5+ days.
  Business is healthy. Gap is a timing mismatch.
  -> recommended_tier: 1 if confidence > 0.85, else 2

DEMAND_SPIKE:
  Vehicle activity sharply increasing (last week >> prior week).
  Fuel burn rising but inflows haven't caught up yet (new contracts).
  Good risk, may be new to system.
  -> recommended_tier: 2 always (needs human verification)

ROUTE_CONTRACTION:
  Vehicle activity declining week over week.
  Inflow frequency or amounts declining.
  Business losing contracts. Do NOT offer credit.
  -> recommended_tier: 3 always

INSUFFICIENT_DATA:
  History < 30 days OR fewer than 3 credit transactions.
  Cannot classify reliably.
  -> recommended_tier: 3

Confidence reflects how clearly the pattern matches one cause.
Evidence should cite specific numbers from the data above.
"""

    # --- STEP 5: Call Claude via instructor ---
    result = client.messages.create(
        model          = "us.anthropic.claude-sonnet-4-20250514-v1:0",
        max_tokens     = 1024,
        messages       = [{"role": "user", "content": prompt}],
        response_model = DiagnosisResult
    )

    return result

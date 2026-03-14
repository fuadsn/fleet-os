"""
ORCHESTRATOR — LangGraph state machine wiring all agents
=========================================================

THIS FILE NEEDS YOUR WORK (Person 1 — Agent Core)

This wires gap_detector -> diagnosis_agent -> credit_agent into a
single LangGraph state machine with conditional routing.

WHAT TO IMPLEMENT:
1. The FleetState TypedDict (shared state schema)
2. Four node functions (detect_gap, diagnose, credit_decision, no_action)
3. A conditional edge that routes based on whether a gap was detected
4. The compiled graph + run_fleet_agent() entry point

HOW LANGGRAPH WORKS:
  - StateGraph takes a TypedDict as its state schema
  - You add nodes (functions that receive state, return updated state)
  - You add edges (node A -> node B) and conditional edges (node A -> B or C)
  - builder.compile() gives you a runnable graph
  - graph.invoke(initial_state) runs the full pipeline

THE FLOW:
  detect_gap
      |
      +-- gap_detected=True  --> diagnose --> credit_decision --> END
      |
      +-- gap_detected=False --> no_action --> END

KEY REFERENCES:
  - LangGraph docs: https://langchain-ai.github.io/langgraph/
  - StateGraph API: langgraph.graph.StateGraph

NOTES:
  - diagnosis_agent.diagnose_gap() returns a DiagnosisResult (Pydantic model)
  - Store it as .dict() in state since state must be JSON-serializable
  - credit_agent needs a DiagnosisResult object, so reconstruct it from dict
"""

from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from agent.gap_detector    import detect_gap
from agent.diagnosis_agent import diagnose_gap
from agent.credit_agent    import generate_offer, execute_tier


class FleetState(TypedDict):
    operator_id:    str
    xtrapower_feed: list
    setu_feed:      dict
    gap_result:     Optional[dict]
    diagnosis:      Optional[dict]
    offer:          Optional[dict]
    outcome:        Optional[dict]
    audit_log:      list


# --- Node functions ---
# Each receives the full state dict and returns an updated copy.

def node_detect_gap(state: FleetState) -> FleetState:
    """Run deterministic gap detection. No LLM."""
    result = detect_gap(state["operator_id"],
                        state["xtrapower_feed"],
                        state["setu_feed"])
    return {**state, "gap_result": result}


def node_diagnose(state: FleetState) -> FleetState:
    """Run LLM diagnosis via instructor. Returns structured DiagnosisResult."""
    diagnosis = diagnose_gap(state["gap_result"],
                             state["xtrapower_feed"],
                             state["setu_feed"])
    return {**state, "diagnosis": diagnosis.dict()}


def node_credit_decision(state: FleetState) -> FleetState:
    """Generate offer and execute tier logic."""
    from agent.diagnosis_agent import DiagnosisResult
    diag  = DiagnosisResult(**state["diagnosis"])
    offer = generate_offer(state["gap_result"], diag)
    audit = state["audit_log"]
    outcome = execute_tier(offer, audit)
    return {**state, "offer": offer, "outcome": outcome, "audit_log": audit}


def node_no_action(state: FleetState) -> FleetState:
    """Log that no gap was found — operator is healthy."""
    state["audit_log"].append({
        "operator_id": state["operator_id"],
        "action":      "no_gap_detected",
        "timestamp":   "now"
    })
    return {**state, "outcome": {"status": "healthy",
                                  "operator_id": state["operator_id"]}}


def route_after_gap(state: FleetState) -> str:
    """Conditional edge: route to diagnosis if gap found, else no_action."""
    return "diagnose" if state["gap_result"]["gap_detected"] else "no_action"


# --- Build graph ---

builder = StateGraph(FleetState)
builder.add_node("detect_gap",      node_detect_gap)
builder.add_node("diagnose",        node_diagnose)
builder.add_node("credit_decision", node_credit_decision)
builder.add_node("no_action",       node_no_action)

builder.set_entry_point("detect_gap")
builder.add_conditional_edges("detect_gap", route_after_gap, {
    "diagnose":  "diagnose",
    "no_action": "no_action"
})
builder.add_edge("diagnose",        "credit_decision")
builder.add_edge("credit_decision", END)
builder.add_edge("no_action",       END)

graph = builder.compile()


def run_fleet_agent(operator_id: str,
                    xtrapower_feed: list,
                    setu_feed: dict) -> FleetState:
    """Entry point: runs the full agent pipeline for one operator."""
    return graph.invoke({
        "operator_id":    operator_id,
        "xtrapower_feed": xtrapower_feed,
        "setu_feed":      setu_feed,
        "gap_result":     None,
        "diagnosis":      None,
        "offer":          None,
        "outcome":        None,
        "audit_log":      []
    })

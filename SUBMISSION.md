# Fleet Treasury OS

**Predictive credit for fleet operators, powered by fuel card data and account aggregation.**

Team: Fuad | Pine Labs Hackathon 2026

---

## 1. Problem Statement

India's fleet operators — companies running 15 to 55 trucks — face a structural cash flow problem that no financial product addresses today.

These operators buy diesel daily using Pine Labs XTRAPOWER fuel cards. A mid-size fleet spends Rs 1–4 lakhs per day on fuel alone. Their freight clients — Reliance, Flipkart, Amazon, Tata Motors, Maersk — pay on 10 to 21-day cycles. Sometimes later.

This creates a **cash gap**: a window of days where the operator's bank balance cannot cover their fuel burn. Trucks sit idle. Contracts get missed. Revenue drops.

**Why banks can't solve this.** A bank sees one number: the account balance. It does not know the operator's daily fuel burn rate, which clients are paying late, or whether the fleet is growing or contracting. So it offers a round-number loan — Rs 5 lakhs for 6 months — priced for maximum uncertainty. The operator pays interest on money they don't need, for a duration that doesn't match their actual gap.

**Why Pine Labs can.** Pine Labs sits on both sides of this equation. XTRAPOWER fuel terminals capture every diesel purchase — amount, vehicle, location, frequency. Setu Account Aggregator (AA) APIs surface the operator's bank balance, client payment inflows, and receivable cycles. No other entity in India has both the burn rate and the cash position for the same operator. That is the moat.

---

## 2. Our Approach

Fleet Treasury OS is an AI agent that runs continuously, monitoring fleet operators and acting before a cash crisis hits.

The agent combines two data sources that have never been joined for credit decisioning:

- **XTRAPOWER fuel terminal data** — every diesel purchase, per vehicle, per day. This gives us the operator's real burn rate, route patterns, and fleet utilization trends.
- **Setu Account Aggregator bank data** — current account balance, timestamped inflows from each freight client, and historical payment cycle lengths.

The agent is built as a **LangGraph state machine** with three specialized sub-agents, each responsible for one stage of the decision:

| Sub-Agent | Method | Role |
|---|---|---|
| **Gap Detector** | Pure math, no LLM | Projects the operator's daily cash runway. Calculates exactly when — and if — the balance hits zero at current burn rate. |
| **Diagnosis Agent** | Claude (structured output via instructor) | Classifies *why* the gap exists. Examines client payment delays, fuel spend trends, fleet utilization changes, and bank inflow patterns. |
| **Credit Agent** | Tier logic | Sizes the loan to the exact deficit, sets the tenor to match the next expected client payment, and assigns an autonomy level for approval routing. |

The key design choice: the Gap Detector uses no LLM. It is deterministic arithmetic — burn rate times days minus projected inflows. The LLM is only used where judgment is needed: interpreting *why* the gap exists and whether the operator's business trajectory supports repayment.

---

## 3. Proposed Solution

The agent classifies every detected cash gap into one of three root causes, each mapped to a distinct credit tier:

**Tier 1 — Delayed Receivable.** A known client is paying late, but the operator's business is healthy. Fleet utilization is stable. Other clients are paying on time. The gap is temporary and the inflow is predictable. *Action: auto-size a bridge loan to the exact deficit. High confidence. Fast-track approval.*

**Tier 2 — Demand Spike.** The operator has taken on new contracts. Fuel burn has increased, but client payments from the new work haven't started flowing yet. The business is growing, but the cash position is stressed. *Action: size a working capital advance. Flag for credit officer review with full context.*

**Tier 3 — Route Contraction.** Fuel purchases are declining. Vehicles are going idle. Client inflows are dropping. The business is shrinking. *Action: no credit offer. Generate a health alert for relationship management.*

**What makes this different from a standard credit product:**

- **Predictive, not reactive.** The agent detects a gap days before it hits, not after the operator's card declines at a fuel station.
- **Precision-sized.** The loan amount matches the exact deficit — Rs 3.69 lakhs for 7 days, not Rs 5 lakhs for 6 months. The operator pays interest only on what they need, for exactly as long as they need it.
- **Tenor-matched.** Repayment is aligned to the next projected client payment date, derived from historical AA data.
- **Officer-assisted, not blind.** For Tier 2 offers, credit officers review a detail page showing the operator's full picture — client list, payment history by client, route map, fuel spend trends, bank transactions, and the agent's reasoning — before approving.

**Unit economics for Pine Labs:** Each disbursement earns a spread of approximately 0.011% per day between Pine Labs' lending rate and cost of funds. On short-tenor, high-frequency micro-loans across a large operator base, this compounds into a meaningful revenue line with low default risk — because the loans are backed by visible, confirmed receivables.

---

## 4. Technical Architecture

```
┌─────────────────────────────────────────────────┐
│                  Fleet Treasury OS               │
├──────────────┬──────────────┬───────────────────┤
│  XTRAPOWER   │   Setu AA    │   Operator        │
│  Fuel Data   │   Bank Data  │   Profiles        │
├──────────────┴──────────────┴───────────────────┤
│              LangGraph Agent Pipeline            │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │   Gap    │→ │ Diagnosis │→ │   Credit     │  │
│  │ Detector │  │   Agent   │  │    Agent     │  │
│  │(pure math)  │(Claude/   │  │(tier logic)  │  │
│  │          │  │instructor)│  │              │  │
│  └──────────┘  └───────────┘  └──────────────┘  │
├─────────────────────────────────────────────────┤
│           Python + FastAPI Backend               │
├─────────────────────────────────────────────────┤
│      HTML/CSS/JS Frontend (Material You)         │
│      Chart.js cash flow projections              │
└─────────────────────────────────────────────────┘
```

- **Backend:** Python, FastAPI. Serves the agent pipeline and operator data APIs.
- **Agent orchestration:** LangGraph state machine. Each sub-agent is a node with typed state transitions.
- **LLM:** Claude via AWS Bedrock, called through the instructor library for structured (typed, validated) output. The Diagnosis Agent returns a structured classification — not free text.
- **Data layer:** Synthetic data generators producing structurally identical output to real XTRAPOWER terminal APIs and Setu AA bank APIs. Eight fleet operators across four archetypes (delayed receivable, demand spike, route contraction, healthy) to demonstrate all decision paths.
- **Frontend:** Plain HTML, CSS, and JavaScript. Material You design system. No build step. Chart.js renders before/after cash flow projections showing the impact of a disbursement on the operator's runway.

---

## 5. Why Pine Labs

The Indian commercial vehicle market has **1.2 crore registered vehicles**. IOCL alone operates 44% of India's fuel retail network. Fleet operators sit in a credit gap — too small for corporate treasury products, too operationally complex for personal loans. Banks serve neither segment well because they lack operational visibility.

Pine Labs already has the infrastructure:

- **XTRAPOWER terminals** at fuel stations capture real-time spend data across the fleet operator's vehicles. This is the burn rate signal that no bank possesses.
- **Setu Account Aggregator integration** surfaces the operator's bank position and client payment patterns with consent. This is the cash position signal.
- **Existing merchant and SME relationships** provide the distribution channel. No cold-start acquisition required.

Fleet Treasury OS turns this existing data infrastructure into a **lending product with a structural information advantage**. The credit decision is better because the inputs are better. The loan is cheaper for the operator because it is precision-sized. The risk is lower for Pine Labs because the receivable backing each loan is visible and trackable.

Banks have the bank balance. They don't have XTRAPOWER. Without the burn rate, you cannot project the gap. You give a round-number loan priced for uncertainty. **Pine Labs has both sides — fuel spend and cash position. That is the moat.**

---

*Built at Pine Labs Hackathon 2026. Fleet Treasury OS — from fuel card swipe to credit decision in seconds.*

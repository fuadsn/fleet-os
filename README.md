# Fleet Treasury OS

AI agent that gives Indian fleet operators working capital priced to the exact cash gap — built on Pine Labs' XTRAPOWER fuel terminal data and Setu AA bank data.

## Quick Start

```bash
# 1. Activate venv
source .venv/bin/activate

# 2. Set your API key in .env
#    ANTHROPIC_API_KEY=sk-ant-...

# 3. Generate mock data
python seed.py

# 4. Start API server
uvicorn api.main:app --reload --port 8000

# 5. Open UI
open ui/index.html
```

## Architecture

```
seed.py → generates synthetic data into data/mock/

API (FastAPI on :8000)
  GET  /fleet/{id}/briefing  → deterministic gap detection (no LLM)
  POST /fleet/{id}/run       → full agent pipeline (LLM diagnosis)
  GET  /officer/queue        → pending human reviews
  POST /officer/approve/{id} → approve + disburse

Agent Pipeline (LangGraph):
  gap_detector → diagnosis_agent → credit_agent
       ↓              ↓                ↓
   pure math    Claude + instructor   tier logic
```

## Demo Order

1. **Sharma Logistics** — delayed receivable → auto-disburse (Tier 1)
2. **Verma Transport** — demand spike → officer queue (Tier 2)
3. **Gupta Fleet Services** — route contraction → credit withheld (Tier 3)

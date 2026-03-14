import json
import os
from data.card_registry import OPERATORS
from data.xtrapower_generator import generate_xtrapower_feed
from data.setu_aa_generator   import generate_setu_aa_feed

os.makedirs("data/mock", exist_ok=True)

print("Generating XTRAPOWER feed (45 days, all operators)...")
xtrapower = generate_xtrapower_feed(days=45)
with open("data/mock/xtrapower_feed.json", "w") as f:
    json.dump(xtrapower, f, indent=2)
print(f"  -> {len(xtrapower)} fuel transactions generated")

for op_id in OPERATORS:
    name_slug = op_id.split('-')[1].lower()
    print(f"Generating Setu AA feed for {op_id} ({OPERATORS[op_id]['name']})...")
    setu = generate_setu_aa_feed(op_id, days=90)
    fname = f"data/mock/setu_{name_slug}.json"
    with open(fname, "w") as f:
        json.dump(setu, f, indent=2)
    txn_count = len(setu["accounts"][0]["transactions"]["transaction"])
    balance   = setu["accounts"][0]["depositSummary"]["currentBalance"]
    print(f"  -> {txn_count} bank transactions | Balance: Rs.{balance:,.0f} | Archetype: {OPERATORS[op_id]['archetype']}")

print("\nDone. Run: uvicorn api.main:app --reload --port 8000")

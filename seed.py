import json
import os
from data.xtrapower_generator import generate_xtrapower_feed
from data.setu_aa_generator   import generate_setu_aa_feed

os.makedirs("data/mock", exist_ok=True)

print("Generating XTRAPOWER feed (45 days, all operators)...")
xtrapower = generate_xtrapower_feed(days=45)
with open("data/mock/xtrapower_feed.json", "w") as f:
    json.dump(xtrapower, f, indent=2)
print(f"  -> {len(xtrapower)} fuel transactions generated")

for op_id in ["OP-SHARMA-001", "OP-VERMA-002", "OP-GUPTA-003"]:
    print(f"Generating Setu AA feed for {op_id}...")
    setu = generate_setu_aa_feed(op_id, days=90)
    fname = f"data/mock/setu_{op_id.split('-')[1].lower()}.json"
    with open(fname, "w") as f:
        json.dump(setu, f, indent=2)
    txn_count = len(setu["accounts"][0]["transactions"]["transaction"])
    balance   = setu["accounts"][0]["depositSummary"]["currentBalance"]
    print(f"  -> {txn_count} bank transactions | Balance: Rs.{balance:,.0f}")

print("\nDone. Run: uvicorn api.main:app --reload --port 8000")

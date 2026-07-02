# ===========================================================================
# seed_from_csv.py  --  bulk-load personas / assets / transactions / gullak /
#                       scam history from CSV files into arthsaathi.db
#   Run from the backend/ folder (venv active):   python seed_from_csv.py
#   Reads backend/data/*.csv (money in RUPEES, human-friendly) and writes to
#   the SAME tables the dashboard reads, converting to PAISE.
#   scam_messages.csv is scored by the REAL tools.scam_check() so every
#   risk_score/verdict in history is one the tool produced (Critic trust model).
#   SAFE TO RE-RUN: deletes existing rows for each CSV user_id first.
#   Demo users 1-4 are NEVER touched.
# ===========================================================================
import os
import csv
import db                                # reuse the app's own DB layer
from tools import scam_check             # the real Threat Shield scorer

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")        # backend/data/*.csv lives here

PROTECTED = {1, 2, 3, 4}                 # the demo personas: hands off


def rupees(x):
    """RUPEES -> integer PAISE (the DB's money unit). Never float in the DB."""
    return int(round(float(x) * 100))


def read(name):
    """Read backend/data/<name>.csv into a list of dicts. Missing file -> []."""
    path = os.path.join(DATA, f"{name}.csv")
    if not os.path.exists(path):
        print(f"  (skip) {name}.csv not found")
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:   # -sig eats Excel's BOM
        return [row for row in csv.DictReader(f)]


def load():
    db.init_db()                                          # make sure tables exist
    people = read("personas")
    assets = read("assets")
    txns   = read("transactions")
    jar    = read("gullak")
    scams  = read("scam_messages")

    ids = {int(p["user_id"]) for p in people}
    bad = ids & PROTECTED
    if bad:
        raise SystemExit(f"Refusing to overwrite demo users {sorted(bad)}. "
                         f"Use user_id >= 10 in personas.csv.")

    c = db._conn()
    for uid in sorted(ids):                               # idempotent wipe per user
        for table in ("personas", "assets", "transactions", "gullak", "scam_checks"):
            c.execute(f"DELETE FROM {table} WHERE user_id=?", (uid,))

    # personas: 13 columns, POSITIONAL insert -> order must match db.py exactly
    for p in people:
        c.execute("INSERT INTO personas VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            int(p["user_id"]), p["name"], p["persona"], p["income_pattern"],
            rupees(p["monthly_income_rupees"]), rupees(p["monthly_expense_rupees"]),
            rupees(p["buffer_rupees"]), int(p["dependents"]), int(p["land_acres"]),
            p["category"], int(p["is_taxpayer"]), int(p["is_disabled"]), p["language"],
        ))

    c.executemany("INSERT INTO assets VALUES (?,?,?,?,?)",
        [(int(a["user_id"]), a["name"], a["category"],
          rupees(a["value_rupees"]), int(a["trend_bps"])) for a in assets
         if int(a["user_id"]) in ids])

    c.executemany("INSERT INTO transactions(user_id,category,amount_paise) VALUES (?,?,?)",
        [(int(t["user_id"]), t["category"], rupees(t["amount_rupees"])) for t in txns
         if int(t["user_id"]) in ids])

    c.executemany("INSERT INTO gullak(user_id,amount_paise,note) VALUES (?,?,?)",
        [(int(g["user_id"]), rupees(g["amount_rupees"]), g.get("note", "")) for g in jar
         if int(g["user_id"]) in ids])

    c.commit()
    c.close()

    # scam history: run each SMS through the REAL tool, store what IT decided.
    mismatches = 0
    for s in scams:
        uid = int(s["user_id"])
        if uid not in ids:
            continue
        result = scam_check(s["sms_text"], s.get("language", "en"))
        db.log_scam_check(uid, s["sms_text"], result, s.get("language", "en"))
        expect = s.get("expected_verdict", "").strip()
        if expect and result.get("verdict") != expect:
            mismatches += 1
            print(f"  NOTE: tool said '{result.get('verdict')}' "
                  f"(score {result.get('risk_score')}), CSV expected '{expect}': "
                  f"{s['sms_text'][:60]}...")

    print(f"Loaded {len(people)} personas, {len(assets)} assets, {len(txns)} "
          f"transactions, {len(jar)} gullak rows, {len(scams)} scam checks "
          f"({mismatches} verdict mismatches vs expectations).")
    print("Switch in the UI console:  window.ARTHSAATHI_USER = 10  (then reload)")


if __name__ == "__main__":
    load()
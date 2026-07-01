# ===========================================================================
# seed_synthetic.py  —  load synthetic personas into arthsaathi.db
#   Run from the backend/ folder (venv active):   python seed_synthetic.py
#   Reads synthetic_personas.json (money in RUPEES) and writes it to the same
#   SQLite tables the dashboard reads: personas, assets, transactions, gullak.
#   Money is converted RUPEES x 100 -> PAISE (the unit the DB stores).
#   SAFE TO RE-RUN: it deletes any existing rows for these user_ids first, so
#   re-running never duplicates. It does NOT touch the original personas 1-4.
# ===========================================================================
import os
import json
import db   # reuse the app's own DB layer (same arthsaathi.db, same tables)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "synthetic_personas.json")


def rupees(x):
    """RUPEES -> integer PAISE (the DB's money unit)."""
    return int(round(float(x) * 100))


def load():
    db.init_db()                                   # make sure tables exist
    with open(DATA, encoding="utf-8") as f:
        people = json.load(f)["personas"]

    c = db._conn()
    for p in people:
        uid = p["user_id"]
        # wipe any previous copy of THIS user so re-running is clean (1-4 untouched)
        for table in ("personas", "assets", "transactions", "gullak"):
            c.execute(f"DELETE FROM {table} WHERE user_id=?", (uid,))

        # persona row (column order matches db.PERSONAS)
        c.execute("INSERT INTO personas VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            uid, p["name"], p["persona"], p["income_pattern"],
            rupees(p["monthly_income"]), rupees(p["monthly_expense"]), rupees(p["buffer"]),
            p["dependents"], p["land_acres"], p["category"],
            p["is_taxpayer"], p["is_disabled"], p["language"],
        ))
        c.executemany("INSERT INTO assets VALUES (?,?,?,?,?)",
                      [(uid, name, cat, rupees(val), bps) for name, cat, val, bps in p["assets"]])
        c.executemany("INSERT INTO transactions(user_id,category,amount_paise) VALUES (?,?,?)",
                      [(uid, cat, rupees(amt)) for cat, amt in p["transactions"]])
        c.executemany("INSERT INTO gullak(user_id,amount_paise,note) VALUES (?,?,?)",
                      [(uid, rupees(amt), note) for amt, note in p["gullak"]])

    c.commit()
    c.close()
    print(f"Loaded {len(people)} synthetic personas (user_ids "
          f"{people[0]['user_id']}-{people[-1]['user_id']}) into arthsaathi.db")
    print("Switch to one in the UI console:  window.ARTHSAATHI_USER = 10  (then reload)")


if __name__ == "__main__":
    load()

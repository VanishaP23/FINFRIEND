import os
import json
import random
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "arthsaathi.db")


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row            # makes each row behave like a dict
    return c

PERSONAS = [
    # Priya: stable salaried teacher, taxpayer, building SIP -> low risk, no govt scheme
    (1, "Priya",  "salaried teacher",       "stable",   4800000, 3600000, 22000000, 2, 0, "salaried",      1, 0, "hi"),
    # Rajesh: gig delivery rider, volatile income, very thin buffer -> high survival risk
    (2, "Rajesh", "gig delivery rider",     "volatile", 2800000, 2400000,  1500000, 2, 0, "gig",           0, 0, "hi"),
    # Kisan: seasonal farmer, land-rich/cash-poor -> PM-KISAN eligible
    (3, "Kisan",  "seasonal farmer",        "seasonal", 1500000, 1200000,  2000000, 4, 3, "farmer",        0, 0, "hi"),
    # Divya: low-vision freelance writer -> disability pension (NSAP) eligible
    (4, "Divya",  "freelance writer (low vision)", "irregular", 1800000, 1400000, 4000000, 0, 0, "self-employed", 0, 1, "en"),
]

# assets per person: (name, category, value_paise, trend_bps)   800 bps = +8% / yr
ASSETS = {
    1: [("Mutual fund SIP", "investment", 28000000, 1100), ("EPF balance", "investment", 21000000, 800), ("Gold", "gold", 9000000, 600)],
    2: [("Motorbike", "vehicle", 6500000, -1200), ("Smartphone", "electronics", 1400000, -2500), ("Recurring deposit", "investment", 1200000, 400)],
    3: [("Farm land (3 acres)", "land", 150000000, 800), ("Tractor", "vehicle", 80000000, -500), ("Gold", "gold", 40000000, 600)],
    4: [("Craft / writing equipment", "equipment", 5500000, 200), ("Recurring deposit", "investment", 6000000, 700), ("Gold", "gold", 11000000, 600)],
}

# monthly spending per person: (category, amount_paise)  -- sums to monthly expense
TRANSACTIONS = {
    1: [("rent", 1400000), ("food", 800000), ("school fees", 500000), ("transport", 300000), ("utilities", 300000), ("insurance", 300000)],
    2: [("rent", 800000), ("food", 700000), ("fuel", 500000), ("phone & data", 150000), ("bike EMI", 250000)],
    3: [("seeds & inputs", 350000), ("food", 400000), ("home", 200000), ("diesel", 150000), ("school", 100000)],
    4: [("rent", 500000), ("food", 450000), ("materials", 250000), ("utilities", 100000), ("transport", 100000)],
}

# starting savings ("gullak") per person: (amount_paise, note)
GULLAK = {
    1: [(500000, "monthly SIP top-up")],
    2: [(150000, "after a good week")],
    3: [(100000, "after selling crop")],
    4: [(400000, "craft sale savings")],
}


def init_db():
    """Create the tables if they do not exist, and seed the four personas once."""
    c = _conn()
    c.execute("""CREATE TABLE IF NOT EXISTS personas(
        user_id INTEGER PRIMARY KEY, name TEXT, persona TEXT, income_pattern TEXT,
        monthly_income_paise INTEGER, monthly_expense_paise INTEGER, buffer_paise INTEGER,
        dependents INTEGER, land_acres INTEGER, category TEXT,
        is_taxpayer INTEGER, is_disabled INTEGER, language TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS assets(
        user_id INTEGER, name TEXT, category TEXT, value_paise INTEGER, trend_bps INTEGER)""")
    c.execute("""CREATE TABLE IF NOT EXISTS transactions(
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, category TEXT, amount_paise INTEGER)""")
    c.execute("""CREATE TABLE IF NOT EXISTS gullak(
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount_paise INTEGER, note TEXT)""")

    # two history tables (so the Scam-alerts and Audit-trail panels can fill up
    # live). Kept loose on purpose (no strict CHECKs) so a write never fails the
    # demo; the strict, Postgres-ready versions live in sql/schema.sql.
    c.execute("""CREATE TABLE IF NOT EXISTS scam_checks(
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, sms_text TEXT,
        risk_score INTEGER, verdict TEXT, language TEXT, status TEXT,
        created_at TEXT DEFAULT (datetime('now')))""")
    c.execute("""CREATE TABLE IF NOT EXISTS chat_messages(
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT,
        agent TEXT, tool_calls TEXT, citations TEXT, critic_status TEXT, critic_reason TEXT,
        language TEXT, created_at TEXT DEFAULT (datetime('now')))""")
    try:
        c.execute("ALTER TABLE chat_messages ADD COLUMN channel TEXT DEFAULT 'chat'")
    except sqlite3.OperationalError:
        pass
    c.execute("""CREATE TABLE IF NOT EXISTS auth_identities(
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        provider TEXT NOT NULL, identifier TEXT NOT NULL UNIQUE,
        verified INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))""")
    c.execute("""CREATE TABLE IF NOT EXISTS auth_otps(
        id INTEGER PRIMARY KEY AUTOINCREMENT, identifier TEXT NOT NULL,
        otp TEXT NOT NULL, expires_at INTEGER NOT NULL,
        consumed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))""")
    c.execute("""CREATE TABLE IF NOT EXISTS user_contexts(
        user_id INTEGER PRIMARY KEY, summary TEXT DEFAULT '',
        last_agent TEXT, last_channel TEXT DEFAULT 'chat',
        updated_at TEXT DEFAULT (datetime('now')))""")
    c.execute("""CREATE TABLE IF NOT EXISTS user_documents(
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL, filename TEXT NOT NULL, stored_path TEXT NOT NULL,
        content_type TEXT, status TEXT DEFAULT 'uploaded',
        created_at TEXT DEFAULT (datetime('now')))""")
    for column in ("extracted_text TEXT DEFAULT ''", "extracted_fields TEXT DEFAULT '{}'"):
        try:
            c.execute(f"ALTER TABLE user_documents ADD COLUMN {column}")
        except sqlite3.OperationalError:
            pass

    # only seed if the personas table is empty (so we don't duplicate on restart)
    if c.execute("SELECT COUNT(*) FROM personas").fetchone()[0] == 0:
        c.executemany("INSERT INTO personas VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", PERSONAS)
        for uid, rows in ASSETS.items():
            c.executemany("INSERT INTO assets VALUES (?,?,?,?,?)", [(uid,) + r for r in rows])
        for uid, rows in TRANSACTIONS.items():
            c.executemany("INSERT INTO transactions(user_id,category,amount_paise) VALUES (?,?,?)", [(uid,) + r for r in rows])
        for uid, rows in GULLAK.items():
            c.executemany("INSERT INTO gullak(user_id,amount_paise,note) VALUES (?,?,?)", [(uid,) + r for r in rows])

    c.commit()
    c.close()

#Identifies a user by their identifier (email{part before @} or phone{last 4 digits}) and returns a default name if none is provided.
def _default_name(identifier):
    base = identifier.split("@", 1)[0] if "@" in identifier else identifier[-4:]
    base = "".join(ch for ch in base if ch.isalnum()) or "User"
    return base[:1].upper() + base[1:]


def create_user(name, email=None, phone=None, provider="otp"):
    """Create a lightweight citizen profile and linked login identity."""
    c = _conn()
    next_id = (c.execute("SELECT COALESCE(MAX(user_id),0)+1 FROM personas").fetchone()[0])#Generate new user_id like 1,2 etc
    display = name or _default_name(email or phone or f"user{next_id}")
    c.execute("INSERT INTO personas VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
              (next_id, display, "new citizen", "unknown", 0, 0, 0, 0, 0,
               "personal", 0, 0, "en"))
    #Saves the login identity of the user
    for ident_kind, ident in (("email", email), ("phone", phone)):
        if ident:
            c.execute("INSERT OR IGNORE INTO auth_identities(user_id, provider, identifier, verified) VALUES (?,?,?,?)",
                      (next_id, provider or ident_kind, ident.lower(), 1))
    c.commit()
    c.close()
    return get_profile(next_id)


# columns a caller is allowed to write onto a profile from outside(all money in paise)
_PROFILE_COLUMNS = {
    "name", "persona", "income_pattern", "monthly_income_paise",
    "monthly_expense_paise", "buffer_paise", "dependents", "land_acres",
    "category", "is_taxpayer", "is_disabled", "language",
}

#Onboarding fields extracted from documents or forms are applied to a user's profile and optional assets. Only known columns are updated, and unknown keys are ignored. The function performs a real database write.
def apply_profile_fields(user_id, fields, assets=None):
    """Fill in a freshly signed-up user's profile (and optional assets) from
    extracted document / onboarding fields, so their dashboard is not empty.
    Only known columns are touched; unknown keys are ignored. A real DB write.
    `assets` is an optional list of dicts: {name, category, value_paise, trend_bps}."""
    updates = {k: v for k, v in (fields or {}).items() if k in _PROFILE_COLUMNS}
    c = _conn()
    if updates:
        cols = ", ".join(f"{k}=?" for k in updates)
        c.execute(f"UPDATE personas SET {cols} WHERE user_id=?",
                  (*updates.values(), user_id))
    for a in (assets or []):
        c.execute("INSERT INTO assets(user_id, name, category, value_paise, trend_bps) VALUES (?,?,?,?,?)",
                  (user_id, a["name"], a.get("category", "other"),
                   int(a["value_paise"]), int(a.get("trend_bps", 0))))
    c.commit()
    c.close()
    return get_profile(user_id)


def find_user_by_identifier(identifier):
    ident = identifier.lower().strip()
    c = _conn()
    row = c.execute("SELECT user_id FROM auth_identities WHERE identifier=?", (ident,)).fetchone()
    c.close()
    return get_profile(row["user_id"]) if row else None


def issue_otp(identifier, ttl_seconds=600):
    ident = identifier.lower().strip()
    otp = f"{random.randint(100000, 999999)}"
    import time
    c = _conn()
    c.execute("INSERT INTO auth_otps(identifier, otp, expires_at) VALUES (?,?,?)",
              (ident, otp, int(time.time()) + ttl_seconds))
    c.commit()
    c.close()
    return otp


def verify_otp(identifier, otp):
    import time
    ident = identifier.lower().strip()
    c = _conn()
    row = c.execute("""SELECT id FROM auth_otps
                       WHERE identifier=? AND otp=? AND consumed=0 AND expires_at>=?
                       ORDER BY id DESC LIMIT 1""", (ident, otp, int(time.time()))).fetchone()
    if row:
        c.execute("UPDATE auth_otps SET consumed=1 WHERE id=?", (row["id"],))
        c.commit()
    c.close()
    return bool(row)


def ensure_user_for_identity(identifier, name=None, provider="otp"):
    ident = identifier.lower().strip()
    existing = find_user_by_identifier(ident)
    if existing:
        return existing
    email = ident if "@" in ident else None
    phone = None if email else ident
    return create_user(name or _default_name(ident), email=email, phone=phone, provider=provider)

#UI drop down menu
def get_personas():
    """The short list used to fill the persona dropdown at the top."""
    c = _conn()
    rows = c.execute("SELECT user_id, name, persona, language FROM personas ORDER BY user_id").fetchall()
    c.close()
    return [dict(r) for r in rows]


def get_profile(user_id):
    """The full profile for one person (falls back to Priya if id is unknown)."""
    c = _conn()
    row = c.execute("SELECT * FROM personas WHERE user_id=?", (user_id,)).fetchone()
    if row is None:
        row = c.execute("SELECT * FROM personas WHERE user_id=1").fetchone()
    c.close()
    return dict(row)

#Reads user context from the database, including summary, last agent, last channel, and updated timestamp. Returns a default context if none exists.
def get_user_context(user_id):
    c = _conn()
    row = c.execute("SELECT summary, last_agent, last_channel, updated_at FROM user_contexts WHERE user_id=?",
                    (user_id,)).fetchone()
    c.close()
    return dict(row) if row else {"summary": "", "last_agent": None, "last_channel": "chat", "updated_at": None}

#If user does not exist in table, insert.If user exists, upsert
def save_user_context(user_id, summary, last_agent=None, channel="chat"):
    c = _conn()
    c.execute("""INSERT INTO user_contexts(user_id, summary, last_agent, last_channel, updated_at)
                 VALUES (?,?,?,?,datetime('now'))
                 ON CONFLICT(user_id) DO UPDATE SET
                   summary=excluded.summary,
                   last_agent=excluded.last_agent,
                   last_channel=excluded.last_channel,
                   updated_at=datetime('now')""",
              (user_id, summary, last_agent, channel))
    c.commit()
    c.close()
    return get_user_context(user_id)


def get_assets(user_id):
    c = _conn()
    rows = c.execute("SELECT name, category, value_paise, trend_bps FROM assets WHERE user_id=?", (user_id,)).fetchall()
    c.close()
    return [dict(r) for r in rows]

#Data Expense pie chart
def get_allocations(user_id):
    """Spending grouped by category, for the Money screen."""
    c = _conn()
    rows = c.execute(
        "SELECT category, SUM(amount_paise) AS amount_paise FROM transactions WHERE user_id=? GROUP BY category",
        (user_id,)).fetchall()
    c.close()
    return [dict(r) for r in rows]

#Reads the user total savings from the gullak table
def get_gullak(user_id):
    """Total savings + the list of saving entries for one person."""
    c = _conn()
    rows = c.execute("SELECT amount_paise, note FROM gullak WHERE user_id=?", (user_id,)).fetchall()
    total = c.execute("SELECT COALESCE(SUM(amount_paise),0) FROM gullak WHERE user_id=?", (user_id,)).fetchone()[0]
    c.close()
    return {"balance_paise": total, "entries": [dict(r) for r in rows]}


def add_gullak(user_id, amount_paise, note):
    """Add a new saving and return the new total (a real database write)."""
    c = _conn()
    c.execute("INSERT INTO gullak(user_id, amount_paise, note) VALUES (?,?,?)", (user_id, amount_paise, note))
    c.commit()
    total = c.execute("SELECT COALESCE(SUM(amount_paise),0) FROM gullak WHERE user_id=?", (user_id,)).fetchone()[0]
    c.close()
    return {"balance_paise": total}


#Logs one spend into the transactions table (a real DB write). Returns the refreshed per-category allocations so the Money screen / pie chart can update live.
def add_transaction(user_id, category, amount_paise):
    """Log one spend into the transactions table (a real DB write). Returns the
    refreshed per-category allocations so the Money screen can update live."""
    c = _conn()
    c.execute("INSERT INTO transactions(user_id, category, amount_paise) VALUES (?,?,?)",
              (user_id, category, amount_paise))
    c.commit()
    c.close()
    return get_allocations(user_id)



# ---- Threat Shield history (feeds the "Scam alerts" panel) ----
def log_scam_check(user_id, sms_text, result, language="en"):
    """Save one scam-check result. Called from POST /scam/check."""
    c = _conn()
    c.execute("INSERT INTO scam_checks(user_id, sms_text, risk_score, verdict, language, status) "
              "VALUES (?,?,?,?,?,?)",
              (user_id, sms_text, result.get("risk_score", 0), result.get("verdict", "safe"),
               language, result.get("status", "delivered")))
    c.commit()
    c.close()


def get_scam_checks(user_id, limit=20):
    """Most-recent-first scam alerts for one person."""
    c = _conn()
    rows = c.execute("SELECT verdict, risk_score, status, language, created_at, "
                     "substr(sms_text,1,80) AS sms_preview "
                     "FROM scam_checks WHERE user_id=? ORDER BY id DESC LIMIT ?",
                     (user_id, limit)).fetchall()
    c.close()
    return [dict(r) for r in rows]


# ---- Advisor + Critic audit trail (feeds the "Audit trail" panel) ----
def log_chat(user_id, role, text, language="en", agent=None, tool_calls=None,
             citations=None, critic_status=None, critic_reason=None, channel="chat"):
    """Save one chat turn (user or assistant). Lists/dicts are stored as JSON text."""
    c = _conn()
    c.execute("INSERT INTO chat_messages(user_id, role, text, agent, tool_calls, citations, "
              "critic_status, critic_reason, language, channel) VALUES (?,?,?,?,?,?,?,?,?,?)",
              (user_id, role, text, agent,
               json.dumps(tool_calls) if tool_calls is not None else None,
               json.dumps(citations) if citations is not None else None,
               critic_status, critic_reason, language, channel))
    c.commit()
    c.close()


def get_chat_audit(user_id, limit=20):
    """Most-recent-first chat + Critic audit rows for one person."""
    c = _conn()
    rows = c.execute("SELECT role, text, agent, critic_status, critic_reason, tool_calls, "
                     "citations, channel, created_at, substr(text,1,120) AS text_preview "
                     "FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT ?",
                     (user_id, limit)).fetchall()
    c.close()
    return [dict(r) for r in rows]


def save_document(user_id, doc_type, filename, stored_path, content_type, extracted_text="", extracted_fields=None):
    c = _conn()
    c.execute("""INSERT INTO user_documents(user_id, doc_type, filename, stored_path, content_type,
                                            extracted_text, extracted_fields)
                 VALUES (?,?,?,?,?,?,?)""",
              (user_id, doc_type, filename, stored_path, content_type,
               extracted_text or "", json.dumps(extracted_fields or {})))
    c.commit()
    doc_id = c.execute("SELECT last_insert_rowid()").fetchone()[0]
    c.close()
    return {"id": doc_id, "user_id": user_id, "doc_type": doc_type, "filename": filename,
            "content_type": content_type, "status": "uploaded"}


def get_documents(user_id):
    c = _conn()
    rows = c.execute("""SELECT id, doc_type, filename, content_type, status, created_at, extracted_fields
                        FROM user_documents
                        WHERE user_id=? AND status != 'removed'
                        ORDER BY id DESC""",
                     (user_id,)).fetchall()
    c.close()
    docs = []
    for r in rows:
        d = dict(r)
        try:
            d["extracted_fields"] = json.loads(d.get("extracted_fields") or "{}")
        except Exception:
            d["extracted_fields"] = {}
        docs.append(d)
    return docs


def get_document_detail(user_id, doc_id):
    c = _conn()
    row = c.execute("""SELECT * FROM user_documents
                       WHERE user_id=? AND id=? AND status != 'removed'""",
                    (user_id, doc_id)).fetchone()
    c.close()
    return dict(row) if row else None


def remove_document(user_id, doc_id):
    c = _conn()
    row = c.execute("""SELECT stored_path FROM user_documents
                       WHERE user_id=? AND id=? AND status != 'removed'""",
                    (user_id, doc_id)).fetchone()
    if not row:
        c.close()
        return None
    c.execute("UPDATE user_documents SET status='removed' WHERE user_id=? AND id=?",
              (user_id, doc_id))
    c.commit()
    c.close()
    return {"id": doc_id, "stored_path": row["stored_path"], "status": "removed"}


def find_document_field(user_id, field_name):
    c = _conn()
    rows = c.execute("""SELECT doc_type, filename, extracted_fields
                        FROM user_documents
                        WHERE user_id=? AND status != 'removed'
                        ORDER BY id DESC""", (user_id,)).fetchall()
    c.close()
    for row in rows:
        try:
            fields = json.loads(row["extracted_fields"] or "{}")
        except Exception:
            fields = {}
        value = fields.get(field_name)
        if value:
            return {"value": value, "doc_type": row["doc_type"], "filename": row["filename"]}
    return None


# ---- run `python db.py` to create + seed the database and print one profile ----
if __name__ == "__main__":
    init_db()
    print("Personas:", get_personas())
    print("Kisan profile:", get_profile(3))
    print("Kisan assets:", get_assets(3))
    print("Kisan gullak:", get_gullak(3))
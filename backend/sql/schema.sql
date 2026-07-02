-- ===========================================================================
-- ArthSaathi -- schema.sql
-- ---------------------------------------------------------------------------
-- The relational schema for the ArthSaathi backend (Nomura KakushIN 10.0).
--
-- This file is the SQL twin of backend/db.py. The 4 CORE tables below are
-- byte-for-byte compatible with what db.init_db() creates, including COLUMN
-- ORDER, so db.py's positional `INSERT INTO personas VALUES (?,?,...)` and
-- `INSERT INTO assets VALUES (?,?,?,?,?)` still work if these tables already
-- exist. We only ADD constraints (NOT NULL / CHECK / FK) that db.py omitted.
--
-- Design rules (kept identical to the running app):
--   * SQLite for the hackathon; Postgres-friendly so migration is mechanical.
--   * All money is an INTEGER number of PAISE (1 rupee = 100 paise). Never float.
--   * "Compute, don't store": EMI, Monte Carlo risk, asset projection, legacy
--     checklist, scheme eligibility and scam scoring are produced live by
--     tools.py. They are NOT tables -- that is what lets the Critic refuse any
--     number a tool did not produce. We only persist raw facts + history.
-- ===========================================================================
--
-- IS THIS FILE EXECUTED?  No. The running app builds tables in Python
-- (db.py::init_db). This folder is DOCUMENTATION + the Postgres-ready twin:
-- read it to understand the schema, or run it to stand up the same DB in a
-- plain SQL / Postgres setup. Keep it in sync with db.py when tables change.
-- ===========================================================================

PRAGMA foreign_keys = ON;          -- SQLite needs this ON every connection

-- ===========================================================================
-- CORE TABLES  (exact twins of backend/db.py -- do not reorder columns)
-- ===========================================================================

-- The four demo people. One row = one citizen using Personal mode.
-- Column order MUST match db.py so its 13-value positional INSERT keeps working.
CREATE TABLE IF NOT EXISTS personas (
    user_id               INTEGER PRIMARY KEY,            -- 1 Priya, 2 Rajesh, 3 Kisan, 4 Divya
    name                  TEXT    NOT NULL,
    persona               TEXT    NOT NULL,               -- e.g. "seasonal farmer"
    income_pattern        TEXT    NOT NULL,               -- stable | volatile | seasonal | irregular
    monthly_income_paise  INTEGER NOT NULL CHECK (monthly_income_paise  >= 0),
    monthly_expense_paise INTEGER NOT NULL CHECK (monthly_expense_paise >= 0),
    buffer_paise          INTEGER NOT NULL CHECK (buffer_paise          >= 0),  -- savings cushion
    dependents            INTEGER NOT NULL DEFAULT 0 CHECK (dependents >= 0),
    land_acres            INTEGER NOT NULL DEFAULT 0 CHECK (land_acres  >= 0),
    category              TEXT    NOT NULL,               -- salaried | gig | farmer | self-employed
    is_taxpayer           INTEGER NOT NULL DEFAULT 0 CHECK (is_taxpayer IN (0,1)),
    is_disabled           INTEGER NOT NULL DEFAULT 0 CHECK (is_disabled IN (0,1)),
    language              TEXT    NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','kn'))
);

-- What each person owns. Drives the Asset + Legacy agent.
-- 5 columns, no surrogate id, to match db.py's `INSERT INTO assets VALUES (?,?,?,?,?)`.
CREATE TABLE IF NOT EXISTS assets (
    user_id     INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,                          -- "Farm land (3 acres)"
    category    TEXT    NOT NULL,                          -- land | gold | vehicle | investment | ...
    value_paise INTEGER NOT NULL CHECK (value_paise >= 0),
    trend_bps   INTEGER NOT NULL                           -- yearly trend in basis points: 800 = +8%, -500 = -5%
);

-- Monthly spending, one row per category. Sums to monthly_expense_paise.
CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    category     TEXT    NOT NULL,                          -- rent | food | seeds & inputs | ...
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0)
);

-- The "gullak" (savings jar). The ONE thing the user writes to live (POST /gullak).
CREATE TABLE IF NOT EXISTS gullak (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
    note         TEXT    DEFAULT ''
);

-- ===========================================================================
-- JUSTIFIED EXTENSIONS  (NOT in db.py yet -- each one backs a real screen)
-- ---------------------------------------------------------------------------
-- These two are the only places the dashboard currently shows data it does not
-- persist. Adding them is cheap, breaks nothing, and keeps the trust model:
-- we store the RESULT a tool produced, never a number the LLM invented.
-- ===========================================================================

-- Threat Shield history. Today POST /scam/check is stateless; the "scam alerts"
-- panel has nothing to list. This gives it a real, auditable feed.
CREATE TABLE IF NOT EXISTS scam_checks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    sms_text     TEXT    NOT NULL,                          -- the message that was checked
    risk_score   INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    verdict      TEXT    NOT NULL CHECK (verdict IN ('safe','suspicious','scam')),
    language     TEXT    NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','kn')),
    status       TEXT    NOT NULL CHECK (status IN ('delivered','refused')),  -- mirrors tools.scam_check
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Advisor + Critic audit trail. One row per /chat turn. This is the demo's
-- strongest story: you can SHOW every reply, which agent answered, which tools
-- ran, and the Critic's verdict (delivered / refused / escalated).
CREATE TABLE IF NOT EXISTS chat_messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    role             TEXT    NOT NULL CHECK (role IN ('user','assistant')),
    text             TEXT    NOT NULL,                       -- the message / the reply
    agent            TEXT,                                   -- advisor|risk|asset|scheme|scam|legacy|general
    tool_calls       TEXT,                                   -- JSON array as text, e.g. '["compute_emi"]'
    citations        TEXT,                                   -- JSON array as text (source + page)
    critic_status    TEXT    CHECK (critic_status IN ('delivered','refused','escalated')),
    critic_reason    TEXT,                                   -- e.g. "untraceable number ₹9,99,999"
    language         TEXT    NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','kn')),
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ===========================================================================
-- AUTH + SESSION + DOCUMENTS  (db.py builds these; added so the twin is
-- complete: OTP login, rolling per-user memory, uploaded KYC documents.)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS auth_identities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    provider    TEXT    NOT NULL,                          -- otp | google | ...
    identifier  TEXT    NOT NULL UNIQUE,                   -- the email or phone
    verified    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_otps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier  TEXT    NOT NULL,                           -- email/phone the OTP was sent to
    otp         TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,                           -- unix epoch seconds
    consumed    INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0,1)),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- SQLite side of memory; the vector side is ChromaDB's "user_memory" collection.
CREATE TABLE IF NOT EXISTS user_contexts (
    user_id      INTEGER PRIMARY KEY REFERENCES personas(user_id) ON DELETE CASCADE,
    summary      TEXT    NOT NULL DEFAULT '',
    last_agent   TEXT,
    last_channel TEXT    NOT NULL DEFAULT 'chat',
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_documents (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    doc_type         TEXT    NOT NULL,                       -- aadhaar | pan | statement | other
    filename         TEXT    NOT NULL,
    stored_path      TEXT    NOT NULL,
    content_type     TEXT,
    status           TEXT    NOT NULL DEFAULT 'uploaded',
    extracted_text   TEXT    DEFAULT '',
    extracted_fields TEXT    DEFAULT '{}',                   -- JSON as text
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- db.py also adds this column to chat_messages at runtime (ALTER TABLE):
--   ALTER TABLE chat_messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'chat';

-- ---------------------------------------------------------------------------
-- NOT BUILT ON PURPOSE (present in the spec doc, absent from the backend):
--   roles / user_roles / RBAC      -> the app has no auth; all 4 users are
--                                     Personal-mode citizens. Add when Manager/
--                                     Educator/Administrator modes are real.
--   lessons / quizzes / education  -> there is no Teaching agent or /lesson
--                                     endpoint in agents.py or main.py.
--   monte_carlo_runs / emi_calcs / -> computed live in tools.py and thrown away
--   scheme_eligibility / legacy    -> by design (the Critic trust layer). Storing
--                                     them would create a second source of truth.
-- Stubs for these live at the bottom of migration.sql, commented out, ready to
-- switch on the day those features ship.
-- ---------------------------------------------------------------------------
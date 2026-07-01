-- ===========================================================================
-- ArthSaathi -- migration.sql   (SQLite hackathon  ->  PostgreSQL)
-- ---------------------------------------------------------------------------
-- The schema was kept Postgres-friendly on purpose, so migration is mostly
-- mechanical. This file documents the handful of real differences and gives
-- Postgres-native DDL you can run as-is. It also parks the spec-doc features
-- that the backend does not implement yet, as commented stubs.
-- ===========================================================================

-- ---- WHAT ACTUALLY CHANGES going to Postgres -------------------------------
--  1. INTEGER PRIMARY KEY AUTOINCREMENT      ->  GENERATED ALWAYS AS IDENTITY
--  2. datetime('now') default                ->  now()  (column type timestamptz)
--  3. CHECK (col IN (0,1)) booleans           ->  real BOOLEAN columns (optional)
--  4. JSON-as-TEXT (tool_calls, citations)    ->  JSONB (queryable)
--  5. Money stays BIGINT paise everywhere (a SIP value in paise can exceed
--     2^31, so use BIGINT, not INT, on Postgres).
--  6. SQLite has no native FK enforcement unless PRAGMA foreign_keys=ON;
--     Postgres enforces them always -- so insert parents before children
--     (personas before assets/transactions/gullak), which seed.sql already does.

-- ---- POSTGRES DDL (core + the two extensions) ------------------------------
-- Run this block on Postgres instead of schema.sql.

CREATE TABLE personas (
    user_id               INTEGER PRIMARY KEY,
    name                  TEXT    NOT NULL,
    persona               TEXT    NOT NULL,
    income_pattern        TEXT    NOT NULL,
    monthly_income_paise  BIGINT  NOT NULL CHECK (monthly_income_paise  >= 0),
    monthly_expense_paise BIGINT  NOT NULL CHECK (monthly_expense_paise >= 0),
    buffer_paise          BIGINT  NOT NULL CHECK (buffer_paise          >= 0),
    dependents            INTEGER NOT NULL DEFAULT 0 CHECK (dependents >= 0),
    land_acres            INTEGER NOT NULL DEFAULT 0 CHECK (land_acres  >= 0),
    category              TEXT    NOT NULL,
    is_taxpayer           BOOLEAN NOT NULL DEFAULT FALSE,
    is_disabled           BOOLEAN NOT NULL DEFAULT FALSE,
    language              TEXT    NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','kn'))
);

CREATE TABLE assets (
    user_id     INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    value_paise BIGINT  NOT NULL CHECK (value_paise >= 0),
    trend_bps   INTEGER NOT NULL
);

CREATE TABLE transactions (
    id           BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    category     TEXT    NOT NULL,
    amount_paise BIGINT  NOT NULL CHECK (amount_paise >= 0)
);

CREATE TABLE gullak (
    id           BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    amount_paise BIGINT  NOT NULL CHECK (amount_paise >= 0),
    note         TEXT    DEFAULT ''
);

CREATE TABLE scam_checks (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      INTEGER     NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    sms_text     TEXT        NOT NULL,
    risk_score   INTEGER     NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    verdict      TEXT        NOT NULL CHECK (verdict IN ('safe','suspicious','scam')),
    language     TEXT        NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','kn')),
    status       TEXT        NOT NULL CHECK (status IN ('delivered','refused')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       INTEGER     NOT NULL REFERENCES personas(user_id) ON DELETE CASCADE,
    role          TEXT        NOT NULL CHECK (role IN ('user','assistant')),
    text          TEXT        NOT NULL,
    agent         TEXT,
    tool_calls    JSONB,                              -- was TEXT in SQLite
    citations     JSONB,                              -- was TEXT in SQLite
    critic_status TEXT        CHECK (critic_status IN ('delivered','refused','escalated')),
    critic_reason TEXT,
    language      TEXT        NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','kn')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No separate index script is needed for the SQLite demo. Add Postgres indexes
-- later only after production query patterns are known.

-- ===========================================================================
-- FUTURE / NOT-YET-BUILT  (in the spec doc, absent from the backend)
-- ---------------------------------------------------------------------------
-- Switch these on the day Manager / Educator / Administrator modes or a real
-- Teaching agent ship. Left commented so they never seed empty/fake data now.
-- ===========================================================================
-- CREATE TABLE roles (role_id INTEGER PRIMARY KEY, name TEXT UNIQUE);  -- personal|manager|educator|administrator
-- CREATE TABLE user_roles (user_id INTEGER REFERENCES personas(user_id), role_id INTEGER REFERENCES roles(role_id), PRIMARY KEY(user_id,role_id));
-- CREATE TABLE lessons (lesson_id INTEGER PRIMARY KEY, title TEXT, language TEXT, body TEXT);            -- Teaching agent
-- CREATE TABLE quizzes (quiz_id INTEGER PRIMARY KEY, lesson_id INTEGER REFERENCES lessons(lesson_id));  -- Teaching agent
-- CREATE TABLE managed_citizens (citizen_id INTEGER PRIMARY KEY, manager_user_id INTEGER REFERENCES personas(user_id)); -- Manager mode

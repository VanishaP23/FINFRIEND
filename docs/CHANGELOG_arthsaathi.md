# ArthSaathi — changes in this build

## Database (new)
- `backend/sql/schema.sql`  — 4 core tables (twins of db.py) + 2 new: `scam_checks`, `chat_messages`.
- `backend/sql/seed.sql`    — the 4 personas + assets/spend/savings, plus sample scam + chat-audit rows.
- `backend/sql/views.sql` — per-panel dashboard views. SQLite setup stays in `backend/db.py`.
- `backend/sql/migration.sql` — SQLite → PostgreSQL DDL + parked future stubs.
- `docs/DASHBOARD_MODELS.md`, `docs/er_diagram.mermaid`.
- NOTE: db.py auto-seeds the 4 personas at startup. Run db.py OR seed.sql's persona block, not both.

## tools.py
- `check_schemes` rewritten as a declarative `SCHEMES` list (add a scheme = 1 entry).
  Now covers PM-KISAN, NSAP, e-Shram, APY, PMSBY; returns a `reason` (incl. why-NOT).
- `scam_check` made multilingual (en/hi/kn keyword buckets) + returns `reasons[]`.
  Fixes the bug where Hindi/Kannada scams scored 0 ("safe"). Stays deterministic.
- All original return keys preserved (backward compatible).

## agents.py
- `scam_agent`  now speaks the reasons in the user's language ("Why flagged:" / कारण: / ಕಾರಣ:).
- `scheme_agent` now explains WHY the top scheme qualifies.

## skills.py (new) — the skill registry
- `backend/skills.py` — 7 self-describing skills, each mapped to an agent + tools.
- `GET /skills` lists them; `GET /skills/route?q=...` shows which skill would handle a question.
- `/chat` replies now include the `skill` that answered (for a Skills panel).
- `mcp_server.py` exposes `available_skills()` so any MCP client (incl. KakushIN) can discover them.
- Router fix: "nominee/will/after me" now correctly routes to Legacy (was Asset on the word "land").

## Live persistence (db.py + main.py)
- db.init_db() now also creates scam_checks + chat_messages (loose, demo-safe).
- New db helpers: log_scam_check / get_scam_checks / log_chat / get_chat_audit.
- POST /scam/check now persists each check; GET /scam/alerts?user_id= reads the feed.
- POST /chat now logs user+assistant turns; GET /chat/history?user_id= reads the audit.
- All logging is try/except wrapped: it can never break a reply.
- apply_extras.py is now OPTIONAL (only pre-seeds sample history for a cold start).

## Per-user dashboard wiring (integration.js)
- Header now has a person dropdown (Priya/Rajesh/Kisan/Divya), populated from /personas, remembered across reloads.
- applyIdentity: header name/role/avatar/greeting follow the selected user.
- loadMoney: My Money income/expense/safe-per-day + spending breakdown from /money/plan.
- loadAssets: My Things rebuilt from /assets (value + 1-year projection + insight).
- loadSchemes: Schemes rebuilt from /scheme/eligible (eligible/not + reason + docs).
- Language-aware read-aloud (say): detects Kannada/Devanagari/Latin, picks a matching voice, waits for voices to load.
- See docs/FULL_FUNCTIONAL.md for the full setup.

## Final agentic wiring (integration.js)
- loadScamFeed: the Threat Shield "recently blocked" list + "threats flagged" count now come from the live /scam/alerts feed, per user.
- The feed refreshes immediately after each scam check, so the agent's activity shows on screen.
- Full backend smoke test passes (all modules compile; 4 personas resolve money/assets/schemes; scam logging + feed verified).

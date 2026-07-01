# ArthSaathi — Dashboard data models

How each dashboard panel is fed. Money is always **paise** (÷100 for rupees).
Two sources: **live tool** (computed in `tools.py`, never stored) or **SQL view**
(`views.sql`, reads stored facts/history).

## Personal dashboard (the 4 demo users)

| Panel | Source | Shape |
|---|---|---|
| Financial health header | view `v_financial_health` ← `GET /money/plan` | `{income_paise, expense_paise, buffer_paise, monthly_surplus_paise, buffer_months, savings_rate_pct, gullak_balance_paise}` |
| Spending breakdown (donut) | view `v_spending_breakdown` ← `GET /money/plan.allocations` | `[{category, amount_paise, pct_of_spend}]` |
| Risk desk (Monte Carlo) | **live** `GET /risk/stress?user_id&loan_emi_paise` | `{p_ruin, months_survivable, hist5:[5], top_action, loan_applied}` |
| Loan / EMI | **live** `POST /compute/emi` | `{emi_paise, total_interest_paise, principal_paise, ...}` |
| Assets | view `v_asset_summary` ← **live** `GET /assets` for per-item | `{asset_count, total_value_paise, projected_value_paise}` + `{assets:[{name,category,value_paise,projected_value_paise}], insight}` |
| Scheme eligibility | **live** `GET /scheme/eligible` (rules, auditable) | `{schemes:[{scheme, eligible, doc_checklist, rule_version}]}` |
| Legacy checklist | **live** `GET /legacy` | `{title, steps:[...]}` |
| Scam alerts | view `v_scam_alerts` ← `POST /scam/check` (now persisted) | `[{created_at, verdict, risk_score, status, sms_preview}]` |
| Gullak (savings jar) | table `gullak` ← `GET/POST /gullak` | `{balance_paise, entries:[{amount_paise, note}]}` |

## Admin / trust view (honest aggregates of real events)

| Panel | Source | Shape |
|---|---|---|
| Fraud trends | view `v_admin_fraud_trends` | `[{verdict, events, avg_risk_score, blocked_count}]` |
| Critic governance | view `v_admin_critic_stats` | `[{critic_status, turns}]` |
| Audit trail / escalations | view `v_chat_audit` (filter `critic_status<>'delivered'`) | `[{created_at, agent, critic_status, critic_reason, tool_calls, text_preview}]` |

> Manager / Educator dashboards are **not** modelled: those modes are not in the
> backend yet. Add them alongside the commented stubs in `migration.sql`.

## Live persistence (now wired)
- `POST /scam/check` writes to `scam_checks`; read it back at `GET /scam/alerts?user_id=`.
- `POST /chat` writes the user + assistant turns to `chat_messages`; read them at
  `GET /chat/history?user_id=`. Both writes are wrapped in try/except so a logging
  failure can never break the user-facing reply. Tables auto-create in db.init_db().

## RAG / ChromaDB — what actually exists
The spec lists ten collections. The running RAG (`rag.py` + `ingest.py`) uses
**one** persistent Chroma collection, `regdocs`, built offline from the SEBI /
NCFE PDFs in `backend/documents/`, embedded with the local GGUF
`nomic-embed-text-v1.5` model. Each chunk stores `{source, page}` metadata so the
Advisor can cite it; retrieval is top-k cosine, k=3.

The other "collections" in the spec (PM-KISAN rules, scheme rules, scam patterns)
are intentionally **not** vector stores — they are deterministic rules in
`tools.py` (`check_schemes`, `scam_check`). That is by design: rules must be
auditable and can never be "talked out of" a verdict, which a similarity search
could. Only add a new Chroma collection when you ingest genuinely unstructured
documents (e.g. a folder of RBI circulars) that need semantic lookup.

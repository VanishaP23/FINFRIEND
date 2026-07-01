-- ===========================================================================
-- ArthSaathi -- views.sql
-- ---------------------------------------------------------------------------
-- Read-only views that shape the raw tables into exactly what each dashboard
-- panel needs, so the frontend (and your Hex/Notion dashboards) can SELECT one
-- view instead of re-deriving math in JS.
--
-- IMPORTANT: views only expose stored facts and SIMPLE derived sums. The heavy,
-- trust-critical numbers (Monte Carlo p_ruin, EMI schedule, scheme eligibility)
-- stay in tools.py and are NOT recreated here -- a view cannot be allowed to
-- become a second, un-audited source of truth. Where a panel needs those, the
-- view exposes the INPUTS the live tool consumes (income, expense, buffer).
-- All money stays in paise; *_rupees columns are convenience only.
-- ===========================================================================

-- ---- PERSONAL DASHBOARD ---------------------------------------------------

-- Financial health header: the numbers the Money screen shows, plus the inputs
-- /risk/stress (Monte Carlo) and loan affordability are computed from.
DROP VIEW IF EXISTS v_financial_health;
CREATE VIEW v_financial_health AS
SELECT
    p.user_id,
    p.name,
    p.language,
    p.income_pattern,
    p.monthly_income_paise,
    p.monthly_expense_paise,
    (p.monthly_income_paise - p.monthly_expense_paise)            AS monthly_surplus_paise,
    p.buffer_paise,
    COALESCE(g.gullak_balance_paise, 0)                            AS gullak_balance_paise,
    -- how many months the cushion alone covers expenses (a friendly proxy; the
    -- real survival estimate is the Monte Carlo run in tools.py)
    ROUND(1.0 * p.buffer_paise / NULLIF(p.monthly_expense_paise, 0), 1) AS buffer_months,
    -- share of income kept each month
    ROUND(100.0 * (p.monthly_income_paise - p.monthly_expense_paise)
          / NULLIF(p.monthly_income_paise, 0), 1)                 AS savings_rate_pct
FROM personas p
LEFT JOIN (
    SELECT user_id, SUM(amount_paise) AS gullak_balance_paise
    FROM gullak GROUP BY user_id
) g ON g.user_id = p.user_id;

-- Spending breakdown for the donut/category list (mirrors db.get_allocations).
DROP VIEW IF EXISTS v_spending_breakdown;
CREATE VIEW v_spending_breakdown AS
SELECT
    t.user_id,
    t.category,
    SUM(t.amount_paise)                                           AS amount_paise,
    ROUND(100.0 * SUM(t.amount_paise)
          / NULLIF((SELECT SUM(amount_paise) FROM transactions x
                    WHERE x.user_id = t.user_id), 0), 1)          AS pct_of_spend
FROM transactions t
GROUP BY t.user_id, t.category;

-- Asset summary + one-year projection (mirrors tools.asset_insight's math:
-- projected = value + value * trend_bps / 10000).
DROP VIEW IF EXISTS v_asset_summary;
CREATE VIEW v_asset_summary AS
SELECT
    a.user_id,
    COUNT(*)                                                      AS asset_count,
    SUM(a.value_paise)                                            AS total_value_paise,
    SUM(a.value_paise + a.value_paise * a.trend_bps / 10000)      AS projected_value_paise
FROM assets a
GROUP BY a.user_id;

-- Scam alerts feed (Threat Shield). Deliberately rupee-free, so the Critic's
-- "no untraceable ₹ amounts" rule never trips on this panel.
DROP VIEW IF EXISTS v_scam_alerts;
CREATE VIEW v_scam_alerts AS
SELECT
    s.user_id,
    s.created_at,
    s.verdict,
    s.risk_score,
    s.status,
    s.language,
    substr(s.sms_text, 1, 80)                                     AS sms_preview
FROM scam_checks s
ORDER BY s.created_at DESC;

-- ---- TRUST LAYER / AUDIT (Personal + Admin) -------------------------------

-- The chat + Critic audit trail. Powers the "every answer is checked" story and
-- the admin escalation list (anything not 'delivered').
DROP VIEW IF EXISTS v_chat_audit;
CREATE VIEW v_chat_audit AS
SELECT
    c.user_id,
    c.created_at,
    c.role,
    c.agent,
    c.critic_status,
    c.critic_reason,
    c.tool_calls,
    substr(c.text, 1, 120)                                        AS text_preview
FROM chat_messages c
ORDER BY c.created_at DESC;

-- ---- ADMIN DASHBOARD (honest aggregates of REAL events) -------------------

-- Fraud trend: how the Threat Shield is performing, derived purely from logged
-- scam_checks (not invented numbers).
DROP VIEW IF EXISTS v_admin_fraud_trends;
CREATE VIEW v_admin_fraud_trends AS
SELECT
    verdict,
    COUNT(*)                                                      AS events,
    ROUND(AVG(risk_score), 1)                                     AS avg_risk_score,
    SUM(CASE WHEN status = 'refused' THEN 1 ELSE 0 END)           AS blocked_count
FROM scam_checks
GROUP BY verdict;

-- Critic governance: how often the trust gate intervened, by status.
DROP VIEW IF EXISTS v_admin_critic_stats;
CREATE VIEW v_admin_critic_stats AS
SELECT
    COALESCE(critic_status, 'n/a')                                AS critic_status,
    COUNT(*)                                                      AS turns
FROM chat_messages
WHERE role = 'assistant'
GROUP BY critic_status;

-- ===========================================================================
-- ArthSaathi -- seed.sql
-- ---------------------------------------------------------------------------
-- The four demo people and their money, EXACTLY as backend/db.py seeds them
-- (so the SQL path and the Python path can never drift), plus a small amount of
-- sample history for the two new panels (scam alerts, chat/Critic audit).
-- All money is in PAISE. Run AFTER schema.sql. Idempotent-ish: re-running will
-- duplicate the history rows, so reset the file first if you re-seed.
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ---- PERSONAS  (user_id, name, persona, income_pattern, income, expense, buffer,
--                 dependents, land_acres, category, is_taxpayer, is_disabled, language) ----
INSERT INTO personas VALUES
  (1, 'Priya',  'salaried teacher',              'stable',    4800000, 3600000, 22000000, 2, 0, 'salaried',      1, 0, 'hi'),
  (2, 'Rajesh', 'gig delivery rider',            'volatile',  2800000, 2400000,  1500000, 2, 0, 'gig',           0, 0, 'hi'),
  (3, 'Kisan',  'seasonal farmer',               'seasonal',  1500000, 1200000,  2000000, 4, 3, 'farmer',        0, 0, 'kn'),
  (4, 'Divya',  'freelance writer (low vision)', 'irregular', 1800000, 1400000,  4000000, 0, 0, 'self-employed', 0, 1, 'en');

-- ---- ASSETS  (user_id, name, category, value_paise, trend_bps) ----
INSERT INTO assets VALUES
  (1, 'Mutual fund SIP',           'investment',  28000000,  1100),
  (1, 'EPF balance',               'investment',  21000000,   800),
  (1, 'Gold',                      'gold',         9000000,   600),
  (2, 'Motorbike',                 'vehicle',      6500000, -1200),
  (2, 'Smartphone',                'electronics',  1400000, -2500),
  (2, 'Recurring deposit',         'investment',   1200000,   400),
  (3, 'Farm land (3 acres)',       'land',       150000000,   800),
  (3, 'Tractor',                   'vehicle',     80000000,  -500),
  (3, 'Gold',                      'gold',        40000000,   600),
  (4, 'Craft / writing equipment', 'equipment',    5500000,   200),
  (4, 'Recurring deposit',         'investment',   6000000,   700),
  (4, 'Gold',                      'gold',        11000000,   600);

-- ---- TRANSACTIONS  (monthly spend per category; sums to each monthly_expense) ----
INSERT INTO transactions (user_id, category, amount_paise) VALUES
  (1, 'rent', 1400000), (1, 'food', 800000), (1, 'school fees', 500000),
  (1, 'transport', 300000), (1, 'utilities', 300000), (1, 'insurance', 300000),
  (2, 'rent', 800000), (2, 'food', 700000), (2, 'fuel', 500000),
  (2, 'phone & data', 150000), (2, 'bike EMI', 250000),
  (3, 'seeds & inputs', 350000), (3, 'food', 400000), (3, 'home', 200000),
  (3, 'diesel', 150000), (3, 'school', 100000),
  (4, 'rent', 500000), (4, 'food', 450000), (4, 'materials', 250000),
  (4, 'utilities', 100000), (4, 'transport', 100000);

-- ---- GULLAK  (starting savings jar per person) ----
INSERT INTO gullak (user_id, amount_paise, note) VALUES
  (1, 500000, 'monthly SIP top-up'),
  (2, 150000, 'after a good week'),
  (3, 100000, 'after selling crop'),
  (4, 400000, 'craft sale savings');

-- ===========================================================================
-- SAMPLE HISTORY for the new panels. Scores follow tools.scam_check's rules
-- exactly (link +40, otp/pin +30, won/prize/lottery +20, block/suspend/kyc/
-- expire +30, urgent/immediately/now +20; >=60 scam, >=30 suspicious).
-- ===========================================================================

-- ---- scam_checks (Threat Shield feed) ----
INSERT INTO scam_checks (user_id, sms_text, risk_score, verdict, language, status, created_at) VALUES
  (3, 'Your account is BLOCKED, verify KYC at http://x.in/ and share OTP', 100, 'scam',       'kn', 'refused',   '2026-06-27 09:12:00'),
  (3, 'Congratulations! You WON a lottery prize, claim now',                40, 'suspicious', 'kn', 'delivered', '2026-06-27 18:40:00'),
  (2, 'Claim your delivery bonus, click bit.ly/xyz now',                    60, 'scam',       'hi', 'refused',   '2026-06-28 08:05:00'),
  (4, 'Your bank password will expire, verify here www.bank-x',            100, 'scam',       'en', 'refused',   '2026-06-28 10:21:00'),
  (1, 'Reminder: parent-teacher meeting at 4pm today',                       0, 'safe',       'hi', 'delivered', '2026-06-28 11:00:00');

-- ---- chat_messages (Advisor + Critic audit trail) ----
-- The signature trust demo: a tempting "guaranteed returns" reply carrying a
-- number NO tool produced -> the Critic refuses it.
INSERT INTO chat_messages (user_id, role, text, agent, tool_calls, citations, critic_status, critic_reason, language, created_at) VALUES
  (3, 'user',      'can you guarantee me double returns?',                                                                              NULL,      NULL,                NULL, NULL,        NULL,                              'kn', '2026-06-28 09:30:00'),
  (3, 'assistant', 'Yes, you can double your money with guaranteed returns of ₹9,99,999 and absolutely no risk.',                       'advisor', '[]',                '[]', 'refused',   'untraceable number ₹9,99,999',    'kn', '2026-06-28 09:30:01'),
  (3, 'user',      'I want a 50000 loan',                                                                                               NULL,      NULL,                NULL, NULL,        NULL,                              'kn', '2026-06-28 09:32:00'),
  (3, 'assistant', 'For a ₹50,000 loan at 12% over 12 months, your EMI is about ₹4,442 per month, and the total interest is about ₹3,304.', 'advisor', '["compute_emi"]',   '[]', 'delivered', 'ok',                              'kn', '2026-06-28 09:32:01'),
  (2, 'user',      'will my money survive the year?',                                                                                   NULL,      NULL,                NULL, NULL,        NULL,                              'hi', '2026-06-28 09:40:00'),
  (2, 'assistant', 'In 1,000 simulations, your money lasts about 5 months, and the chance of running out within a year is high. Build a one-month emergency buffer to lower your risk.', 'risk', '["monte_carlo"]', '[]', 'delivered', 'ok', 'hi', '2026-06-28 09:40:01');

# backend/skills.py
# ---------------------------------------------------------------------------
# THE SKILL REGISTRY.
#
# A "skill" here is one user-facing thing this AI employee can do, described in
# plain words: a title, what it does, example questions, the AGENT that runs it,
# and the deterministic TOOLS it relies on. This file adds NO new logic -- every
# skill points at an agent already in agents.py and tools already in tools.py.
# It just makes the system DISCOVERABLE and easy to explain:
#   * the dashboard can show "here are my skills",
#   * GET /skills serves the list to any client,
#   * mcp_server.py exposes the same list over MCP, so any external agent
#     (including KakushIN) can see what ArthSaathi can do.
#
# The `agent` field is the key returned by the router in agents.py, so a skill
# and the agent that fulfils it are always kept in sync (one source of truth).
# ---------------------------------------------------------------------------

SKILLS = [
    {
        "id": "loan_advisor", "title": "Loan & EMI Advisor", "agent": "advisor",
        "description": "Works out the EMI and total interest on a loan, and whether it is affordable.",
        "examples": ["Can I afford a 50,000 loan?", "What is the EMI on 1 lakh for 2 years?"],
        "tools": ["compute_emi"], "channels": ["app", "whatsapp", "voice"],
    },
    {
        "id": "risk_radar", "title": "Money Survival Check", "agent": "risk",
        "description": "Runs 1,000 simulations of the year to estimate the chance of running out of money.",
        "examples": ["Will my money last the year?", "Can I survive a bad season?"],
        "tools": ["monte_carlo"], "channels": ["app", "voice"],
    },
    {
        "id": "scam_shield", "title": "Scam Shield", "agent": "scam",
        "description": "Scores an SMS for fraud in English, Hindi or Kannada and tells the user WHY it was flagged.",
        "examples": ["Is this KYC message a scam?", "I won a lottery, is it real?"],
        "tools": ["scam_check"], "channels": ["app", "whatsapp", "sms", "voice"],
    },
    {
        "id": "scheme_finder", "title": "Govt Scheme Finder", "agent": "scheme",
        "description": "Checks eligibility for government schemes from auditable rules and lists the documents needed.",
        "examples": ["Any government scheme for me?", "Am I eligible for PM-KISAN?"],
        "tools": ["check_schemes"], "channels": ["app", "whatsapp", "voice", "assisted_centre"],
    },
    {
        "id": "asset_guardian", "title": "Asset Guardian", "agent": "asset",
        "description": "Projects each asset a year forward and flags what is growing or losing value.",
        "examples": ["How are my assets doing?", "Is my gold worth holding?"],
        "tools": ["asset_insight"], "channels": ["app"],
    },
    {
        "id": "legacy_guardian", "title": "Legacy Guardian", "agent": "legacy",
        "description": "Gives a simple nominee / inheritance checklist so a family is protected.",
        "examples": ["How do I add a nominee?", "What happens to my land after me?"],
        "tools": ["legacy_plan"], "channels": ["app", "assisted_centre"],
    },
    {
        "id": "money_coach", "title": "Money Coach", "agent": "general",
        "description": "Answers general money questions from verified SEBI / NCFE material (RAG), with citations.",
        "examples": ["What is a SIP?", "How much emergency savings should I keep?"],
        "tools": ["search_facts"], "channels": ["app", "whatsapp", "voice"],
    },
]

_BY_ID = {s["id"]: s for s in SKILLS}
_BY_AGENT = {s["agent"]: s for s in SKILLS}


def list_skills():
    """Public metadata for every skill (for the dashboard, /skills, and MCP)."""
    return SKILLS


def get_skill(skill_id):
    """One skill by its id, or None."""
    return _BY_ID.get(skill_id)


def skill_for_agent(agent_key):
    """Map an agent (what the router returns) back to its public skill, so the
    chat reply can show which named skill handled the message."""
    return _BY_AGENT.get(agent_key)


def select_skill(text):
    """Pick the best skill for a message. Uses the LLM tool-selection when a chat
    model is configured, otherwise the deterministic keyword router -- the SAME
    selector the live chat uses, so this can never disagree with a real reply."""
    from agents import plan_route          # imported here to avoid a heavy import
    skill = _BY_AGENT.get(plan_route(text))
    return skill["id"] if skill else "money_coach"


# ---- quick self-test: run `python skills.py` ----
if __name__ == "__main__":
    print(f"{len(SKILLS)} skills registered:")
    for s in list_skills():
        print(f"  - {s['title']:22} (id={s['id']}, agent={s['agent']}, tools={s['tools']})")
    for q in ["can I afford a 50000 loan", "is this OTP link a scam?", "what is a sip"]:
        print(f"\n  route  '{q}'  ->  {select_skill(q)}")

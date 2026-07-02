# ===========================================================================
# ArthSaathi · tools.py  =  THE MATH
#   deterministic numbers + tool registry. The ONLY source of rupees.
#   PIPELINE:  guard -> plan -> agent -> compose -> critic -> respond
# ===========================================================================
# backend/tools.py
# ---------------------------------------------------------------------------
# The "truth layer". Every NUMBER in the whole app is born here, in plain
# Python. No AI, no database, no internet. These functions are deterministic:
# the same input always gives the same output. That is what lets the Critic
# (in agents.py) trust these numbers and refuse anything the AI makes up.
# Money is always an integer number of paise (1 rupee = 100 paise).
# ---------------------------------------------------------------------------

import os
import re
import json
import random
from decimal import Decimal, ROUND_HALF_UP


def fmt(paise):
    """Turn an integer paise amount into a rupee string like '₹1,23,456'
    using the Indian comma system (last 3 digits, then groups of 2)."""
    rupees = paise // 100                      # drop paise, keep whole rupees
    s = str(rupees)
    if len(s) <= 3:
        grouped = s
    else:
        last3 = s[-3:]
        rest = s[:-3]
        # put a comma before every pair of digits, counting from the right
        rest = re.sub(r"(?<=\d)(?=(\d\d)+$)", ",", rest)
        grouped = rest + "," + last3
    return "₹" + grouped


def compute_emi(principal_paise, annual_rate_bps, months):
    """Standard EMI formula. Rate comes in as basis points (1% = 100 bps),
    money as paise. We use Decimal so there are no float rounding bugs."""
    P = Decimal(principal_paise)
    # annual_rate_bps / 120000 = the monthly interest rate as a fraction.
    # (divide by 10000 to go bps -> yearly fraction, then by 12 for monthly)
    r = Decimal(annual_rate_bps) / Decimal(120000)
    n = months
    if r == 0:                                 # an interest-free loan
        emi = P / n
    else:
        factor = (1 + r) ** n
        emi = P * r * factor / (factor - 1)
    emi_paise = int(emi.quantize(Decimal(1), rounding=ROUND_HALF_UP))
    total_interest_paise = emi_paise * n - principal_paise
    return {
        "emi_paise": emi_paise,
        "total_interest_paise": total_interest_paise,
        "principal_paise": principal_paise,
        "annual_rate_bps": annual_rate_bps,
        "months": months,
    }


def monte_carlo(income_paise, expense_paise, buffer_paise, runs=1000, months=12, seed=42):
    """Run many imaginary 'years' for one person to estimate how risky their
    money situation is. Income wobbles each month and there is a small chance
    of a very bad month (lost income). We count how often they run out of money.
    A fixed seed means the result is identical every time we run it."""

    def ruin_rate(monthly_expense):
        # re-seed inside so the base run and the 'what-if' run see the SAME luck
        random.seed(seed)
        income = income_paise / 100            # work in rupees; this is an estimate
        start = buffer_paise / 100
        ruined = 0
        survived_counts = [0] * (months + 1)   # histogram: months survived -> count
        survived_list = []
        for _ in range(runs):
            balance = start
            survived = months
            for m in range(months):
                balance += income * random.uniform(0.6, 1.2) - monthly_expense
                if random.random() < 0.10:     # 10% chance of a bad month
                    balance -= income          # lose roughly one month's income
                if balance < 0:                # ran out of money
                    survived = m
                    break
            survived_counts[survived] += 1
            survived_list.append(survived)
            if survived < months:
                ruined += 1
        return ruined / runs, survived_counts, survived_list

    base_expense = expense_paise / 100
    p_ruin, histogram, survived_list = ruin_rate(base_expense)

    survived_list.sort()
    months_survivable = survived_list[runs // 2]          # the median run

    # "top action": would spending 10% less clearly help? compare the two risks
    p_ruin_better, _, _ = ruin_rate(base_expense * 0.9)
    if p_ruin_better < p_ruin - 0.01:
        top_action = "Cut monthly expenses by about 10% to survive noticeably longer."
    else:
        top_action = "Build a one-month emergency buffer to lower your risk."

    return {
        "p_ruin": round(p_ruin, 3),
        "months_survivable": months_survivable,
        "histogram": histogram,
        "top_action": top_action,
    }


def stress_recommendation(income_paise, expense_paise, buffer_paise, base):
    """Pick the ONE change that most lowers the chance of running out of money,
    with real before/after numbers from the same Monte Carlo (never guessed).
    `base` is the monte_carlo(...) result for the person's current situation.
    Returns a dict the UI can render directly, or {"has_action": False}."""
    base_ruin = base["p_ruin"]
    base_months = base["months_survivable"]

    # Candidate A: build an emergency buffer ~ two months of expenses, rounded
    # to the nearest 500 rupees (50000 paise), at least 500 rupees.
    top_up_paise = max(50000, round((2 * expense_paise - buffer_paise) / 50000) * 50000)
    mc_buffer = monte_carlo(income_paise, expense_paise, buffer_paise + top_up_paise)

    # Candidate B: cut monthly spending by about 10%.
    cut_paise = int(round(expense_paise * 0.10))
    mc_cut = monte_carlo(income_paise, expense_paise - cut_paise, buffer_paise)

    candidates = [
        ("buffer", "Save " + fmt(top_up_paise) + " as a buffer", top_up_paise, mc_buffer),
        ("cut",    "Cut monthly spending by about " + fmt(cut_paise), cut_paise, mc_cut),
    ]
    kind, label, amount_paise, mc = min(candidates, key=lambda c: c[3]["p_ruin"])

    # If nothing meaningfully helps, say so rather than inventing a benefit.
    if mc["p_ruin"] >= base_ruin - 0.005:
        return {"has_action": False}

    return {
        "has_action": True,
        "kind": kind,
        "label": label,
        "amount_paise": amount_paise,
        "months_before": base_months,
        "months_after": mc["months_survivable"],
        "ruin_before": round(base_ruin * 100),
        "ruin_after": round(mc["p_ruin"] * 100),
    }


def asset_insight(assets):
    """Project each asset one year forward using its trend, and give one plain
    sentence about the asset that is growing the most.
    Each asset: {name, category, value_paise, trend_bps}."""
    out = []
    for a in assets:
        # trend_bps is yearly growth in basis points (800 = +8%, -500 = -5%)
        projected = a["value_paise"] + a["value_paise"] * a["trend_bps"] // 10000
        item = dict(a)
        item["projected_value_paise"] = projected
        out.append(item)

    if not assets:
        return {"assets": [], "insight": "No assets are recorded yet. Add some to see how they may grow."}

    best = max(assets, key=lambda x: x["trend_bps"])
    if best["trend_bps"] > 0:
        insight = (f"Your {best['name']} is likely to rise about "
                   f"{best['trend_bps'] // 100}% this year. It may be worth holding it.")
    else:
        insight = (f"Your {best['name']} may lose value this year. "
                   f"It could be worth reviewing whether to keep it.")
    return {"assets": out, "insight": insight}


def legacy_plan(profile):
    """The Legacy Guardian agent (basic). Returns a simple, guided checklist so a
    family is protected and assets pass on safely. No AI, no database."""
    steps = [
        "Add a nominee to every bank account.",
        "Write a simple list of all assets and where the documents are kept.",
        "Add a nominee to insurance and EPF / PF accounts.",
        "Tell one trusted family member where this list is kept.",
    ]
    if profile.get("land_acres", 0) > 0:
        steps.append("Make a basic will, since you own land or property.")
    return {"title": "Legacy Guardian checklist", "steps": steps}


# ---------------------------------------------------------------------------
# THE PARIVAR PATRA (Family Card). Built for the families left searching:
# one deterministic page listing every asset, the exact route to claim it,
# and the documents needed. No AI in this function; every line is traceable,
# so the card can be printed and taken to a bank or ward office as-is.
# ---------------------------------------------------------------------------
_CLAIM_ROUTES = {
    # category -> (where survivors claim it, documents needed)
    "investment":  ("Bank / AMC branch: deceased-claim or transmission form. "
                    "Unclaimed deposits: search the RBI UDGAM portal. Unclaimed shares/dividends: IEPF.",
                    ["Death certificate", "Nominee ID or legal-heir certificate", "Account/folio number", "Claim form"]),
    "gold":        ("Physically held gold passes to legal heirs. If pledged for a gold loan, settle or transfer the loan at the lender first.",
                    ["Death certificate", "Legal-heir certificate", "Loan/pledge receipt if pledged"]),
    "land":        ("Tehsil / ward office: mutation of land records to the heirs (varisan). A will simplifies this greatly.",
                    ["Death certificate", "Legal-heir or succession certificate", "Land record (khasra/khata)", "Aadhaar of heirs"]),
    "vehicle":     ("RTO: transfer of registration to the heir. Insurer: transfer or close the policy.",
                    ["Death certificate", "RC book", "Legal-heir certificate", "Insurance policy"]),
    "livestock":   ("Passes to the family directly; update any livestock insurance with the insurer.",
                    ["Death certificate", "Insurance papers if insured"]),
    "equipment":   ("Passes to the family directly; transfer any loan against it at the lender.",
                    ["Death certificate", "Loan papers if financed"]),
    "electronics": ("Passes to the family directly.",
                    ["None"]),
    "inventory":   ("Business stock passes with the business; inform suppliers and settle credit lines.",
                    ["Death certificate", "Business registration if any"]),
}
_DEFAULT_ROUTE = ("Ask at the nearest bank branch or ward office with the documents listed.",
                  ["Death certificate", "Legal-heir certificate"])


def family_card(profile, assets):
    """The Parivar Patra: every asset with its claim route + documents, plus
    the universal after-death steps (EPF, insurance, UDGAM/IEPF, closures).
    Deterministic. Money in paise; fmt() renders the display values."""
    items, total = [], 0
    for a in assets:
        cat = (a.get("category") or "").lower()
        route, docs = _CLAIM_ROUTES.get(cat, _DEFAULT_ROUTE)
        total += a.get("value_paise", 0)
        items.append({
            "name": a.get("name", ""), "category": cat,
            "value_paise": a.get("value_paise", 0), "value": fmt(a.get("value_paise", 0)),
            "claim_route": route, "documents": docs,
        })
    universal = [
        "Get 10+ certified copies of the death certificate (every claim needs one).",
        "EPF / pension: file Form 20 / 10D at the employer or the EPFO office.",
        "Life insurance (incl. PMJJBY) and accident cover (PMSBY): claim at the bank / insurer.",
        "Search RBI UDGAM for unclaimed bank deposits and IEPF for unclaimed shares in the person's name.",
        "Bank accounts: a nominee claims directly; without a nominee a legal-heir certificate is needed.",
        "Close or transfer SIM, electricity and subscriptions to stop silent auto-debits.",
    ]
    return {
        "title": "Parivar Patra (Family Card)",
        "for": profile.get("name", ""),
        "assets": items,
        "asset_count": len(items),
        "total_value_paise": total,
        "total_value": fmt(total),
        "universal_steps": universal,
        "note": ("Every line above comes from recorded facts and fixed rules, never guessed. "
                 "Print this page and carry it to the bank or ward office."),
    }


# ---------------------------------------------------------------------------
# SCHEME RULES as DATA (not buried in if-blocks). Each entry: the scheme name,
# a predicate profile->bool, the documents to keep ready, a version stamp, and
# the reason shown when eligible / not. Thresholds for real schemes change over
# time, so treat these as a demo-grade, versioned rule set, not legal advice.
# Profiles use is_taxpayer / is_disabled as 0/1 ints and land_acres / category.
# ---------------------------------------------------------------------------
def _unorganised(p):
    # broad "unorganised sector" worker check used by e-Shram / APY
    return p.get("category") in ("gig", "farmer", "self-employed")


SCHEMES = [
    {
        "scheme": "PM-KISAN",
        "eligible": lambda p: (p.get("land_acres", 0) > 0
                               and p.get("category") == "farmer"
                               and not p.get("is_taxpayer")),
        "docs": ["Aadhaar", "Land record (khasra)", "Bank passbook"],
        "rule_version": "pm-kisan-2024.1",
        "why_yes": "you farm land in your own name and are not an income-tax payer",
        "why_no": lambda p: ("you are registered as an income-tax payer" if p.get("is_taxpayer")
                             else "no farm land is recorded on your profile" if p.get("land_acres", 0) == 0
                             else "this scheme is only for farmers"),
    },
    {
        "scheme": "Disability Pension (NSAP)",
        "eligible": lambda p: bool(p.get("is_disabled")),
        "docs": ["Aadhaar", "Disability certificate", "Bank passbook", "Income certificate"],
        "rule_version": "nsap-2024.1",
        "why_yes": "you have a disability recorded, which this pension supports",
        "why_no": lambda p: "no disability is recorded on your profile",
    },
    {
        "scheme": "e-Shram card",
        "eligible": lambda p: _unorganised(p) and not p.get("is_taxpayer"),
        "docs": ["Aadhaar", "Bank passbook", "Mobile number linked to Aadhaar"],
        "rule_version": "eshram-2024.1",
        "why_yes": "you are an unorganised-sector worker and not an income-tax payer",
        "why_no": lambda p: ("income-tax payers are not covered" if p.get("is_taxpayer")
                             else "this is for unorganised-sector workers (gig, farming, self-employed)"),
    },
    {
        "scheme": "Atal Pension Yojana (APY)",
        "eligible": lambda p: not p.get("is_taxpayer"),
        "docs": ["Aadhaar", "Bank account", "Mobile number"],
        "rule_version": "apy-2024.1",
        "why_yes": "as a non-taxpayer with a bank account you can build a guaranteed pension (assumes age 18-40)",
        "why_no": lambda p: "income-tax payers have not been eligible to join since 2022",
    },
    {
        "scheme": "PMSBY accident cover",
        "eligible": lambda p: True,   # near-universal: ~Rs.20/year cover for any bank-account holder 18-70
        "docs": ["Aadhaar", "Bank account (auto-debit consent)"],
        "rule_version": "pmsby-2024.1",
        "why_yes": "this very low-cost accident cover is open to almost any bank-account holder",
        "why_no": lambda p: "not applicable",
    },
]


def check_schemes(profile):
    """The scheme-eligibility engine. Government rules, NOT the AI, decide this,
    so every answer is auditable and can be re-checked later. The rules live in
    the SCHEMES list above as data, so adding a scheme is ONE entry, not new
    if-blocks. For every scheme we return WHY (eligible or not), so the screen
    can show a citeable reason instead of a silent yes/no."""
    out = []
    for s in SCHEMES:
        ok = bool(s["eligible"](profile))
        out.append({
            "scheme": s["scheme"],
            "eligible": ok,
            "doc_checklist": s["docs"] if ok else [],
            "reason": s["why_yes"] if ok else s["why_no"](profile),  # the citeable "why"
            "rule_version": s["rule_version"],
        })
    return {"schemes": out, "rule_version": "arthsaathi-rules-2024.1"}


# pre-written scam warnings, by verdict and language (no AI needed -> reliable + free)
_WARNINGS = {
    "en": {
        "scam": "This looks like a scam. Do not click any link, do not share your OTP or PIN, and do not pay anyone. If unsure, call your bank using the number printed on your card.",
        "suspicious": "This message looks suspicious. Please be careful. Do not share any OTP or password, and check with the official source before acting.",
        "safe": "This message looks safe. Even so, never share your OTP or PIN with anyone.",
    },
    "hi": {
        "scam": "यह एक धोखाधड़ी लगती है। किसी भी लिंक पर क्लिक न करें, अपना OTP या PIN किसी को न बताएं, और किसी को पैसे न दें। संदेह हो तो अपने कार्ड पर लिखे नंबर से बैंक को कॉल करें।",
        "suspicious": "यह संदेश संदिग्ध लगता है। कृपया सावधान रहें। अपना OTP या पासवर्ड किसी को न बताएं और कुछ भी करने से पहले आधिकारिक स्रोत से जांच करें।",
        "safe": "यह संदेश सुरक्षित लगता है। फिर भी, अपना OTP या PIN किसी को कभी न बताएं।",
    },
}


# ---------------------------------------------------------------------------
# SCAM SIGNALS as DATA, MULTILINGUAL. Each bucket: (points, [keywords across
# en / hi / kn]). Deterministic on purpose -> a real scam, in any of our
# languages, can never be "talked out of" a flag, and we return WHICH buckets
# matched so the UI can show the user *why*. English-only keywords would
# silently miss Hindi/Kannada scams and break our remove-the-language-barrier claim.
# ---------------------------------------------------------------------------
SCAM_SIGNALS = {
    "link":    (40, ["http", "www", "bit.ly", "tinyurl", ".in/"]),
    "secret":  (30, ["otp", "pin", "cvv", "password",
                     "ओटीपी", "पिन", "पासवर्ड",
                     "ओटिपि", "पास्‌वर्ड्"]),
    "prize":   (20, ["won", "win", "prize", "lottery", "reward",
                     "इनाम", "लॉटरी", "जीत"]),
    "threat":  (30, ["block", "suspend", "kyc", "expire", "deactivat", "fraud",
                     "ब्लॉक", "केवाईसी", "बंद", "समाप्त"]),
    "urgency": (20, ["urgent", "immediately", "now", "hurry",
                     "तुरंत", "अभी", "जल्दी"]),
}

# short, human "why" label per bucket, in each language (for the warning chips)
_REASON_LABEL = {
    "en": {"link": "contains a link", "secret": "asks for OTP/PIN", "prize": "promises a prize",
           "threat": "threatens block/KYC", "urgency": "creates urgency", "number": "gives a number to call"},
    "hi": {"link": "लिंक है", "secret": "OTP/PIN माँग रहा है", "prize": "इनाम का लालच",
           "threat": "ब्लॉक/KYC की धमकी", "urgency": "जल्दबाज़ी का दबाव", "number": "कॉल करने को नंबर"},
}


def scam_check(sms_text, language="en"):
    """The Threat Shield agent. Scores a message for scam risk using fixed,
    MULTILINGUAL rules (so a real scam, in any of our languages, can never be
    'talked out of' being flagged), then returns a ready-made warning in the
    user's language AND the list of reasons it was flagged."""
    t = sms_text.lower()                       # lower() is harmless for hi/kn scripts
    lang = language if language in _WARNINGS else "en"

    score = 0
    matched = []                               # which buckets fired, for the "why"
    for bucket, (points, keywords) in SCAM_SIGNALS.items():
        if any(kw in t for kw in keywords):
            score += points
            matched.append(bucket)
    # a long digit run (6-12) is usually an OTP code or a callback number to "share"
    if re.search(r"\d{6,12}", t):
        score += 10
        matched.append("number")
    score = min(score, 100)

    if score >= 60:
        verdict = "scam"
    elif score >= 30:
        verdict = "suspicious"
    else:
        verdict = "safe"

    reasons = [_REASON_LABEL[lang].get(b, b) for b in matched]   # human, in-language
    return {
        "risk_score": score,
        "verdict": verdict,
        "warning_message": _WARNINGS[lang][verdict],
        "reasons": reasons,                    # NEW: shows the user WHY (transparency)
        "status": "refused" if verdict == "scam" else "delivered",
    }


# ---- quick self-test: run `python tools.py` to check everything works ----
if __name__ == "__main__":
    print("fmt:", fmt(15000000), fmt(150000000))
    print("emi:", compute_emi(5000000, 1200, 12))
    print("monte_carlo:", monte_carlo(1500000, 1200000, 2000000))
    print("assets:", asset_insight([{"name": "Land", "category": "land", "value_paise": 150000000, "trend_bps": 800}]))
    print("schemes:", check_schemes({"land_acres": 3, "category": "farmer", "is_taxpayer": 0, "is_disabled": 0}))
    print("scam:", scam_check("Your account is BLOCKED, verify KYC at http://x.in/ and share OTP", "en")["verdict"])
    print("facts:", "(RAG lives in rag.py now — run: python rag.py)")


# ===========================================================================
# TOOL REGISTRY  (folded in from the old toolbox.py).
# A "tool" = a plain function above, wrapped with a name + description. Agents
# call call_tool(name, **args) so there is ONE place tool calls happen (easy to
# log, list, and expose over MCP). Add a capability = add one line to TOOLS.
# ===========================================================================
from dataclasses import dataclass as _dataclass
from typing import Callable as _Callable


@_dataclass
class Tool:
    name: str
    description: str
    inputs: str
    func: _Callable


TOOLS = {
    "compute_emi":  Tool("compute_emi",  "Monthly EMI and total interest for a loan.",
                         "principal_paise, annual_rate_bps, months", compute_emi),
    "monte_carlo":  Tool("monte_carlo",  "Simulate 1,000 'years' to estimate running-out-of-money risk.",
                         "income_paise, expense_paise, buffer_paise", monte_carlo),
    "asset_insight":Tool("asset_insight","Project each asset one year forward; flag best/worst.",
                         "assets[]", asset_insight),
    "check_schemes":Tool("check_schemes","Decide government-scheme eligibility from fixed rules.",
                         "profile", check_schemes),
    "scam_check":   Tool("scam_check",   "Score an SMS for scam risk and return a warning.",
                         "sms_text, language", scam_check),
    "legacy_plan":  Tool("legacy_plan",  "A simple inheritance / nominee checklist.",
                         "profile", legacy_plan),
    "family_card":  Tool("family_card",  "Parivar Patra: per-asset claim routes + documents for survivors.",
                         "profile, assets", family_card),
}


def call_tool(name, **kwargs):
    """The single entry point for tool calls. Raises if the tool is unknown."""
    if name not in TOOLS:
        raise KeyError(f"no tool named {name!r}")
    return TOOLS[name].func(**kwargs)


def list_tools():
    """Describe every tool (for the MCP server and the demo)."""
    return [{"name": t.name, "description": t.description, "inputs": t.inputs}
            for t in TOOLS.values()]
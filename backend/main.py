# ===========================================================================
# ArthSaathi · main.py  =  THE API
#   FastAPI doors: /chat · /agent/{name} · feature endpoints · /health.
#   PIPELINE:  guard -> plan -> agent -> compose -> critic -> respond
# ===========================================================================
# backend/main.py
# ---------------------------------------------------------------------------
# The web server (FastAPI). It turns our Python functions into URLs that the
# React frontend calls. It does NO business logic itself: every route reads
# from the database (db.py), runs a tool (tools.py) / agent (agents.py), or
# the vector RAG (rag.py) / local voice model (voice.py).
# Start it with:  uvicorn main:app --reload    (then open http://localhost:8000/docs)
# ---------------------------------------------------------------------------

import os
import re
import shutil
import tempfile
from pathlib import Path

from starlette.background import BackgroundTask
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from tools import compute_emi, monte_carlo, asset_insight, legacy_plan, check_schemes, scam_check, stress_recommendation
from agents import handle_chat, ask_llm
import agents as agent_module
import db
import rag
import voice
import skills
import guardrails
import llm

app = FastAPI(title="ArthSaathi API")

# allow the React dev server (a different port) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# build the relational database (people + money) on startup. The RAG vector
# index is built separately and offline by ingest.py (see RUNBOOK_GGUF.md).
db.init_db()


# ---- request shapes (these are what make the /docs page look professional) ----
class ChatIn(BaseModel):
    user_id: int
    text: str
    language: str = "en"
    channel: str = "chat"


class EmiIn(BaseModel):
    principal_paise: int
    annual_rate_bps: int
    months: int


class GullakIn(BaseModel):
    user_id: int
    amount_paise: int
    note: str = ""


class ScamIn(BaseModel):
    user_id: int
    sms_text: str
    language: str = "en"


class AgentIn(BaseModel):
    user_id: int
    text: str
    language: str = "en"


class SpeakIn(BaseModel):
    text: str
    language: str = "en"


class AuthStartIn(BaseModel):
    identifier: str
    provider: str = "otp"


class AuthVerifyIn(BaseModel):
    identifier: str
    otp: str
    name: str = ""
    provider: str = "otp"


UPLOAD_DIR = Path(os.path.dirname(__file__)) / "uploads"
ALLOWED_DOC_TYPES = {"aadhaar", "pan", "registry", "passport", "bank_statement"}
ALLOWED_CONTENT_TYPES = {"application/pdf", "image/png", "image/jpeg"}


def _should_use_saved_context(text):
    """Only bring memory into the LLM when the user asks for prior/personal info."""
    t = text.lower()
    cues = [
        "remember", "previous", "earlier", "last time", "what did i",
        "i told", "my detail", "my details", "my context", "my expense",
        "expenses for today", "spent today", "today's expense", "today expense",
        "my aadhaar", "my aadhar", "my pan", "my document", "uploaded",
    ]
    return any(cue in t for cue in cues)


def _extract_document_text(path, content_type):
    if content_type == "application/pdf":
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                return "\n".join((page.extract_text() or "") for page in pdf.pages).strip()
        except Exception:
            return ""
    return ""


def _rupees_to_paise(raw):
    """'1,23,456.78' or 'Rs. 45,000' -> integer paise. Returns None on junk."""
    cleaned = re.sub(r"[^\d.]", "", raw or "")
    if not cleaned:
        return None
    try:
        return int(round(float(cleaned) * 100))
    except ValueError:
        return None


def _extract_document_fields(doc_type, text):
    compact = re.sub(r"\s+", " ", text or "")
    fields = {}
    if doc_type == "aadhaar":
        match = re.search(r"\b(\d{4}\s?\d{4}\s?\d{4})\b", compact)
        if match:
            fields["aadhaar_number"] = re.sub(r"\s+", " ", match.group(1)).strip()
    if doc_type == "pan":
        match = re.search(r"\b([A-Z]{5}\d{4}[A-Z])\b", compact.upper())
        if match:
            fields["pan_number"] = match.group(1)
    if doc_type == "bank_statement":
        # heuristic: read the labelled summary lines most statements carry.
        # closing/available balance -> emergency buffer; credit/debit totals ->
        # monthly income/expense. Keys match personas columns so the write-back
        # in db.apply_profile_fields() can land them straight on the profile.
        amount = r"([0-9][0-9,]*\.?[0-9]{0,2})"
        patterns = {
            "buffer_paise": r"(?:closing|available)\s+balance[^0-9]{0,15}" + amount,
            "monthly_income_paise": r"(?:total\s+credits?|salary|credits?)[^0-9]{0,15}" + amount,
            "monthly_expense_paise": r"(?:total\s+debits?|withdrawals?|debits?)[^0-9]{0,15}" + amount,
        }
        for key, pat in patterns.items():
            m = re.search(pat, compact, re.I)
            if m:
                paise = _rupees_to_paise(m.group(1))
                if paise is not None:
                    fields[key] = paise
    return fields


# "I just spent 500 rs on food" -> log it. Requires a spend verb + amount +
# on/for + a category word, so ordinary questions do not trigger a false write.
_EXPENSE_RE = re.compile(
    r"(?:spent|spend|paid)"
    r"[^\d₹]{0,8}?"                                 # optional filler: 'a', 'about', 'rs'
    r"(?:₹|rs\.?|inr)?\s*"
    r"([0-9][0-9,]*(?:\.[0-9]{1,2})?)"             # the amount
    r"\s*(?:rs\.?|rupees?|₹|inr)?"
    r"\s+(?:on|for|towards)\s+"
    r"([a-zA-Z][a-zA-Z ]*?)"                        # the category
    r"(?:\s+(?:today|yesterday|just|now|please)\b|[.!?,]|$)",
    re.I,
)


def _parse_expense(text):
    """Pull (category, amount_paise) out of a spend sentence, or None."""
    m = _EXPENSE_RE.search(text or "")
    if not m:
        return None
    paise = _rupees_to_paise(m.group(1))
    if not paise or paise <= 0:
        return None
    category = re.sub(r"\s+", " ", m.group(2)).strip().lower()[:30] or "other"
    return category, paise


def _expense_log_reply(user_id, text):
    """If the message is a spend, write it to transactions and confirm. Returns a
    reply dict in the standard shape, or None so chat routing continues normally."""
    parsed = _parse_expense(text)
    if not parsed:
        return None
    category, paise = parsed
    db.add_transaction(user_id, category, paise)
    return {
        "reply": f"Logged Rs {paise // 100:,} spent on {category}. It now shows on your Money screen under {category}.",
        "computed_numbers": [{"label": f"{category} (this entry)", "value_paise": paise}],
        "citations": [],
        "agent": "expense",
        "tool_calls": ["log_expense"],
        "status": "delivered",
    }


def _document_lookup_reply(user_id, text):
    t = text.lower()
    wanted = None
    label = ""
    if "aadhaar" in t or "aadhar" in t:
        wanted, label = "aadhaar_number", "Aadhaar number"
    elif re.search(r"\bpan\b", t):
        wanted, label = "pan_number", "PAN number"
    if not wanted:
        return None
    found = db.find_document_field(user_id, wanted)
    if found:
        return {
            "reply": f"Your {label} saved from {found['doc_type'].upper()} ({found['filename']}) is {found['value']}.",
            "computed_numbers": [],
            "citations": [{"citation": found["filename"], "text": "Uploaded user document"}],
            "agent": "document",
            "tool_calls": ["document_lookup"],
            "status": "delivered",
        }
    return {
        "reply": f"I could not find a readable {label} in your uploaded documents yet. Upload a clear text PDF or add OCR support for images, and I can retrieve it from your saved document.",
        "computed_numbers": [],
        "citations": [],
        "agent": "document",
        "tool_calls": ["document_lookup"],
        "status": "delivered",
    }


def _norm_lang(language):
    """This app supports only English and Hindi; anything else becomes English."""
    return language if language in ("en", "hi") else "en"


def _ensure_reply_language(reply, language):
    """Guarantee the reply is in the selected language (English or Hindi).
    English passes straight through. For Hindi: text that is already Devanagari
    is left alone (the agent's compose step may have localized it already); the
    common fixed replies use instant offline Hindi; anything else is translated
    by the LLM, falling back to the English text only if no model is configured."""
    language = _norm_lang(language)
    if language == "en" or not reply:
        return reply
    # already Hindi -> never translate a second time
    if re.search(r"[\u0900-\u097F]", reply):
        return reply
    loan = re.search(
        r"For a (₹[\d,]+) loan at 12% over (\d+) months, your EMI is about (₹[\d,]+) per month, and the total interest is about (₹[\d,]+)",
        reply,
    )
    if loan:
        principal, months, emi, interest = loan.groups()
        return f"{principal} के ऋण पर 12% ब्याज और {months} महीनों के लिए आपकी EMI लगभग {emi} प्रति महीना होगी। कुल ब्याज लगभग {interest} होगा।"
    expense = re.match(r"Logged Rs ([\d,]+) spent on (.+?)\. It now shows", reply)
    if expense:
        amount, category = expense.groups()
        return f"{category} पर Rs {amount} का खर्च दर्ज कर लिया गया। यह अब आपके Money स्क्रीन पर {category} के अंतर्गत दिखता है।"
    if reply.startswith("I can help with loans"):
        return "मैं ऋण, बचत के जोखिम, आपकी संपत्ति, सरकारी योजनाओं और धोखाधड़ी पहचानने में मदद कर सकता हूं। EMI या किसी सरकारी योजना के बारे में पूछें।"
    if reply.startswith("I could not verify that safely"):
        return "मैं इसे सुरक्षित रूप से सत्यापित नहीं कर पाया, इसलिए मैं आपको किसी प्रशिक्षित व्यक्ति से जोड़ूंगा।"
    if reply.startswith("Please ask a little more clearly"):
        return "कृपया थोड़ा और साफ पूछें। जैसे: emergency fund क्या है, SIP क्या है, या EMI कैसे काम करती है?"
    if reply.startswith("Hello") or reply.startswith("Hi"):
        return "नमस्ते, मैं ArthSaathi हूं। मैं आपकी पैसों, योजनाओं, ऋण, संपत्ति और धोखाधड़ी से जुड़ी मदद कर सकता हूं।"
    if reply.startswith("Based on your details"):
        return "आपकी जानकारी के आधार पर मैंने योजना पात्रता जांची है। कृपया स्क्रीन पर दिख रहे दस्तावेज और कारण देखें।"
    if reply.startswith("In 1,000 simulations"):
        match = re.search(r"lasts about ([\d.]+) months.*?about ([\d.]+)%", reply)
        if match:
            months, risk = match.groups()
            return f"सिमुलेशन के आधार पर आपका पैसा लगभग {months} महीने चल सकता है। एक साल के अंदर पैसा खत्म होने का जोखिम लगभग {risk}% है।"
        return "मैंने आपकी सुरक्षा जांच चलाई है। नतीजे के आधार पर बचत buffer बढ़ाना उपयोगी रहेगा।"
    if "asset" in reply.lower() or "portfolio" in reply.lower() or "worth" in reply.lower():
        return "मैंने आपकी संपत्ति की जानकारी देखी है। स्क्रीन पर आपकी संपत्ति और अनुमानित बदलाव दिख रहा है।"
    # long tail -> LLM translation into Hindi; empty string (no model) keeps English
    translated = ask_llm(
        "Translate the assistant reply into natural Hindi in Devanagari script. "
        "Preserve every rupee amount and digit exactly. Do not add or remove facts.",
        reply,
    )
    return translated or reply


def _summarize_context(previous, user_text, assistant_text, agent):
    fallback_line = f"- User asked: {user_text[:160]}; Saathi replied via {agent or 'general'}."
    if not previous:
        base = fallback_line
    else:
        base = (previous.strip() + "\n" + fallback_line)[-1800:]
    if os.getenv("CONTEXT_LLM_SUMMARY", "").strip().lower() not in {"1", "true", "yes"}:
        return base[-1400:]
    prompt = (
        "Maintain a compact memory for this one user. Keep durable facts, preferences, "
        "open tasks, uploaded-document needs, and financial concerns. Drop chit-chat. "
        "Do not invent facts. Keep under 120 words.\n\n"
        f"Previous memory:\n{previous or '(empty)'}\n\n"
        f"New user message: {user_text}\n"
        f"Assistant reply: {assistant_text}\n"
        f"Agent: {agent}"
    )
    summary = ask_llm("You update private user memory for a local assistant.", prompt)
    return (summary or base)[-1400:]


def _merge_memory(rolling_summary, recalled):
    """Combine the short-term rolling summary (SQLite) with the long-term
    semantic memories recalled from the vector DB into one context block that
    the agents read. Both parts are optional; empty parts are dropped."""
    parts = []
    if recalled:
        parts.append("Relevant past notes for this user:\n" +
                     "\n".join(f"- {m}" for m in recalled))
    if rolling_summary:
        parts.append("Recent running summary:\n" + rolling_summary.strip())
    return "\n\n".join(parts)


def _turn_memory(user_text, reply, agent, channel):
    """One concise, self-contained summary line for THIS chat/voice turn -- this
    is what gets embedded and stored in the vector DB against the user's id."""
    user_text = (user_text or "").strip().replace("\n", " ")
    reply = (reply or "").strip().replace("\n", " ")
    return (f"[{channel}] User asked: {user_text[:200]} "
            f"| Saathi ({agent or 'general'}) answered: {reply[:240]}")


def _run_single_agent(agent_name, body: AgentIn):
    """Run one named agent directly, bypassing the LangGraph router."""
    if agent_name not in agent_module.AGENTS:
        return JSONResponse({"error": "Unknown agent"}, status_code=404)
    body.language = _norm_lang(body.language)          # only en/hi
    profile = db.get_profile(body.user_id)
    context = db.get_user_context(body.user_id)
    profile["context_summary"] = context.get("summary", "") if _should_use_saved_context(body.text) else ""
    draft = agent_module.AGENTS[agent_name](body.text, profile, body.language)
    reply = agent_module.compose_reply(
        draft["reply"],
        draft["computed_numbers"],
        body.language,
        draft.get("allow_compose", True),
        draft.get("agent", agent_name),
    )
    check = agent_module.critic(reply, draft["computed_numbers"])
    if check["status"] != "delivered":
        reply = "I could not verify that safely, so let me connect you to a trained person who can help."
    reply = _ensure_reply_language(reply, body.language)   # match selected language
    return {
        "reply": reply,
        "citations": draft.get("citations", []),
        "computed_numbers": draft.get("computed_numbers", []),
        "status": check["status"],
        "agent": draft.get("agent", agent_name),
        "tool_calls": draft.get("tool_calls", []),
        "trace": [agent_name, "compose", "critic", "respond" if check["status"] == "delivered" else "handoff"],
    }


# ---- small helper: squash the Monte Carlo histogram into 5 bars for the UI ----
def _bucket5(histogram):
    """histogram[m] = how many simulated runs survived exactly m months (m=0..12).
    We squash that into 5 display buckets and return each as a percentage of all
    runs, so the frontend can draw 5 bars directly."""
    total = sum(histogram) or 1
    edges = [(0, 2), (3, 5), (6, 8), (9, 11), (12, 12)]   # ran-out ... survived
    bars = []
    for lo, hi in edges:
        count = sum(histogram[m] for m in range(lo, hi + 1) if m < len(histogram))
        bars.append(round(count * 100 / total))
    return bars


# ---- routes ----
@app.get("/health")
def health():
    """Quick status check for event day: is the LLM wired,
    is voice configured, and which single-agent endpoints are available."""
    return {
        "ok": True,
        "llm_on": llm.is_on(),
        "voice_on": voice._whisper_ready(),
        "agents": list(agent_module.AGENTS.keys()),
        "single_agent_endpoint": "/agent/{name}",
    }


@app.get("/personas")
def personas():
    """List the people for the dropdown at the top of the dashboard."""
    return db.get_personas()


@app.post("/chat")
def chat(body: ChatIn):
    """Financial Advisor + Critic. Returns reply, citations, numbers, status,
    and which named SKILL handled the message (for the Skills panel)."""
    body.language = _norm_lang(body.language)          # only en/hi flow onward
    profile = db.get_profile(body.user_id)
    context = db.get_user_context(body.user_id)
    # MEMORY (read): pull this user's past notes from the vector DB by meaning,
    # and combine with the short-term rolling summary. Semantic recall is self-
    # gating (nothing relevant -> []), so it is safe to do every turn; the full
    # rolling summary is only injected when the user references the past.
    recalled = rag.recall(body.user_id, body.text, k=3)
    rolling = context.get("summary", "") if _should_use_saved_context(body.text) else ""
    profile["context_summary"] = _merge_memory(rolling, recalled)
    out = (_expense_log_reply(body.user_id, body.text)
           or _document_lookup_reply(body.user_id, body.text)
           or handle_chat(body.text, profile, body.language))
    # enforce the selected language on EVERY reply (chat, voice, expense, doc, scam)
    out["reply"] = _ensure_reply_language(out.get("reply", ""), body.language)
    out["language"] = body.language
    sk = skills.skill_for_agent(out.get("agent", ""))     # show the skill that answered
    if sk:
        out["skill"] = {"id": sk["id"], "title": sk["title"]}
    try:                                                  # log both turns for the audit trail
        db.log_chat(body.user_id, "user", body.text, body.language, channel=body.channel)
        db.log_chat(body.user_id, "assistant", out.get("reply", ""), body.language,
                    agent=out.get("agent"), tool_calls=out.get("tool_calls"),
                    citations=out.get("citations"), critic_status=out.get("status"),
                    channel=body.channel)
        # MEMORY (write): keep the short-term rolling summary in SQLite (as
        # before) AND store a concise summary of THIS turn in the vector DB,
        # mapped to the user id, so future turns can recall it by meaning.
        summary = _summarize_context(context.get("summary", ""), body.text,
                                     out.get("reply", ""), out.get("agent"))
        db.save_user_context(body.user_id, summary, out.get("agent"), body.channel)
        safe_user = guardrails.sanitize_for_memory(body.text)   # never store an injection
        rag.remember(body.user_id,
                     _turn_memory(safe_user, out.get("reply", ""), out.get("agent"), body.channel))
    except Exception:
        pass                                              # logging must NEVER break the reply
    return out


@app.post("/agent/advisor")
def agent_advisor(body: AgentIn):
    return _run_single_agent("advisor", body)


@app.post("/agent/risk")
def agent_risk(body: AgentIn):
    return _run_single_agent("risk", body)


@app.post("/agent/asset")
def agent_asset(body: AgentIn):
    return _run_single_agent("asset", body)


@app.post("/agent/scheme")
def agent_scheme(body: AgentIn):
    return _run_single_agent("scheme", body)


@app.post("/agent/scam")
def agent_scam(body: AgentIn):
    return _run_single_agent("scam", body)


@app.post("/agent/legacy")
def agent_legacy(body: AgentIn):
    return _run_single_agent("legacy", body)


@app.post("/agent/general")
def agent_general(body: AgentIn):
    return _run_single_agent("general", body)


@app.post("/agent/{agent_name}")
def agent_direct(agent_name: str, body: AgentIn):
    """Direct single-agent endpoint for demos when the graph/router is not needed."""
    return _run_single_agent(agent_name, body)


@app.get("/context")
def user_context(user_id: int):
    """Compact private memory saved for this user. This is used for future LLM
    context; it is not replayed into the visible chat on refresh."""
    return db.get_user_context(user_id)


@app.get("/chat/history")
def chat_history(user_id: int, limit: int = 20):
    """The chat + Critic audit trail for one person (most recent first)."""
    return db.get_chat_audit(user_id, limit)


@app.post("/auth/start")
def auth_start(body: AuthStartIn):
    """Start local dev OTP signup. The OTP is intentionally returned for demos."""
    identifier = body.identifier.strip()
    if not identifier:
        return JSONResponse({"error": "Enter an email or phone number."}, status_code=400)
    otp = db.issue_otp(identifier)
    exists = db.find_user_by_identifier(identifier) is not None
    return {
        "identifier": identifier,
        "exists": exists,
        "delivery": "local-demo",
        "message": "Local demo OTP generated.",
        "dev_otp": otp,
    }


@app.post("/auth/logout")
def auth_logout():
    """Logout endpoint for the local app. The browser owns the local session."""
    return {"ok": True}


@app.post("/auth/verify")
def auth_verify(body: AuthVerifyIn):
    if not db.verify_otp(body.identifier, body.otp):
        return JSONResponse({"error": "Invalid or expired OTP"}, status_code=401)
    user = db.ensure_user_for_identity(body.identifier, body.name or None, body.provider)
    return {"user": user, "context": db.get_user_context(user["user_id"])}


@app.get("/skills")
def skills_list():
    """The AI employee's skills, each self-describing. Powers the Skills panel
    and is the same list exposed over MCP."""
    return skills.list_skills()


@app.get("/skills/route")
def skills_route(q: str):
    """Show which skill would handle a question (the live selector, no side-effects)."""
    sid = skills.select_skill(q)
    return {"query": q, "skill": skills.get_skill(sid)}


@app.post("/compute/emi")
def emi(body: EmiIn):
    """Raw EMI calculator (also exposed over MCP)."""
    return compute_emi(body.principal_paise, body.annual_rate_bps, body.months)


@app.get("/risk/stress")
def risk(user_id: int = 1, loan_emi_paise: int = 0,
         income_paise: int = -1, expense_paise: int = -1, buffer_paise: int = -1):
    """Monte Carlo stress test for the chosen person. income/expense/buffer
    default to the person's SAVED profile, but the frontend may pass overrides
    so the user can explore 'what if' scenarios. Overrides apply to THIS run
    only and are never written to the database. If loan_emi_paise > 0 we add
    that EMI to the monthly expense, so the 'with this loan' toggle re-runs the
    real simulation."""
    p = db.get_profile(user_id)
    income = income_paise if income_paise >= 0 else p["monthly_income_paise"]
    base_expense = expense_paise if expense_paise >= 0 else p["monthly_expense_paise"]
    buffer = buffer_paise if buffer_paise >= 0 else p["buffer_paise"]
    expense = base_expense + max(0, loan_emi_paise)
    mc = monte_carlo(income, expense, buffer)
    mc["hist5"] = _bucket5(mc["histogram"])     # 5 bars, ready to draw
    mc["recommendation"] = stress_recommendation(income, expense, buffer, mc)
    mc["loan_applied"] = loan_emi_paise > 0
    return mc


@app.get("/rag/search")
def rag_search(q: str, k: int = 3):
    """Vector RAG: return the verified facts closest in meaning to the query."""
    return {"query": q, "matches": rag.search(q, k)}


@app.post("/documents/upload")
async def upload_document(user_id: int = Form(...), doc_type: str = Form(...),
                          file: UploadFile = File(...)):
    kind = doc_type.lower().strip()
    if kind not in ALLOWED_DOC_TYPES:
        return JSONResponse({"error": "Unsupported document type"}, status_code=400)
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        return JSONResponse({"error": "Upload PDF, PNG, or JPG files only"}, status_code=400)
    safe_name = os.path.basename(file.filename or f"{kind}.bin")
    user_dir = UPLOAD_DIR / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    stored = user_dir / f"{kind}_{safe_name}"
    with open(stored, "wb") as f:
      f.write(await file.read())
    text = _extract_document_text(str(stored), file.content_type)
    fields = _extract_document_fields(kind, text)
    saved = db.save_document(user_id, kind, safe_name, str(stored), file.content_type,
                             extracted_text=text, extracted_fields=fields)
    # push money fields (from a bank statement) straight onto the profile so the
    # dashboard fills in. identity fields (aadhaar/pan) are dropped by the
    # allow-list inside apply_profile_fields, so this call is safe for every type.
    db.apply_profile_fields(user_id, fields)
    return saved


@app.get("/documents")
def documents(user_id: int):
    return db.get_documents(user_id)


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: int, user_id: int):
    removed = db.remove_document(user_id, doc_id)
    if not removed:
        return JSONResponse({"error": "Document not found for this user"}, status_code=404)
    try:
        os.remove(removed["stored_path"])
    except OSError:
        pass
    return {"ok": True, "id": doc_id}


@app.post("/voice/transcribe")
async def voice_transcribe(audio: UploadFile = File(...), language: str = Form("auto")):
    """Local speech-to-text. Receives a short audio clip, transcribes it on this
    machine (no cloud), and returns the text. Degrades gracefully on any error."""
    data = await audio.read()
    suffix = os.path.splitext(audio.filename or "clip.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        result = voice.transcribe(path, None if language == "auto" else language)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return result


@app.post("/voice/speak")
def voice_speak(body: SpeakIn):
    """Local read-aloud audio. The browser plays this file; it does not use
    browser speechSynthesis."""
    result = voice.synthesize(body.text, body.language)
    audio_path = result.get("audio_path")
    if not audio_path:
        return JSONResponse({"error": result.get("error", "speech failed")}, status_code=503)
    return FileResponse(
        audio_path,
        media_type=result.get("media_type", "audio/wav"),
        filename="arthsaathi-read-aloud.wav",
        background=BackgroundTask(shutil.rmtree, result.get("tmpdir"), ignore_errors=True),
    )


@app.get("/assets")
def assets(user_id: int = 1):
    """Asset agent: projected values + one insight."""
    return asset_insight(db.get_assets(user_id))


@app.get("/legacy")
def legacy(user_id: int = 1):
    """Legacy Guardian agent: a guided checklist."""
    return legacy_plan(db.get_profile(user_id))


@app.get("/scheme/eligible")
def schemes(user_id: int = 1):
    """Scheme eligibility, decided by rules (auditable)."""
    return check_schemes(db.get_profile(user_id))


@app.post("/scam/check")
def scam(body: ScamIn):
    """Threat Shield agent: score a message and warn in the chosen language."""
    out = scam_check(body.sms_text, body.language)
    try:
        db.log_scam_check(body.user_id, body.sms_text, out, body.language)  # feed the alerts panel
    except Exception:
        pass                                              # logging must NEVER break the response
    return out


@app.get("/scam/alerts")
def scam_alerts(user_id: int, limit: int = 20):
    """The 'Scam alerts' feed for one person (most recent first)."""
    return db.get_scam_checks(user_id, limit)


@app.get("/money/plan")
def money(user_id: int = 1):
    """Income, expense, buffer and a category breakdown for the Money screen."""
    p = db.get_profile(user_id)
    return {
        "income_paise": p["monthly_income_paise"],
        "expense_paise": p["monthly_expense_paise"],
        "buffer_paise": p["buffer_paise"],
        "allocations": db.get_allocations(user_id),
    }


@app.get("/gullak")
def gullak_get(user_id: int = 1):
    """Read the savings jar."""
    return db.get_gullak(user_id)


@app.post("/gullak")
def gullak_add(body: GullakIn):
    """Add to the savings jar (writes to the database) and return the new total."""
    return db.add_gullak(body.user_id, body.amount_paise, body.note)
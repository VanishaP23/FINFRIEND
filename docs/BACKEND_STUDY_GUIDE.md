# ArthSaathi — Backend Study Guide (memorize this)

This is the whole backend, explained to be **remembered and defended in a Q&A**.
Read Part 1 until the lifecycle is automatic, then the file-by-file part, then
quiz yourself with Part 7. Every claim here matches the actual code.

---

## PART 1 — The spine (know this cold)

**One sentence:** ArthSaathi is an AI financial employee where the **LLM only
routes and phrases**, **plain Python computes every number**, **ChromaDB supplies
cited facts**, and a **Critic refuses any rupee figure a tool did not produce.**

**The layers, bottom to top (this is also the file dependency order):**
```
db.py        SQLite: the 4 people + their money + history          (facts)
tools.py     deterministic math: EMI, Monte Carlo, schemes, scam   (the truth layer)
toolbox.py   a registry that wraps tools by name (call_tool)       (tool-calling layer)
llm_embed.py talks to the local GGUF embedder (llama.cpp)          ┐
ingest.py    builds the ChromaDB index from PDFs (run once)        ├ RAG
rag.py       embeds the question, searches ChromaDB, cites         ┘
agents.py    7 agents + router + Critic + compose + ask_llm        (the brain)
graph.py     LangGraph: plan -> agent -> compose -> critic -> out  (orchestration)
skills.py    self-describing skill registry (+ /skills, MCP)       (shop window)
voice.py     whisper.cpp speech-to-text (on-device)                (accessibility)
main.py      FastAPI: turns all of the above into URLs             (the web layer)
mcp_server.py exposes tools + skills over MCP                      (interoperability)
```

**The flagship lifecycle (memorize as P-A-C-R):** one chat message flows
`plan -> agent -> compose -> critic -> respond/handoff`. The LLM is in *plan* and
*compose* only; the tools are in *agent*; the Critic is the gate. `state["trace"]`
records the exact path, e.g. `["plan","advisor","compose","critic","respond"]`.

**The trust architecture (the pitch):**
- **L1 Advisor** — an agent writes a draft reply.
- **L2 Python compute** — `tools.py` produced every number deterministically.
- **L3 Grounded facts** — `rag.py` attaches SEBI/NCFE citations.
- **Rules engine** — `check_schemes` / `scam_check` decide by fixed rules, not AI.
- **Critic** — refuses any `₹` amount no tool produced; escalates distress.

---

## PART 2 — File by file (role, why, key functions, judge-answer)

### db.py — the relational facts
**Role:** Python's built-in `sqlite3` (no server). Creates `arthsaathi.db` and
seeds the four people on startup. **Money is integer paise everywhere.**
**Tables (6):** `personas`, `assets`, `transactions`, `gullak` (core, auto-seeded)
+ `scam_checks`, `chat_messages` (history, fill live).
**Key functions:** `init_db()` (CREATE IF NOT EXISTS + seed once), `get_profile`,
`get_assets`, `get_allocations`, `get_gullak`/`add_gullak`, and the new
`log_scam_check`/`get_scam_checks`, `log_chat`/`get_chat_audit`.
**Memory hook:** *"4 people, 6 tables, all money in paise."*
**Judge asks "why SQLite?"** → serverless, one file, zero setup, perfect for a
laptop demo; the schema is Postgres-ready (`sql/migration.sql`) for scale.

### tools.py — the truth layer (the most important file)
**Role:** every number in the app is born here, in plain Python — *no AI, no DB,
no internet, deterministic*. That is what makes the Critic able to trust them.
**Functions to know:**
- `fmt(paise)` → `₹1,23,456` in the Indian comma system.
- `compute_emi(principal_paise, annual_rate_bps, months)` → standard EMI formula
  in `Decimal` (no float bugs). Monthly rate = `bps / 120000`. Returns
  `emi_paise`, `total_interest_paise`.
- `monte_carlo(income, expense, buffer, runs=1000, months=12, seed=42)` → simulates
  1,000 "years"; each month income wobbles `uniform(0.6,1.2)` and there is a 10%
  chance of a bad month (lose ~1 month income). Returns `p_ruin`,
  `months_survivable` (the median run), `histogram`, `top_action`. **Fixed seed →
  identical every run** (so the chart never jumps), and it re-seeds inside so the
  base run and the "spend 10% less" what-if see the *same luck*.
- `asset_insight(assets)` → projects each asset one year (`value + value*trend_bps//10000`).
- `check_schemes(profile)` → declarative `SCHEMES` list (PM-KISAN, NSAP, e-Shram,
  APY, PMSBY); each result has `eligible`, `doc_checklist`, and a **reason** (incl. why-not).
- `scam_check(sms_text, language)` → weighted **multilingual** `SCAM_SIGNALS`
  buckets (en/hi/kn) + a number regex; score capped 100; `>=60 scam`,
  `>=30 suspicious`; returns `risk_score`, `verdict`, `warning_message`,
  `reasons` (in-language), `status`.
**Memory hook:** *"Truth layer = deterministic. Same input, same output, every time."*
**Judge asks "is the AI doing the math?"** → No. The LLM never computes a number;
`tools.py` does, and the Critic refuses anything else.

### toolbox.py — the tool-calling layer
**Role:** one registry (`TOOLS`) wrapping each tool with name + description +
input hint. Agents call `call_tool(name, **args)` — never `tools.py` directly — so
there is **one** place tool calls happen (loggable, listable, MCP-exposable).
**Functions:** `call_tool`, `list_tools`. **Add a capability = add one line here.**

### llm_embed.py — the local embedder client
**Role:** POSTs text to the **local llama.cpp server** (port 8080) serving
`nomic-embed-text-v1.5` (GGUF), gets vectors back. Nothing leaves the machine.
**Detail to remember:** nomic needs a task prefix — `"search_document: "` when
indexing, `"search_query: "` when asking. `health_ok()` is the reachability check.

### ingest.py — build the index (run once, offline)
**Role:** reads PDFs in `documents/`, splits each page into ~800-char overlapping
chunks, embeds each with `llm_embed`, stores them in a **persistent ChromaDB** at
`chroma_db/` (collection `regdocs`) with `{source, page}` metadata.
**Gotcha to remember:** the llama.cpp server **must be running before** you run
`ingest.py`, because it embeds via `llm_embed`.

### rag.py — retrieval + citations
**Role:** `search(query, k=3)` opens the persistent Chroma collection (cached),
embeds the question with the local GGUF model, runs cosine search, returns
`[{text, citation, score}]` where citation is `"SEBI p3"` etc.
**Safety:** if the index is missing or the embedder is down, returns `[]` — chat
still answers, just without citations. **Never crashes.**

### agents.py — the brain
**Role:** 7 agents, the router, the Critic, the composer, and the LLM client.
- **7 agents** (each: read text/profile → call its tool → write a reply):
  `advisor` (compute_emi), `risk` (monte_carlo), `asset` (asset_insight),
  `scheme` (check_schemes), `scam` (scam_check), `legacy` (legacy_plan),
  `general` (RAG search).
- `route_intent(text)` — deterministic **keyword** router; first match wins; order
  matters (note: `legacy` is checked **before** `asset` so "nominee/will/after me"
  beats the word "land").
- `plan_route(text)` — uses the LLM to pick the agent **if configured**, else falls
  back to `route_intent`. Always returns a valid agent name.
- `ask_llm(system, user)` — **one generic OpenAI-compatible call** driven by
  `LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY`. Blank = offline, returns `""`.
- `compose_reply(...)` — LLM rewrites the draft warmly **but is kept only if every
  rupee amount is still exactly present**; otherwise the template stays.
- `critic(reply, computed_numbers)` — the gate: refuses any `₹[\d,]+` not in the
  allowed set (`refused`), escalates distress words (`escalated`), else `delivered`.
- The **"guaranteed ₹9,99,999" trap**: `advisor_agent` deliberately drafts an
  over-promise with a number no tool made, with `allow_compose=False`, so the
  Critic catches it live. This is your headline demo.
**Memory hook:** *"Agents draft, tools compute, Critic refuses, compose phrases."*

### graph.py — orchestration (LangGraph)
**Role:** builds a `StateGraph` over `ChatState`. Nodes: `plan`, one per agent,
`compose`, `critic`, `respond`, `handoff`.
**Wiring:** `START→plan`; conditional edge `plan→<agent>` (the intent string *is*
the node name); every `<agent>→compose→critic`; conditional `critic→respond|handoff`.
**The one reducer:** `trace: Annotated[list, operator.add]` — each node appends its
name, so `trace` accumulates the path. Every other field is last-write-wins (no
`add_messages`, because the graph is single-turn/stateless per call).
**Payoff to mention:** `build_graph()` loops `for name in AGENTS`, so adding an
agent auto-wires its node and edges.

### skills.py — the shop window
**Role:** a `SKILLS` registry of 7 self-describing skills (title, description,
examples, the agent that runs it, the tools it uses). `list_skills()`,
`select_skill(text)` (routes via `plan_route`). Served at `GET /skills`; each
`/chat` reply carries the `skill` that answered; exposed over MCP.
**Why it matters:** makes the system *discoverable* and easy to pitch.

### voice.py — on-device speech-to-text
**Role:** `transcribe(audio_path, language)` converts the browser's webm to 16 kHz
mono WAV with **ffmpeg**, then runs **whisper.cpp** (local, CPU) to get text.
Returns `{"text": ...}` and **never crashes** — on any problem it returns a
friendly error so the UI asks the user to type. **Compliance point:** we do NOT
use the browser's Google speech API; transcription is local, matching the rules.

### main.py — the web layer (FastAPI)
**Role:** turns everything into URLs; does **no** business logic. Calls
`db.init_db()` on startup. **18 endpoints:**
`/personas`, `/chat`, `/chat/history`, `/skills`, `/skills/route`, `/compute/emi`,
`/risk/stress`, `/rag/search`, `/voice/transcribe`, `/assets`, `/legacy`,
`/scheme/eligible`, `/scam/check`, `/scam/alerts`, `/money/plan`, `/gullak` (GET+POST).
`/chat` attaches the skill and logs both turns; `/scam/check` logs the alert. All
logging is `try/except` wrapped so it can never break a reply.
**Open `http://localhost:8000/docs`** — that clickable page is a great demo prop.

### mcp_server.py — interoperability (FastMCP)
**Role:** exposes the same tools (`emi`, `schemes`, `search_facts`, `check_scam`)
and `available_skills()` over the **Model Context Protocol**, so any MCP client
(including the venue LLM) can discover and call them. No logic duplicated.

---

## PART 3 — Trace ONE message end to end (say this out loud)

User sends "I want a 50000 loan" (Kisan, Kannada):
1. `main.chat` → `handle_chat` → `graph.run_chat` → `GRAPH.invoke({...})`.
2. **plan** → `plan_route` → (LLM off) `route_intent` sees "loan" → `"advisor"`.
3. **advisor node** → `advisor_agent` → `call_tool("compute_emi", ...)` → real
   EMI from `tools.compute_emi`; draft reply with `computed_numbers=[principal, emi, interest]`.
4. **compose** → `compose_reply` → (LLM off) keeps the template; (LLM on) rewrites
   in Kannada but only if all ₹ amounts survive.
5. **critic** → every `₹` in the reply is in `computed_numbers` → `delivered`.
6. **route_after_critic** → `respond` → END.
7. `run_chat` returns `reply, agent, tool_calls, status, trace`. `main` adds
   `skill = Loan & EMI Advisor` and logs both turns to `chat_messages`.

Now the **trap**: "guarantee me double returns?" → advisor drafts the ₹9,99,999
over-promise (`allow_compose=False`) → compose leaves it → **critic finds ₹9,99,999
is not in `computed_numbers` → `refused`** → `handoff` node replies "let me connect
you to a trained person" → trace ends `...["critic","handoff"]`. *That is the demo.*

---

## PART 4 — The 4 showcases → where they live
1. **MCP server** → `mcp_server.py` (FastMCP) — tools + skills discoverable.
2. **RAG + Critic** → `ingest.py`/`rag.py` (ChromaDB + local GGUF) and
   `agents.critic` — cited facts + refusal of invented numbers.
3. **Voice on-device** → `voice.py` (whisper.cpp, local CPU).
4. **Monte Carlo** → `tools.monte_carlo` (plain `random`, 1,000 sims, the survival
   chart collapses when a loan EMI is toggled on via `/risk/stress`).

---

## PART 5 — The numbers/facts you should be able to recite
- 4 personas: **1 Priya** (salaried, Hindi, low risk), **2 Rajesh** (gig, Hindi,
  thin buffer, high risk), **3 Kisan** (farmer, Kannada, PM-KISAN, default user),
  **4 Divya** (low-vision freelancer, English, NSAP).
- Money in **paise**; `fmt` makes `₹` Indian-grouped.
- Monte Carlo: **1,000** runs, **12** months, income ×`uniform(0.6,1.2)`, **10%**
  bad-month chance, **seed 42** (deterministic).
- Scam thresholds: **≥60 scam, ≥30 suspicious**; signals in **en/hi/kn**.
- EMI monthly rate = **bps / 120000**; computed in **Decimal**.
- RAG: ChromaDB collection **`regdocs`**, embedder **nomic-embed-text-v1.5 GGUF**
  on **port 8080**, top-**k=3**.
- Lifecycle: **plan → agent → compose → critic → respond/handoff** (P-A-C-R).

---

## PART 6 — Memory hooks
- **Files bottom-up:** "**D**ogs **T**rust **T**reats, **E**very **I**ndian **R**eads;
  **A**gents **G**uide **S**oftly, **V**oices **M**ake **M**eaning."
  (db, tools, toolbox, llm_embed, ingest, rag, agents, graph, skills, voice, main, mcp)
- **Lifecycle:** **P-A-C-R** = Plan, Agent, Compose, Critic (→ Respond/handoff).
- **Trust:** **L1 advisor, L2 compute, L3 facts, Rules, Critic.**
- **The one rule that wins:** *"The LLM routes and phrases; the tools do the maths;
  the Critic guarantees the numbers."*

---

## PART 7 — Quiz yourself (answers below)
1. Which two nodes use the LLM, and which node guarantees correctness?
2. What does the Critic refuse, and what does it escalate?
3. Why is Monte Carlo seeded, and why re-seeded inside the function?
4. What is the one reducer in the graph, and what does it accumulate?
5. Where is every number in the app created?
6. What happens to chat if the embedder (llama.cpp) is down?
7. What are the scam score thresholds and which languages are covered?
8. How do you add a new capability end to end?
9. What is the ChromaDB collection name and the embedder model?
10. Why SQLite, and is it a problem for scale?

**Answers:** 1) `plan` and `compose` use the LLM; `critic` guarantees correctness.
2) Refuses any `₹` amount no tool produced; escalates distress language. 3) Fixed
seed = identical chart every run; re-seeded so base vs what-if see the same luck.
4) `trace` (`operator.add`); it accumulates the node path. 5) `tools.py`. 6) It
still answers, just without citations (`rag.search` returns `[]`). 7) ≥60 scam,
≥30 suspicious; en/hi/kn. 8) tool in `tools.py` → register in `toolbox.py` → agent
in `agents.py` (+ route keyword); the graph auto-wires it. 9) `regdocs`;
`nomic-embed-text-v1.5` (GGUF). 10) Serverless, one file, zero setup; not a scale
problem — `sql/migration.sql` ports it to Postgres.

---

## PART 8 — Likely judge questions → crisp answers
- **"How do you stop the AI from hallucinating wrong financial advice?"** → The LLM
  never produces numbers; `tools.py` does, deterministically, and the Critic refuses
  any rupee figure not in `computed_numbers` — I can show it refuse a fake one live.
- **"Is anything sent to the cloud?"** → No by default. Embeddings run on a local
  llama.cpp server, voice on local whisper.cpp; the chat LLM is optional and pluggable.
- **"What is agentic about it?"** → A LangGraph state machine routes each message to
  one of seven specialist agents, each calling its own tools, gated by a Critic.
- **"Show me it works for a non-English, non-literate user."** → Kannada voice in,
  Kannada reply out, and the scam shield flags a Hindi/Kannada scam with in-language reasons.
- **"Can other systems use your tools?"** → Yes — they are exposed over MCP
  (`mcp_server.py`), discoverable as tools and skills.

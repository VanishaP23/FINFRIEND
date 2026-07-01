# ArthSaathi

**An agentic-AI financial companion that makes money safe and simple for every Indian — in their own language, by voice, with every number it says traceable to a real source.**

Built for the Nomura KakushIN contest. The whole thing runs on one laptop, fully offline if needed. No paid APIs, no cloud, no agent frameworks.

---

> ## ⚙️ The stack
> - **SQLite** — the relational database (the 4 people, their assets, savings jar) that powers the dashboard.
> - **ChromaDB** — the vector database for RAG, built offline by `ingest.py` from the SEBI / NCFE PDFs.
> - **nomic-embed-text-v1.5 (GGUF)** — the embedding model for RAG, run **locally on CPU** by a `llama.cpp` server.
> - **whisper.cpp (GGML)** — the speech-to-text model for voice, run **locally on CPU**.
>
> Both models are open-source, CPU, well under 7B params, and run on your machine — nothing goes to the cloud.
> **Do the one-time setup in [`RUNBOOK_GGUF.md`](RUNBOOK_GGUF.md) first** (download the models on wifi and start the llama.cpp server), then follow the run steps below.

---

## What's inside (the 4 things we want to show)

| # | Showcase | Where it lives | What it proves |
|---|----------|----------------|----------------|
| 1 | **MCP server** | `backend/mcp_server.py` | Our tools (EMI, schemes, scam-check, fact-search) are exposed over the Model Context Protocol via `FastMCP`, so any MCP client / the venue LLM can call them. |
| 2 | **RAG + Critic** | `backend/rag.py`, `backend/ingest.py`, `backend/agents.py` | Every answer is checked by a **Critic** that **refuses** any number our own code didn't compute. Citations come from a **ChromaDB vector index** built over the real SEBI / NCFE PDFs, searched semantically with the **local nomic GGUF embedder** — each hit traceable to its source and page. |
| 3 | **Voice AI (on-device)** | `backend/voice.py` | The microphone records audio in the browser and sends it to a **local speech-to-text model** running on this machine. Nothing goes to the cloud. |
| 4 | **Monte Carlo** | `backend/tools.py` (`monte_carlo`) | The "will my money survive?" chart runs 1,000 simulations in plain Python `random` — and the survival chart visibly collapses when you toggle a loan on. |

Plus the **agents** working end-to-end: a Financial Advisor, an Asset agent, a Scheme-eligibility agent, a Legacy-planning agent, and a Threat Shield (scam) agent.

---

## Folder structure

```
arthsaathi-react/
├── README.md
├── .gitignore
├── index.html              ← loads fonts, mounts React
├── package.json            ← React 19 + Vite 6
├── vite.config.js          ← dev server + /api proxy to the backend
└── src/
    ├── main.jsx            ← React entry point
    ├── App.jsx             ← boots the prototype, then installs the backend wiring
    ├── legacyMarkup.js     ← the full dashboard HTML (the look)
    ├── legacyRuntime.js    ← the prototype's tested vanilla-JS behaviour
    ├── styles.css          ← all the styling / design tokens
    └── integration.js      ← THE WIRING: replaces hardcoded numbers with real API calls
└── backend/
    ├── main.py             ← FastAPI app: turns our Python into URLs
    ├── agents.py           ← Financial Advisor + Critic (the refusing brain)
    ├── graph.py            ← the orchestration graph (advisor → critic → route)
    ├── tools.py            ← EMI, Monte Carlo, schemes, scam-check, asset insight
    ├── rag.py              ← RAG retrieval (ChromaDB + local GGUF embedder)
    ├── ingest.py           ← builds the ChromaDB index from the PDFs (run once)
    ├── llm_embed.py        ← talks to the local llama.cpp GGUF embedder
    ├── documents/          ← put SEBI / NCFE PDFs here (samples included)
    ├── voice.py            ← local speech-to-text via whisper.cpp
    ├── db.py               ← sqlite database (people + money + savings jar)
    ├── mcp_server.py       ← exposes the tools over MCP
    ├── requirements.txt    ← Python dependencies
    └── .env.example        ← settings (LLM, embedder URL, whisper paths)
```

The frontend never holds any real numbers. It asks the backend for everything, so the same screen works for any of the four demo people just by changing one value.

---

## How to run it (two terminals)

### Terminal 1 — the backend

```bash
cd arthsaathi-react/backend

# one-time setup
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
# now fill in the paths in .env (whisper-cli + ggml model + ffmpeg)

# FIRST start the llama.cpp embedder server in its own window
# (see RUNBOOK_GGUF.md, step A). Then build the document index once:
python ingest.py

# run it
uvicorn main:app --reload
```

The backend is now on **http://localhost:8000**. Open **http://localhost:8000/docs** to see and click every endpoint.

> **Adding the real SEBI / NCFE PDFs:** drop them into `backend/documents/` (replace the two samples), make sure the llama.cpp embedder is running, then run `python ingest.py` again. That's the only step.

### Terminal 2 — the frontend

```bash
cd arthsaathi-react

# one-time setup
npm install

# run it
npm run dev
```

Open **http://localhost:5173**. That's the dashboard. The Vite dev server quietly forwards every `/api/...` call to the backend on port 8000, so the two talk to each other with zero extra setup.

> **Demo user:** the dashboard shows the farmer **Kisan** (persona #3) by default. To switch, run `window.ARTHSAATHI_USER = 1` (or 2 / 4) in the browser console and reload.

---

## Voice model — set up on wifi BEFORE the day

Voice uses **whisper.cpp** (a local Whisper model in GGML format, CPU). You download the `whisper-cli` binary, a model file (`ggml-base.bin`, ~142 MB), and `ffmpeg` once — all steps are in **[`RUNBOOK_GGUF.md`](RUNBOOK_GGUF.md), part B** — and point `backend/.env` at them.

If the paths aren't set, the app does not crash — the mic just shows a friendly "voice not ready" message and everything else keeps working.

---

## The KakushIN LLM (the brain)

The chat is orchestrated by the venue LLM in two places, with the deterministic tools and the Critic around it:

1. **Plan** — the LLM reads the message and **picks which agent** should handle it (loans, risk, assets, schemes, scam, legacy, general).
2. The chosen **agent runs its tool(s)** — `compute_emi`, `monte_carlo`, etc. **All numbers come from this step, never from the LLM.**
3. **Compose** — the LLM **rewrites the result** into a warm, simple reply in the user's language (English / Hindi / Kannada), which the UI can also read aloud.
4. **Critic** — before the reply reaches the user, it checks every ₹ amount is one the tools produced. If the LLM changed or invented a number, the Critic **refuses** and hands off to a human.

So the LLM routes and phrases; the tools do the maths; the Critic guarantees the numbers. Set `LLM_BASE_URL` and `LLM_MODEL` (and `LLM_API_KEY` if the endpoint needs one) in `backend/.env` to turn this on. It is a generic OpenAI-compatible endpoint, so point it at a local llama.cpp chat server or the venue model.

**Runs without the LLM too.** With `LLM_BASE_URL` left blank (the default), planning falls back to a keyword router and composing falls back to clear templates — the app is fully deterministic and offline. This is the safety net if the venue LLM is slow or rate-limited: the demo never freezes.

---

## Compliance notes (read before judging-day)

- **Voice is on-device.** We do **not** use the browser's built-in `webkitSpeechRecognition` (that streams your audio to Google). Instead we record audio and transcribe it with **whisper.cpp** — a local Whisper model (GGML, CPU, well under 7B params) running on our own machine. This matches the contest rule that only locally-run transcription models may be used.
- **Orchestration is a LangGraph `StateGraph`.** One chat message flows `plan → <agent> → compose → critic → respond/handoff`. The **plan** node uses the KakushIN LLM to pick the agent; the **agent** calls its tool(s) for the real numbers; the **compose** node uses the LLM to write the human reply; the **Critic** then refuses any ₹ number the tools didn't produce, routing to `handoff` instead of `respond`. The path is recorded in `trace` (e.g. `["plan","advisor","compose","critic","respond"]`) and shown in the UI. With no LLM configured, plan/compose fall back to keyword routing and templates.
- **Only the venue LLM, and only optionally.** No ChatGPT / Gemini / Claude website is called. The app runs with no LLM at all; the venue LLM is an optional polish layer behind one env variable.
- **The vector database is real and ours.** `ingest.py` builds a **ChromaDB** index over the actual SEBI / NCFE PDFs, embedding each chunk with the **local nomic-embed-text-v1.5 (GGUF)** model served by `llama.cpp` (no embedding API, nothing sent out). At query time we embed the question the same way, do semantic similarity search, and cite the source + page.
- **HuggingFace models are local, CPU, and under 7B.** Both the embedder (nomic GGUF, ~137M params) and the voice model (whisper.cpp / Whisper base, ~74M params) are open-source HuggingFace downloads that run on CPU. If your rules require admin pre-approval for HuggingFace models, get these two cleared and pre-downloaded before the day (see `RUNBOOK_GGUF.md`).

---

## Quick sanity check (optional)

Each backend file can be run on its own to prove it works, no server needed:

```bash
cd arthsaathi-react/backend
python tools.py      # EMI + Monte Carlo + scam-check (pure Python, no setup)
python db.py         # database seeding + the four people
python llm_embed.py  # is the local GGUF embedder reachable? (llama.cpp must be running)
python ingest.py     # build the ChromaDB index from the PDFs
python rag.py        # semantic search over the SEBI / NCFE PDFs (needs the embedder + index)
python agents.py     # advisor + Critic refusing a bad number
```

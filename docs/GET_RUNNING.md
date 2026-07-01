# GET RUNNING — ArthSaathi end to end

Two truths to relax about first:
1. **The dashboard runs with NO model downloads.** Backend + frontend = a working
   demo in ~10 minutes. ChromaDB and the offline models only add two things:
   RAG citations and the voice mic.
2. **Nothing crashes if a piece is missing.** No embedder → chat answers come back
   without citations. No whisper → the mic shows "voice not ready". Everything else
   keeps working. So you can build this up in layers.

Below, the four things you asked about, in order.

---

## STEP 1 — Get the dashboard running (the essential 10 minutes)

**Terminal 1 — backend**
```bash
cd arthsaathi-react/backend
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # Windows: copy .env.example .env
uvicorn main:app --reload
```
Backend is now on http://localhost:8000 — open http://localhost:8000/docs to click every endpoint.

**Terminal 2 — frontend**
```bash
cd arthsaathi-react
npm install
npm run dev
```
Open http://localhost:5173 — that is the dashboard. Vite forwards every `/api/...`
call to the backend on port 8000 automatically (no CORS setup). Default user is
Kisan; switch with `window.ARTHSAATHI_USER = 1` (or 2/4) in the browser console + reload.

At this point Money, Risk (Monte Carlo), Assets, Schemes, Scam-check, Legacy,
Gullak, Chat and Skills all work. That is your "running with proper functioning" baseline.

---

## STEP 2 — Create the tables

You almost never do this by hand. `db.py` runs `CREATE TABLE IF NOT EXISTS` and
seeds the four people automatically when the server starts (the `db.init_db()`
call in main.py). So **starting the backend in Step 1 already created the database**
(`backend/arthsaathi.db`) with the 4 core tables and 4 personas.

The two extra tables (`scam_checks`, `chat_messages`) are now ALSO created
automatically on startup, and they fill up LIVE: every `/scam/check` writes a row
the Scam-alerts panel reads, and every `/chat` writes the user + assistant turns
the Audit-trail panel reads. So you do not have to do anything.

Optional only: to pre-load a little sample history so those panels are not empty
before you click anything (nice for a cold-start demo), run once:
```bash
cd arthsaathi-react/backend
python apply_extras.py        # safe to run twice; never duplicates
```

> The hand-written SQL in `backend/sql/` (`schema.sql`, `seed.sql`, `views.sql`,
> `migration.sql`) is the portable / Postgres / documentation copy.
> You do not need it to run on SQLite — `db.py` + `apply_extras.py` cover that.

---

## STEP 3 — Connect ChromaDB (for RAG citations)

ChromaDB here is **embedded** — a folder, not a server. "Connecting" means building
the index once and letting `rag.py` open it. The catch: it embeds with the local
nomic GGUF model, so **the llama.cpp server must be running before you build.**

1. Start the embedder (Step 4 below) so it is live on port 8080.
2. Put your SEBI / NCFE PDFs in `backend/documents/` (two samples are already there).
3. Build the index:
   ```bash
   cd arthsaathi-react/backend
   python ingest.py        # prints: Embedder: local GGUF via llama.cpp ...
   ```
   This writes `backend/chroma_db/` (collection `regdocs`). Done once — ship that folder.
4. At demo time, keep the llama.cpp server running so `rag.py` can embed the
   question and search. If it is down, chat still answers, just without citations.

---

## STEP 4 — Download the offline models (do this on wifi, BEFORE the day)

Full detail is in `RUNBOOK_GGUF.md`. The short version:

**A. RAG embedder — llama.cpp + nomic GGUF (port 8080)**
- Download a prebuilt llama.cpp release, unzip (e.g. `C:\tools\llamacpp\`).
- Start it (downloads the ~95 MB model the first time, then offline):
  ```
  llama-server --embeddings -hf nomic-ai/nomic-embed-text-v1.5-GGUF:Q5_K_M --port 8080
  ```
- Leave this window open. In `.env`: `LLAMACPP_EMBED_URL=http://127.0.0.1:8080/v1/embeddings`
- Test: `python llm_embed.py` → should print `reachable: True`.

**B. Voice — whisper.cpp + a GGML model + ffmpeg**
- Download prebuilt whisper.cpp (gives `whisper-cli`), a model `ggml-base.bin`
  (~142 MB), and ffmpeg.
- In `.env` set: `WHISPER_CPP_BIN`, `WHISPER_CPP_MODEL`, `FFMPEG_BIN`.

**C. (optional) Chat LLM — the "brain"**
- Leave blank for fully deterministic/offline (default).
- Or set a generic OpenAI-compatible endpoint in `.env`:
  `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` if needed. Point it at a local
  llama.cpp chat server (fully offline) or the KakushIN venue model.

---

## STEP 5 — Verify (run these and confirm)

```bash
cd arthsaathi-react/backend
python _verify.py     # all 4 people: income/expense, risk %, schemes, asset insight
python tools.py       # EMI + Monte Carlo + multilingual scam-check (pure Python)
python skills.py      # the 7 skills + routing
python llm_embed.py   # reachable: True   (needs the llama.cpp server up)
python ingest.py      # builds the ChromaDB index
python rag.py         # semantic search over the PDFs (needs embedder + index)
```
Then open http://localhost:8000/docs and http://localhost:5173.

---

## What powers what (so you know what to keep running on the day)

| Feature | Needs |
|---|---|
| Money / Risk / Assets / Schemes / Legacy / Gullak / Chat / Skills | backend only (SQLite auto-created) |
| Scam alerts feed + Audit trail panels | nothing - they fill live (apply_extras.py only pre-seeds samples) |
| RAG citations in chat | llama.cpp server (8080) running + `chroma_db/` built |
| Voice mic | whisper.cpp + model + ffmpeg in `.env` |
| LLM phrasing/routing polish | optional `LLM_BASE_URL` endpoint |

Demo-day order: start the llama.cpp embedder window first, then `uvicorn main:app`,
then `npm run dev`. Confirm `python llm_embed.py` prints `reachable: True`. That one
window is what gives you live RAG citations.

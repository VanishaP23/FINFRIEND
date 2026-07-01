# ArthSaathi — FULL FUNCTIONAL MODE (the definitive setup)

Follow this top to bottom once. After it, the persona switcher changes the WHOLE
dashboard, chat is smart, RAG cites real sources, and voice works.

## What "full functional" now means
- **Per-user dashboard** (just wired): the header identity, My Money (income,
  expense, spending breakdown), My Things (assets + projection), Schemes
  (real eligibility + reasons), Risk, Gullak and Scam all change when you pick a
  different person in the new header dropdown.
- **Smart chat**: routing understands intent and replies are phrased naturally
  (needs the LLM).
- **Cited answers**: the catch-all answers real questions from the SEBI/NCFE PDFs
  (needs ChromaDB + the embedder).
- **Voice**: speak in, transcribed on-device (needs whisper.cpp).

---

## STEP 1 — Backend + frontend (the base, ~10 min)

Terminal 1:
```bash
cd arthsaathi-react/backend
python3 -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # Windows: copy .env.example .env
uvicorn main:app --reload
```
Terminal 2:
```bash
cd arthsaathi-react
npm install
npm run dev
```
Open http://localhost:5173. The database (6 tables, 4 people) is created
automatically on first backend start. The header now has a **person dropdown** —
switch between Priya / Rajesh / Kisan / Divya and the wired screens refetch.

> If the dropdown is missing, the backend is not reachable — check Terminal 1 and
> that http://localhost:8000/docs opens.

---

## STEP 2 — Download the local models on wifi (do BEFORE the day)

**A. Embedder (RAG) — llama.cpp + nomic GGUF, port 8080**
- Get a prebuilt llama.cpp release; unzip.
- Start (downloads ~95 MB the first time, then offline) and LEAVE IT OPEN:
  ```
  llama-server --embeddings -hf nomic-ai/nomic-embed-text-v1.5-GGUF:Q5_K_M --port 8080
  ```
- In `backend/.env`: `LLAMACPP_EMBED_URL=http://127.0.0.1:8080/v1/embeddings`

**B. Voice — whisper.cpp + ggml model + ffmpeg**
- Get prebuilt whisper.cpp (`whisper-cli`), `ggml-base.bin` (~142 MB), and ffmpeg.
- In `backend/.env`: `WHISPER_CPP_BIN`, `WHISPER_CPP_MODEL`, `FFMPEG_BIN`.

(Full detail with paths: `RUNBOOK_GGUF.md`.)

---

## STEP 3 — Build the RAG index (once, after the embedder is up)

```bash
cd arthsaathi-react/backend
# put your SEBI/NCFE PDFs in documents/ (two samples already there)
python ingest.py        # prints: Embedder: local GGUF via llama.cpp ...
```
This writes `chroma_db/`. Now chat answers carry citations, and the catch-all
("what is a SIP?") answers from the PDFs instead of a generic line.

---

## STEP 4 — Turn on the chat brain (fixes "random" chat)

Point the chat LLM at a generic OpenAI-compatible endpoint in `backend/.env`:
```
# fully offline option: a local llama.cpp chat server
LLM_BASE_URL=http://127.0.0.1:8081/v1
LLM_MODEL=qwen2.5-3b-instruct
# or the venue model:
# LLM_BASE_URL=https://<endpoint>/v1
# LLM_API_KEY=<key>
# LLM_MODEL=<model-name>
```
Leave blank to stay deterministic (keyword routing + templates). With it set,
routing understands free-form questions and replies are phrased warmly — the
tools still compute every number and the Critic still refuses fakes.

Restart `uvicorn` after editing `.env`.

---

## STEP 5 — Verify full mode

```bash
cd arthsaathi-react/backend
python _verify.py       # all 4 people: income, risk %, schemes, assets
python llm_embed.py     # reachable: True   (llama.cpp embedder up)
python rag.py           # semantic search over the PDFs
python skills.py        # 7 skills + routing
```
In the browser:
- Switch the header person → My Money / My Things / Schemes all change.
- Ask a free-form question in chat → a real, phrased answer (LLM on) with a
  citation (RAG on).
- Tap the mic → your speech is transcribed (whisper set up).
- Type a scam SMS → it appears in the Scam-alerts feed; ask the advisor → both
  turns appear in the Audit trail.

---

## What each piece unlocks (so you know what to keep running)
| You want… | Start / set |
|---|---|
| Per-user dashboard, EMI, risk, gullak, scam | backend only (already works) |
| Scam-alerts + Audit-trail panels filling live | backend only (auto-creates tables) |
| Cited answers + smart catch-all | llama.cpp embedder (8080) + `python ingest.py` |
| Natural chat + intent routing | `LLM_BASE_URL` / `LLM_MODEL` in `.env` |
| Voice mic | whisper.cpp + model + ffmpeg in `.env` |

Demo-day order: start the llama.cpp embedder window → `uvicorn main:app` →
`npm run dev`. Confirm `python llm_embed.py` prints `reachable: True`.

---

## Honest note on the prototype
A few illustrative sections stay static by design because they are not per-user
data: the Learn lessons, the Assets "local news / mandi" feed, the Legacy
verification flow, and the Manager/Educator/Admin mode screens (those modes are
not in the backend). Everything that represents a person's real money — money,
assets, schemes, risk, gullak, scam, chat — is now backend-driven and switches
per user.

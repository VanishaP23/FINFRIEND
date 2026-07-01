# ArthSaathi Setup Guide

This zip contains the updated ArthSaathi app: React frontend, FastAPI backend,
SQLite database setup, local dev OTP login, profile switching, document upload /
remove, saved user context, RAG hooks, and local voice hooks.

## What Your Friend Needs

- Node.js 18 or newer
- Python 3.10 or newer
- A terminal
- Optional for voice: `ffmpeg` and `whisper.cpp`
- Optional for local LLM/RAG: `llama.cpp` servers from `RUNBOOK_GGUF.md`

The app can run without any paid LLM API key. If no LLM is configured, it uses
the deterministic router and built-in tools.

## 1. Unzip

Unzip the project anywhere, for example:

```bash
cd ~/Desktop
unzip ArthSaathi-final-code.zip
cd arthsaathi-react-2
```

If the folder name is different, just `cd` into the unzipped project folder.

## 2. Backend Setup

Open a terminal in the project folder:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python db.py
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Keep this backend terminal running.

On Windows PowerShell, activation is:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python db.py
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## 3. Frontend Setup

Open a second terminal in the project folder:

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

## 4. Login / OTP

This build uses local demo OTP.

1. Enter email or phone.
2. Click `Send OTP`.
3. The OTP is shown on the login card.
4. Type that OTP and verify.

Logout is available in the top header.

## 5. Voice Setup

Typing works immediately. Voice needs local binaries configured in
`backend/.env`.

Set:

```env
WHISPER_CPP_BIN=/path/to/whisper-cli
WHISPER_CPP_MODEL=/path/to/ggml-base.bin
FFMPEG_BIN=ffmpeg
```

For Hindi/Hinglish, the frontend sends voice to Whisper with auto-detect.
Voice questions auto-play the answer using the backend `/voice/speak` path.

## 6. Optional Local LLM / RAG

If your friend wants the LLM layer to route and answer more naturally, start a
local OpenAI-compatible llama.cpp chat server and set in `backend/.env`:

```env
LLM_BASE_URL=http://127.0.0.1:8081/v1
LLM_API_KEY=
LLM_MODEL=your-local-model-name
```

For document RAG embeddings, follow `RUNBOOK_GGUF.md`.

## 7. Useful Checks

Backend health/docs:

```text
http://127.0.0.1:8000/docs
```

Build frontend:

```bash
npm run build
```

Compile backend:

```bash
cd backend
python -m py_compile main.py db.py agents.py voice.py
```

## Notes

- The SQLite database is created locally by `python db.py`.
- Uploaded user documents are saved locally under `backend/uploads/`.
- The zip intentionally does not include your local `.env`, local database,
  uploaded documents, virtualenv, `node_modules`, or build cache.

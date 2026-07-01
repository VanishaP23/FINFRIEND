# RUNBOOK — local GGUF stack (Windows)

This is the extra setup for the **GGUF build**: the RAG embedder (nomic, GGUF, via
llama.cpp) and the voice engine (whisper.cpp, GGML). Everything runs **locally on
the CPU**. Do all the downloads on wifi **before** the hackathon.

When this is running you will have **3 processes** up at once:
1. the FastAPI backend (`uvicorn main:app`)
2. the **llama.cpp** server (the embedder) on port 8080
3. **whisper.cpp** is called on demand by the backend (no long-running server)

> If the llama.cpp embedder isn't running, the app still works — chat answers
> just come back without document citations (no crash). If whisper.cpp isn't
> set up, the mic shows a "voice not ready" message and everything else works.
> So a missing piece never takes down the demo; it just turns that one feature off.

---

## A. RAG embedder — llama.cpp + nomic GGUF

1. **Get llama.cpp (prebuilt, no compiling).** Download the latest Windows release
   zip from the llama.cpp releases page (`github.com/ggml-org/llama.cpp/releases`,
   the `llama-*-bin-win-*.zip`). Unzip to e.g. `C:\tools\llamacpp\`.

2. **Start the embedding server** (downloads the model the first time, ~95 MB):
   ```
   cd C:\tools\llamacpp
   llama-server.exe --embeddings -hf nomic-ai/nomic-embed-text-v1.5-GGUF:Q5_K_M --port 8080
   ```
   Leave this window open. Test it from another terminal:
   ```
   curl http://127.0.0.1:8080/v1/embeddings -H "Content-Type: application/json" -d "{\"input\":\"hello\"}"
   ```
   You should get back a JSON list of numbers.

3. In `backend/.env` keep:
   ```
   EMBED_PROVIDER=llama_cpp
   LLAMACPP_EMBED_URL=http://127.0.0.1:8080/v1/embeddings
   ```

4. **Build the index** with the GGUF embedder:
   ```
   cd backend
   python ingest.py        # should print: Embedder: local GGUF via llama.cpp
   ```

---

## B. Voice — whisper.cpp + a GGML model + ffmpeg

1. **Get whisper.cpp (prebuilt).** Download the Windows release from
   `github.com/ggml-org/whisper.cpp/releases` and unzip to e.g.
   `C:\tools\whisper\`. It contains `whisper-cli.exe`.

2. **Get a model.** Download `ggml-base.bin` (~142 MB; or `ggml-tiny.bin` ~75 MB
   for speed) from `huggingface.co/ggerganov/whisper.cpp` into
   `C:\tools\whisper\models\`.

3. **Get ffmpeg.** Download a Windows build (e.g. from gyan.dev), unzip, and note
   the path to `ffmpeg.exe` (or add it to PATH).

4. In `backend/.env` set the three paths:
   ```
   ASR_PROVIDER=whisper_cpp
   WHISPER_CPP_BIN=C:\tools\whisper\whisper-cli.exe
   WHISPER_CPP_MODEL=C:\tools\whisper\models\ggml-base.bin
   FFMPEG_BIN=C:\tools\ffmpeg\bin\ffmpeg.exe
   ```

---

## C. Verify before the day

Run these and confirm each works:

```
# 1) embedder reachable?
cd backend
python llm_embed.py                 # should print: reachable: True

# 2) index built and searching with GGUF?
python ingest.py                    # "Embedder: local GGUF via llama.cpp"
python rag.py                       # "Active RAG tier: ChromaDB (real PDFs)"

# 3) whisper.cpp path:
#    record a short clip in the app's mic; the answer should appear.
#    If WHISPER_CPP_* is wrong, it silently uses faster-whisper instead.
```

Checklist:
- [ ] llama.cpp server window open on port 8080 (it must stay running)
- [ ] `python llm_embed.py` prints `reachable: True`
- [ ] `python ingest.py` printed the GGUF embedder line
- [ ] mic in the app returns text
- [ ] models pre-downloaded (nomic GGUF, ggml-base.bin) while you had wifi

The single most important thing: keep the llama.cpp embedder window open during
the demo, and confirm `python llm_embed.py` prints `reachable: True` before you
start. That one process is what powers the RAG citations.

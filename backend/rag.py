# ===========================================================================
# ArthSaathi · rag.py  =  KNOWLEDGE + MEMORY
#   document RAG + per-user vector memory (ChromaDB).
#   PIPELINE:  guard -> plan -> agent -> compose -> critic -> respond
# ===========================================================================
# backend/rag.py
# ===========================================================================
# RAG + USER MEMORY  -- ONE SINGLE FILE.
#
# This one file now owns EVERYTHING the vector database does. It used to be
# split across three files (llm_embed.py + ingest.py + rag.py); your senior was
# right -- for a project this size it is cleaner as one module. It has four jobs:
#
#   1. EMBEDDER          -> turn text into a vector using the LOCAL nomic GGUF
#                           model (served by a llama.cpp server on this machine).
#   2. BUILD THE INDEX   -> read the SEBI / NCFE PDFs, chunk them, embed them,
#                           and save them in ChromaDB  (was ingest.py).
#   3. SEARCH DOCS       -> answer a question from those PDFs, with a citation.
#   4. USER MEMORY (NEW) -> after every chat/voice turn we store a short summary
#                           of that turn in the vector DB, tagged with the user's
#                           id, so a later turn can RECALL it by meaning.
#
# Two Chroma collections live side by side in backend/chroma_db/ :
#   * "regdocs"      -> the SEBI / NCFE document chunks (built offline).
#   * "user_memory"  -> per-user conversation summaries (written live).
#
# EVERYTHING degrades gracefully: if the embedder/server is not running, every
# function returns empty / False instead of crashing, so the app still works.
# ===========================================================================

import os
import glob
import time
import httpx

HERE = os.path.dirname(__file__)
CHROMA_DIR = os.path.join(HERE, "chroma_db")        # the persistent vector store
DOCS_DIR = os.path.join(HERE, "documents")          # SEBI / NCFE PDFs live here
DOC_COLLECTION = "regdocs"                           # PDF chunks
MEM_COLLECTION = "user_memory"                        # per-user conversation memory


# ===========================================================================
# 1) THE EMBEDDER  (was llm_embed.py)
# ---------------------------------------------------------------------------
# Calls a llama.cpp server that serves nomic-embed-text-v1.5 (GGUF) on the CPU.
# nomic needs a task prefix on every string:
#   documents being indexed -> "search_document: ..."
#   the user's question      -> "search_query: ..."
# ===========================================================================
def _embed_url():
    return os.getenv("LLAMACPP_EMBED_URL", "http://127.0.0.1:8080/v1/embeddings")


def _embed_model():
    # llama-server ignores this, but the OpenAI-style body wants a model field
    return os.getenv("LLAMACPP_EMBED_MODEL", "nomic-embed-text-v1.5")


def _embed(texts, is_query=False, batch=64):
    """Return one vector per input string from the local llama.cpp server.
    Raises on any connection/HTTP problem so callers can fall back safely."""
    prefix = "search_query: " if is_query else "search_document: "
    vectors = []
    for i in range(0, len(texts), batch):
        chunk = [prefix + t for t in texts[i:i + batch]]
        body = {"model": _embed_model(), "input": chunk}
        r = httpx.post(_embed_url(), json=body, timeout=60)
        r.raise_for_status()
        data = sorted(r.json()["data"], key=lambda d: d.get("index", 0))  # keep order
        vectors.extend(d["embedding"] for d in data)
    return vectors


def embedder_health():
    """Can we reach the embedder right now? Used by tools/tests."""
    try:
        v = _embed(["hello"], is_query=True)
        return bool(v and len(v[0]) > 0)
    except Exception:
        return False


# ===========================================================================
# SHARED: open a Chroma collection (cached). Returns None if Chroma/dir missing.
# ===========================================================================
_CLIENT = None
_COLS = {}      # name -> collection handle (cached)


def _client():
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    try:
        import chromadb
        _CLIENT = chromadb.PersistentClient(path=CHROMA_DIR)
    except BaseException:        # also catch native pyo3 panics
        _CLIENT = None
    return _CLIENT


def _collection(name, create=False):
    """Open a collection by name. `create=True` makes it if absent (used by the
    live user-memory store); `create=False` returns None if it was never built
    (used by doc search, which is built offline)."""
    if name in _COLS:
        return _COLS[name]
    client = _client()
    if client is None:
        return None
    try:
        col = client.get_or_create_collection(name) if create else client.get_collection(name)
    except BaseException:
        col = None
    _COLS[name] = col
    return col


# ===========================================================================
# 2) BUILD THE INDEX  (was ingest.py).  Run once:  python rag.py build
# ---------------------------------------------------------------------------
# Reads every PDF in backend/documents/, splits each page into ~800-char
# overlapping chunks, embeds them locally, and writes them to the "regdocs"
# collection. Re-running rebuilds cleanly (no duplicates).
# ===========================================================================
def _chunk_text(text, size=800, overlap=150):
    """Cut a long page into ~800-char pieces overlapping by ~150 chars so a
    sentence split across a boundary is still findable."""
    pieces, start = [], 0
    while start < len(text):
        pieces.append(text[start:start + size])
        start += size - overlap
    return pieces


def _source_label(filename):
    """'SEBI_investor_basics.pdf' -> short citation tag 'SEBI'."""
    name = os.path.basename(filename).upper()
    for tag in ("SEBI", "NCFE", "RBI", "PM-KISAN"):
        if tag.replace("-", "") in name.replace("-", "").replace("_", ""):
            return tag
    return os.path.splitext(os.path.basename(filename))[0]


def build_index():
    """Build the persistent document index from the PDFs. Needs the llama.cpp
    embedder running. Safe to re-run."""
    import pdfplumber
    pdfs = sorted(glob.glob(os.path.join(DOCS_DIR, "*.pdf")))
    if not pdfs:
        print(f"No PDFs found in {DOCS_DIR}. Drop your SEBI / NCFE PDFs there first.")
        return

    client = _client()
    if client is None:
        print("ChromaDB not available. Is `chromadb` installed?")
        return
    try:                                        # start clean -> no duplicates
        client.delete_collection(DOC_COLLECTION)
    except Exception:
        pass
    col = client.create_collection(DOC_COLLECTION)
    _COLS.pop(DOC_COLLECTION, None)             # drop any cached handle

    docs, metas, ids, n = [], [], [], 0
    for pdf in pdfs:
        tag, fname = _source_label(pdf), os.path.basename(pdf)
        with pdfplumber.open(pdf) as f:
            for pageno, page in enumerate(f.pages, start=1):
                text = (page.extract_text() or "").strip()
                if not text:
                    continue                    # skip blank / image-only pages
                for piece in _chunk_text(text):
                    piece = piece.strip()
                    if len(piece) < 40:         # ignore tiny scraps
                        continue
                    docs.append(piece)
                    metas.append({"source": tag, "file": fname, "page": pageno})
                    ids.append(f"{fname}-p{pageno}-{n}")
                    n += 1

    print("Embedder: local GGUF via llama.cpp (nomic-embed-text-v1.5)")
    BATCH = 100
    for i in range(0, len(docs), BATCH):
        d, m, b = docs[i:i + BATCH], metas[i:i + BATCH], ids[i:i + BATCH]
        embs = _embed(d, is_query=False)        # documents -> "search_document:"
        col.add(documents=d, metadatas=m, ids=b, embeddings=embs)

    print(f"Indexed {len(docs)} chunks from {len(pdfs)} PDF(s) into {CHROMA_DIR}")
    print("Sources:", ", ".join(sorted({_source_label(p) for p in pdfs})))


# ===========================================================================
# 3) SEARCH THE DOCUMENTS  (unchanged public API: rag.search)
# ===========================================================================
def search(query, k=3):
    """Return up to k relevant passages as [{text, citation, score}].
    Embeds the query locally and searches the "regdocs" collection.
    Returns [] on any problem so the app keeps working."""
    col = _collection(DOC_COLLECTION, create=False)
    if col is None:
        return []
    try:
        qv = _embed([query], is_query=True)[0]
        res = col.query(query_embeddings=[qv], n_results=k)
    except BaseException:
        return []                               # embedder down / index issue

    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]
    hits = []
    for doc, meta, dist in zip(docs, metas, dists):
        source = meta.get("source", "doc")
        page = meta.get("page")
        citation = f"{source} p{page}" if page else source
        hits.append({
            "text": doc.strip(),
            "citation": citation,
            "score": round(1.0 / (1.0 + float(dist)), 3),   # closer -> higher
        })
    return hits


# ===========================================================================
# 4) USER MEMORY  (NEW)  -- per-user conversation summaries in the vector DB.
# ---------------------------------------------------------------------------
# remember(user_id, summary): store one concise summary of a chat/voice turn,
#   tagged with that user's id, so it can be found later by MEANING.
# recall(user_id, query, k): return that user's past summaries closest in
#   meaning to the current question (filtered to ONLY this user's rows).
#
# Both no-op safely if the embedder/Chroma is offline (returns False / []).
# ===========================================================================
def remember(user_id, summary):
    """Save ONE conversation summary for this user into the "user_memory"
    collection. Returns True if stored, False if memory is offline."""
    summary = (summary or "").strip()
    if not summary:
        return False
    col = _collection(MEM_COLLECTION, create=True)   # create on first use
    if col is None:
        return False
    try:
        vec = _embed([summary], is_query=False)[0]
        mem_id = f"u{int(user_id)}-{int(time.time() * 1000)}"   # unique per turn
        col.add(documents=[summary], embeddings=[vec],
                metadatas=[{"user_id": int(user_id), "ts": int(time.time())}],
                ids=[mem_id])
        return True
    except BaseException:
        return False


def recall(user_id, query, k=3):
    """Return up to k of THIS user's past summaries closest in meaning to the
    query. The `where` filter guarantees one user can never read another's
    memory. Returns [] if memory is offline or empty."""
    col = _collection(MEM_COLLECTION, create=True)
    if col is None:
        return []
    try:
        qv = _embed([query], is_query=True)[0]
        res = col.query(query_embeddings=[qv], n_results=k,
                        where={"user_id": int(user_id)})
    except BaseException:
        return []
    docs = (res.get("documents") or [[]])[0]
    return [d.strip() for d in docs if d and d.strip()]


# ===========================================================================
# self-test / CLI:
#   python rag.py            -> run a few doc searches (needs embedder running)
#   python rag.py build      -> (re)build the document index from the PDFs
# ===========================================================================
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "build":
        build_index()
    elif _collection(DOC_COLLECTION) is None:
        print("No index yet. Run:  python rag.py build")
    elif not embedder_health():
        print("Embedder not reachable. Start the llama.cpp server (see RUNBOOK_GGUF.md).")
    else:
        for q in ["how much emergency savings should I keep",
                  "is a guaranteed fixed return safe", "what is a sip",
                  "how does emi work on a loan"]:
            print(f"\nQ: {q}")
            for h in search(q):
                print(f"   {h['score']:.3f}  [{h['citation']}]  {h['text'][:60]}...")

# ===========================================================================
# ArthSaathi · llm.py  =  THE BRAIN
#   one reusable LLM object (the hackathon model). Used by every stage.
#   PIPELINE:  guard -> plan -> agent -> compose -> critic -> respond
# ===========================================================================
# backend/llm.py
# ===========================================================================
# THE ONE LLM OBJECT.  Build it once, import it everywhere.
#
# IMPORTANT: the chat/RAG/planning model is the one the HACKATHON gives us on
# the day. We do NOT hardcode a vendor. Sarvam is used ONLY for voice (STT/TTS)
# in voice.py -- it is NOT the chat LLM.
#
# The chat model is reached over an HTTP endpoint (internet is available on the
# day) -> set LLM_BASE_URL + LLM_MODEL (+ LLM_API_KEY). Works for any
# OpenAI-compatible server: hosted API, vLLM, Ollama, llama.cpp, LM Studio,
# TGI -- they all speak /chat/completions.
#
# Everything in the dashboard calls this single object (LLM.ask), so we open one
# pooled HTTP client and reuse it -- no re-creating a client on every call.
# If no model is configured, ask() returns "" and the app runs deterministic.
# ===========================================================================

import os
import httpx
import guardrails

LANG_NAME = {
    "en": "English", "hi": "Hindi", "kn": "Kannada", "ta": "Tamil",
    "te": "Telugu", "bn": "Bengali", "gu": "Gujarati", "mr": "Marathi",
    "ml": "Malayalam", "pa": "Punjabi", "ur": "Urdu", "ne": "Nepali",
    "or": "Odia", "as": "Assamese",
}


def _load_env():
    path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.split("#", 1)[0].strip())


_load_env()


class LLMClient:
    """One reusable chat-LLM client for the whole app. Instantiated once below
    as `LLM`. Reads its endpoint from .env, OR you can override at runtime with
    .configure(...) on event day."""

    def __init__(self):
        self._http = None            # pooled httpx client (created once, reused)
        self._crew_llm = None        # cached CrewAI LLM handle
        self._base = self._model = self._key = None   # runtime overrides

    # ---- configuration (use on event day if they hand us a custom endpoint) ----
    def configure(self, base_url=None, model=None, api_key=None):
        """Point the client at a given HTTP endpoint at runtime."""
        self._base, self._model, self._key = base_url, model, api_key
        self._crew_llm = None
        return self

    def _resolve(self):
        base = (self._base if self._base is not None else os.getenv("LLM_BASE_URL", "")).rstrip("/")
        model = self._model if self._model is not None else os.getenv("LLM_MODEL", "")
        key = self._key if self._key is not None else os.getenv("LLM_API_KEY", "")
        return base, model, key

    def is_on(self):
        base, model, _ = self._resolve()
        return bool(base and model)

    def _client(self):
        if self._http is None:
            self._http = httpx.Client(timeout=float(os.getenv("LLM_TIMEOUT", "30")))
        return self._http

    # ---- the ONE call everything in the dashboard uses ----
    def ask(self, system, user):
        """Guardrail-wrapped chat call. Returns "" if no model is configured, so
        every caller falls back to deterministic behaviour."""
        if not self.is_on():
            return ""
        system, user = guardrails.fortify(system, user)        # two-zone, injection-resistant
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": user}]
        # HTTP endpoint (OpenAI-compatible)
        base, model, key = self._resolve()
        if not (base and model):
            return "ENVIRONMENT ERROR: LLM_BASE_URL and LLM_MODEL must be set in .env or via configure()"
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        body = {"model": model, "messages": messages, "max_tokens": 400, "temperature": 0}
        try:
            r = self._client().post(base + "/chat/completions", json=body, headers=headers)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
        except Exception:
            return ""

    # ---- CrewAI handle. None if no LLM is configured or crewai is absent ----
    def crew_llm(self):
        if self._crew_llm is not None:
            return self._crew_llm
        base, model, key = self._resolve()
        if not (base and model):
            return None                       # no LLM configured -> CrewAI layer just won't run
        try:
            from crewai import LLM
            self._crew_llm = LLM(model=f"openai/{model}", base_url=base,
                                 api_key=key or "not-needed", temperature=0.2, max_tokens=400)
        except Exception:
            self._crew_llm = None
        return self._crew_llm


# THE single instance everyone imports:  from llm import LLM
LLM = LLMClient()

# thin module-level delegators (keep older imports working unchanged)
def ask(system, user):  return LLM.ask(system, user)
def is_on():            return LLM.is_on()
def chat_llm():         return LLM.crew_llm()
def configure(**kw):    return LLM.configure(**kw)
# ===========================================================================
# ArthSaathi · voice.py  =  OPEN-SOURCE, FULLY OFFLINE VOICE I/O
#   STT (speech -> text): faster-whisper  (Whisper 'small', CTranslate2, CPU int8)
#                         Decodes the browser's webm/opus clip DIRECTLY via the
#                         bundled PyAV -- so NO ffmpeg binary is required.
#   TTS (text -> speech): Piper           (VITS ONNX voices: hi_IN + en_US)
#
#   No API keys. No Bhashini. No network at request time. Both models are built
#   ONCE on first use and kept warm for every request after.
#
#   The app already calls exactly these two functions, so nothing else changes:
#       transcribe(path, language) -> {"text","language"}          (or {"text":"","error"})
#       synthesize(text, language) -> {"audio_path","media_type","tmpdir"} (or {"error"})
#
#   ---- ONE-TIME SETUP -------------------------------------------------------
#     pip install faster-whisper piper-tts
#     python download_voices.py          # pulls the 2 Piper voices into voices/
#   The Whisper model itself auto-downloads on first transcription (~460 MB for
#   'small', cached under ~/.cache/huggingface). After that, fully offline.
#
#   ---- OPTIONAL TUNABLES (env) ----------------------------------------------
#     WHISPER_MODEL      base | small (default) | medium
#                        bigger = better Hindi, slower on CPU. 'small' is the
#                        balance; drop to 'base' if a laptop feels sluggish.
#     PIPER_VOICES_DIR   folder holding the .onnx voices (default: ./voices)
#     PIPER_HI_VOICE     Hindi   voice stem (default: hi_IN-pratham-medium)
#     PIPER_EN_VOICE     English voice stem (default: en_US-lessac-low)
# ===========================================================================

import os
import wave
import tempfile
import threading

_WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
_VOICES_DIR = os.getenv(
    "PIPER_VOICES_DIR", os.path.join(os.path.dirname(__file__), "voices")
)
_VOICE_FILE = {
    "hi": os.getenv("PIPER_HI_VOICE", "hi_IN-pratham-medium"),
    "en": os.getenv("PIPER_EN_VOICE", "en_US-lessac-low"),
}

# Models are expensive to construct, so build each once and reuse (thread-safe).
_stt = None
_stt_lock = threading.Lock()
_tts = {}
_tts_lock = threading.Lock()


def _norm(language, default="en"):
    """This app speaks exactly two languages. Anything else -> English."""
    if not language:
        return default
    return "hi" if language.split("-")[0].lower() == "hi" else "en"


def _voice_path(lang):
    return os.path.join(_VOICES_DIR, _VOICE_FILE[lang] + ".onnx")


def _whisper_ready():
    """True when voice can actually run: the STT library is importable AND at
    least one Piper voice file is present on disk. Drives /health -> voice_on so
    the UI can tell the user to type if the one-time setup has not been done."""
    try:
        import faster_whisper  # noqa: F401
    except Exception:
        return False
    return os.path.exists(_voice_path("en")) or os.path.exists(_voice_path("hi"))


def _get_stt():
    global _stt
    if _stt is None:
        with _stt_lock:
            if _stt is None:
                from faster_whisper import WhisperModel
                _stt = WhisperModel(
                    _WHISPER_MODEL, device="cpu", compute_type="int8"
                )
    return _stt


def _get_tts(lang):
    v = _tts.get(lang)
    if v is None:
        with _tts_lock:
            v = _tts.get(lang)
            if v is None:
                from piper import PiperVoice
                v = PiperVoice.load(_voice_path(lang))
                _tts[lang] = v
    return v


def transcribe(path, language=None):
    """Speech -> text, fully local. faster-whisper reads the browser's webm/opus
    clip directly (bundled PyAV), so there is no ffmpeg dependency. language=None
    lets Whisper auto-detect; otherwise we clamp it to hi/en. Never raises -- on
    any failure it returns empty text and the UI asks the user to type."""
    try:
        model = _get_stt()
        lang = _norm(language, default="hi")   # always hi or en -- never auto-detect (auto drifts Hindi -> Urdu)
        segments, info = model.transcribe(
            path, language=lang, beam_size=1, vad_filter=True
        )
        text = "".join(seg.text for seg in segments).strip()
        return {"text": text, "language": lang or getattr(info, "language", None) or "en"}
    except Exception as e:
        return {"text": "", "error": str(e)}


def synthesize(text, language=None):
    """Text -> a WAV file on disk. Returns its path plus the tmpdir so the
    endpoint can stream the file and then delete it. Fully offline Piper."""
    try:
        lang = _norm(language)
        voice = _get_tts(lang)
        tmpdir = tempfile.mkdtemp(prefix="arthsaathi_tts_")
        out_path = os.path.join(tmpdir, "reply.wav")
        with wave.open(out_path, "wb") as wf:
            voice.synthesize_wav(text, wf)
        return {"audio_path": out_path, "media_type": "audio/wav", "tmpdir": tmpdir}
    except Exception as e:
        return {"error": str(e)}
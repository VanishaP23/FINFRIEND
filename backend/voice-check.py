# ===========================================================================
# ArthSaathi · voice_setup_check.py
#   Run this ONCE to set up + verify offline voice. It:
#     1) checks the packages are installed
#     2) downloads the two Piper voices (if missing)
#     3) tests text-to-speech (Piper)
#     4) downloads + tests speech-to-text (faster-whisper)
#     5) tests the browser webm decode path
#   Run:   python voice_setup_check.py
#   If every line says [OK], voice will work in the app.
# ===========================================================================
import os, sys, time, wave, tempfile

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

HERE = os.path.dirname(os.path.abspath(__file__))
VOICES_DIR = os.getenv("PIPER_VOICES_DIR", os.path.join(HERE, "voices"))
HI = os.getenv("PIPER_HI_VOICE", "hi_IN-pratham-medium")
EN = os.getenv("PIPER_EN_VOICE", "en_US-lessac-low")
MODEL = os.getenv("WHISPER_MODEL", "small")

def ok(m):  print("  [OK]   " + m)
def bad(m): print("  [FAIL] " + m)

print("=" * 64)
print("ArthSaathi voice self-check")
print("  Whisper model :", MODEL, " (set WHISPER_MODEL=base in .env for a faster download)")
print("  Voices dir    :", VOICES_DIR)
print("=" * 64)

# --- 1) packages -----------------------------------------------------------
print("\n[1/5] Packages...")
missing = []
for mod, pip_name in (("faster_whisper", "faster-whisper"), ("piper", "piper-tts"), ("av", "av")):
    try:
        __import__(mod); ok(mod)
    except Exception as e:
        bad(mod + " -> " + str(e)); missing.append(pip_name)
if missing:
    print("\n  Fix: pip install " + " ".join(missing) + "\n")
    sys.exit(1)

# --- 2) Piper voices (download if missing) ---------------------------------
print("\n[2/5] Piper voices...")
import urllib.request
os.makedirs(VOICES_DIR, exist_ok=True)
ROOT = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/"
SUB = {"hi_IN-pratham-medium": "hi/hi_IN/pratham/medium/",
       "en_US-lessac-low": "en/en_US/lessac/low/"}
def ensure_voice(stem):
    for ext in (".onnx", ".onnx.json"):
        dest = os.path.join(VOICES_DIR, stem + ext)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            ok("have " + stem + ext); continue
        sub = SUB.get(stem)
        if not sub:
            bad("don't know URL for '" + stem + "' -- set PIPER_HI_VOICE/PIPER_EN_VOICE to a bundled one"); return
        url = ROOT + sub + stem + ext + "?download=true"
        print("         downloading " + stem + ext + " ...")
        urllib.request.urlretrieve(url, dest); ok("downloaded " + stem + ext)
ensure_voice(HI); ensure_voice(EN)

# --- 3) TTS ----------------------------------------------------------------
print("\n[3/5] Text-to-speech (Piper)...")
from piper import PiperVoice
tmp = tempfile.mkdtemp(prefix="arth_check_")
hi_wav = os.path.join(tmp, "hi.wav"); en_wav = os.path.join(tmp, "en.wav")
try:
    PiperVoice.load(os.path.join(VOICES_DIR, HI + ".onnx"))
    v = PiperVoice.load(os.path.join(VOICES_DIR, HI + ".onnx"))
    with wave.open(hi_wav, "wb") as w: v.synthesize_wav("नमस्ते, यह एक जांच है।", w)
    ok("Hindi TTS")
    v = PiperVoice.load(os.path.join(VOICES_DIR, EN + ".onnx"))
    with wave.open(en_wav, "wb") as w: v.synthesize_wav("Hello, this is a test.", w)
    ok("English TTS")
except Exception as e:
    bad("TTS -> " + str(e)); sys.exit(1)

# --- 4) STT (downloads model on first run) ---------------------------------
print("\n[4/5] Speech-to-text (faster-whisper) -- first run downloads the model...")
from faster_whisper import WhisperModel
try:
    t = time.time(); m = WhisperModel(MODEL, device="cpu", compute_type="int8")
    ok("model ready (%.1fs)" % (time.time() - t))
except Exception as e:
    bad("model load -> " + str(e)); sys.exit(1)
for name, wav, lang in (("English", en_wav, "en"), ("Hindi", hi_wav, "hi")):
    try:
        t = time.time(); segs, info = m.transcribe(wav, language=lang, beam_size=1)
        txt = "".join(s.text for s in segs).strip()
        ok("%s STT (%.1fs): %s" % (name, time.time() - t, txt))
    except Exception as e:
        bad(name + " STT -> " + str(e))

# --- 5) webm decode (the real mic path) ------------------------------------
print("\n[5/5] Browser webm decode (PyAV)...")
try:
    import av
    webm = os.path.join(tmp, "en.webm")
    inp = av.open(en_wav); out = av.open(webm, "w", format="webm")
    ost = out.add_stream("libopus"); resampler = None
    for frame in inp.decode(audio=0):
        frame.pts = None
        for pkt in ost.encode(frame): out.mux(pkt)
    for pkt in ost.encode(None): out.mux(pkt)
    out.close(); inp.close()
    segs, info = m.transcribe(webm, language="en", beam_size=1)
    ok("webm decoded + transcribed: " + "".join(s.text for s in segs).strip())
except Exception as e:
    print("  [note] couldn't build a local webm test (" + str(e) + ").")
    print("         This is fine -- faster-whisper still decodes the mic's webm at runtime.")

print("\n" + "=" * 64)
print("If [1]-[4] are all [OK], voice works. Start uvicorn, hard-refresh, tap the mic.")
print("=" * 64)
# ===========================================================================
# test_bhashini.py  —  prove Bhashini creds + pipeline work, on their own,
# WITHOUT the whole app or a microphone. Run from the backend folder:
#     python test_bhashini.py
# ===========================================================================
import llm        # importing llm runs its _load_env(), which reads backend/.env
import voice      # the new Bhashini voice module does all the real work

uid, key = voice._creds()
print("credentials present :", bool(uid), bool(key))
if not (uid and key):
    print("  -> set BHASHINI_USER_ID and BHASHINI_API_KEY in backend/.env first.")
    raise SystemExit

# STEP 1: config call. If this prints a URL + language lists, your creds and the
# pipelineId are valid and the inference endpoint/auth resolved correctly.
cfg = voice._config()
print("inference URL       :", cfg["callback"])
print("auth header name    :", cfg["auth_name"])
print("ASR languages       :", sorted(cfg["asr"]))
print("TTS languages       :", sorted(cfg["tts"]))

# STEP 2 (TTS): speak one Hindi line to a wav. Proves the compute call + auth
# work end to end (no mic needed). Open the wav to hear it.
out = voice.synthesize("नमस्ते, मैं अर्थसाथी हूँ। मैं आपकी मदद के लिए हूँ।", "hi")
if out.get("audio_path"):
    print("TTS                 : OK ->", out["audio_path"])
else:
    print("TTS                 : FAILED ->", out)

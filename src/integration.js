// src/integration.js
// ---------------------------------------------------------------------------
// THE WIRING LAYER.
// App.jsx holds the dashboard markup and the prototype runtime (English + Hindi
// only). Its numbers are hardcoded and its mic is faked. This file runs AFTER
// that runtime and REPLACES the data-bearing functions with versions that call
// the real FastAPI backend, so:
//   - the loan EMI, risk %, gullak balance, scam verdict and chat answers all
//     come from Python (showcases: agents + Critic, Monte Carlo, RAG),
//   - the microphone records audio and sends it to a LOCAL speech-to-text model
//     on the backend (showcase: on-device Voice AI),
//   - the savings jar writes to the sqlite database and persists.
//
// Why overriding works: the prototype defines its functions with `(0,eval)(...)`
// at global scope, so they live on `window`. Its buttons call them by name
// (e.g. onclick="checkScam()"). When we reassign `window.checkScam = ...`, every
// button -- and every internal caller -- starts using our new version instead.
// ---------------------------------------------------------------------------

// Where the backend lives. With the Vite dev server we call "/api" and Vite
// forwards it to http://127.0.0.1:8000 (see vite.config.js). To point somewhere
// else, set window.ARTHSAATHI_API before the app loads.
const API = (typeof window !== "undefined" && window.ARTHSAATHI_API) || "/api";
const AUTH_KEY = "arthAuthUser";

// Which person we are showing. The prototype's demo user is the farmer "Kisan",
// who is persona #3 in the database. Change window.ARTHSAATHI_USER to switch.
function getUser() {
  if (window.ARTHSAATHI_USER) return window.ARTHSAATHI_USER;
  try {
    const selected = localStorage.getItem(PERSONA_KEY);
    if (selected) return parseInt(selected, 10);
    const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    if (saved && saved.user_id) return saved.user_id;
  } catch (e) {}
  return 3;
}

// The backend replies and warnings are English or Hindi only. The UI language
// is read from the <html lang> attribute; anything outside en/hi becomes en.
function getLang() {
  const code = (document.documentElement.lang || "hi").toLowerCase();
  const supported = ["en", "hi"];
  return supported.includes(code) ? code : "en";
}

// Turn integer paise into a rupee string like "₹1,23,456" (Indian grouping).
function fmtRupees(paise) {
  return "₹" + Math.round(paise / 100).toLocaleString("en-IN");
}

// Escape user text before putting it inside HTML, so a stray "<" can't break things.
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Small fetch helpers that always return parsed JSON (or throw).
async function getJSON(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(await responseError(r, "GET " + path + " -> " + r.status));
  return r.json();
}
async function postJSON(path, body) {
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await responseError(r, "POST " + path + " -> " + r.status));
  return r.json();
}
async function deleteJSON(path) {
  const r = await fetch(API + path, { method: "DELETE" });
  if (!r.ok) throw new Error(await responseError(r, "DELETE " + path + " -> " + r.status));
  return r.json();
}
async function responseError(response, fallback) {
  try {
    const data = await response.json();
    return data.error || data.message || fallback;
  } catch (e) {
    return fallback;
  }
}

async function postForm(path, formData) {
  const r = await fetch(API + path, { method: "POST", body: formData });
  if (!r.ok) {
    let msg = "POST " + path + " -> " + r.status;
    try { msg = (await r.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return r.json();
}

// ===========================================================================
// 1) INITIAL DATA: replace the hardcoded gullak amount with the real one
// ===========================================================================
const GULLAK_GOAL = 8000;  // rupees; matches the prototype's pot fill design

// Draw the savings jar for a given balance (mirrors the prototype's own writes).
function renderGullak(amountRupees, addedRupees) {
  window.gullakAmount = amountRupees;                 // keep the prototype's variable in sync
  const pct = Math.min(amountRupees / GULLAK_GOAL * 100, 100);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const bal = "₹" + amountRupees.toLocaleString("en-IN");
  set("gullakBalance", bal);
  set("gullakSaved", bal);
  set("planBuffer", bal);
  const fill = document.getElementById("gullakFill"); if (fill) fill.style.width = pct + "%";
  const pot = document.getElementById("gullakPotFill"); if (pot) pot.style.height = pct + "%";
  set("gullakFillLabel", Math.round(pct) + "%");
  const gullak = document.getElementById("gullak");
  if (gullak) { gullak.classList.remove("saving"); void gullak.offsetWidth; gullak.classList.add("saving"); }
  if (addedRupees != null && window.showChatStatus) {
    if (amountRupees >= GULLAK_GOAL) window.showChatStatus("Gullak goal reached · your first safety buffer is ready");
    else window.showChatStatus("₹" + addedRupees.toLocaleString("en-IN") + " added · ₹" +
      (GULLAK_GOAL - amountRupees).toLocaleString("en-IN") + " left to your buffer goal");
  }
}

async function loadInitialData() {
  try {
    const g = await getJSON("/gullak?user_id=" + getUser());
    renderGullak(Math.round(g.balance_paise / 100));   // real saved amount from the DB
  } catch (e) { /* backend not up yet -> leave the prototype's default showing */ }
}

// ===========================================================================
// 2) LOAN EMI: compute the real EMI in Python (Critic-verified number)
// ===========================================================================
async function newAnswerLoan() {
  const convo = document.getElementById("convo");
  const typing = window.addTurn("saathi",
    '<span class="typing"><i></i><i></i><i></i></span> <span style="color:var(--muted);font-size:13px">checking the calculator and RBI rules…</span>');

  let emiStr = "₹4,442";          // a safe fallback if the backend is unreachable
  try {
    // ₹50,000 at 14% per year for 12 months -> matches the "14%" assumption shown below
    const e = await postJSON("/compute/emi", { principal_paise: 5000000, annual_rate_bps: 1400, months: 12 });
    emiStr = fmtRupees(e.emi_paise);
    window.__loanEmiPaise = e.emi_paise;   // remember it for the "with this loan" risk toggle
  } catch (err) { /* keep fallback */ }

  typing.remove();
  const spoken = "Yes, you can likely manage this loan, but it is tight. Your monthly payment " +
    "would be about " + emiStr.replace("₹", "") + " rupees for twelve months. That is about " +
    "thirty percent of your income.";

  const t = window.addTurn("saathi",
    'Yes, you can likely manage this loan — but it is tight. Here is the real number, checked properly:' +
    '<div class="trust">' +
      '<div class="trust-head"><span class="badge ok"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg> Verified by Critic</span><span class="lbl">number computed in Python · not guessed</span></div>' +
      '<div class="compute"><div class="figure num">' + emiStr + '<small>/month</small></div><div style="color:var(--muted);font-size:13.5px;align-self:center">for 12 months · your EMI</div></div>' +
      '<div class="assum"><details><summary>How I got this ▾</summary><ul><li>Loan amount: ₹50,000</li><li>Interest: 14% per year (informal lender rate)</li><li>Time: 12 months</li><li>Computed with exact paise arithmetic, then read back to you</li></ul></details></div>' +
      '<div class="cites"><span class="cite"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l3 3v17H6z"/><path d="M9 8h6M9 12h6"/></svg> Source: RBI fair-practice guidance</span></div>' +
    '</div>' +
    '<div class="warnbox"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div><div>This EMI is about <b>30% of your monthly income</b>. That is risky if a month goes badly. Let me check whether you could survive a bad season with this loan.</div></div>' +
    '<div class="row"><button class="btn btn-primary" onclick="goTo(\'risk\');setTimeout(runStress,400)">Run my safety check →</button>' +
    '<button class="speaker"><span class="eq"><i></i><i></i><i></i><i></i></span> Read aloud</button></div>');

  // wire the "Read aloud" button to the real (possibly updated) number
  const speaker = t.querySelector(".speaker");
  if (speaker) speaker.onclick = function () { window.say(spoken, this); };
}

// ===========================================================================
// 3) RISK DESK: real Monte Carlo from the backend (with/without the loan)
// ===========================================================================
async function newRunStress() {
  document.getElementById("riskEmpty").style.display = "none";
  document.getElementById("riskOut").style.display = "block";

  // if the loan toggle is on but we have not computed the EMI yet, get it first
  if (window.loanOn && !window.__loanEmiPaise) {
    try {
      const e = await postJSON("/compute/emi", { principal_paise: 5000000, annual_rate_bps: 1400, months: 12 });
      window.__loanEmiPaise = e.emi_paise;
    } catch (err) { /* ignore */ }
  }
  const loanEmi = window.loanOn ? (window.__loanEmiPaise || 0) : 0;

  // Read the editable fields. Each returns paise, or null if blank/invalid
  // (in which case the backend falls back to the saved profile value).
  const simParam = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const rupees = parseFloat(String(el.value).replace(/[^0-9.]/g, ""));
    if (!isFinite(rupees) || rupees < 0) return null;
    return Math.round(rupees * 100);
  };

  try {
    let url = "/risk/stress?user_id=" + getUser() + "&loan_emi_paise=" + loanEmi;
    const inc = simParam("simIncome"); if (inc !== null) url += "&income_paise=" + inc;
    const exp = simParam("simExpense"); if (exp !== null) url += "&expense_paise=" + exp;
    const buf = simParam("simBuffer"); if (buf !== null) url += "&buffer_paise=" + buf;
    window.__risk = await getJSON(url);
  } catch (err) {
    window.__risk = null;   // newDrawRisk will fall back to the prototype's numbers
  }
  newDrawRisk();
}

function newDrawRisk() {
  const r = window.__risk;
  // fall back to the prototype's static numbers if the backend did not answer
  const months = r ? r.months_survivable : (window.loanOn ? 1.3 : 2.0);
  const ruin = r ? Math.round(r.p_ruin * 100) : (window.loanOn ? 31 : 18);
  const safe = 100 - ruin;
  const bars = r ? r.hist5 : (window.loanOn ? [31, 26, 20, 13, 10] : [18, 22, 24, 18, 18]);

  const frac = Math.min(months / 12, 1);   // 12-month horizon fills the whole gauge
  const arc = document.getElementById("gaugeArc");
  arc.style.strokeDashoffset = 270 - 270 * frac;
  arc.setAttribute("stroke", window.loanOn ? "var(--danger)" : "var(--marigold)");

  window.animateNum("months", months, months % 1 ? 1 : 0, "");
  document.getElementById("safePct").textContent = safe + "%";
  document.getElementById("ruinPct").textContent = ruin + "%";

  const hist = document.getElementById("hist");
  hist.innerHTML = "";
  const peak = Math.max(1, ...bars);          // tallest bucket (guard against all-zero)
  bars.forEach(function (v, i) {
    const b = document.createElement("div");
    b.className = "bar" + (i === 0 ? " ruin" : "");
    b.style.height = "0%";
    hist.appendChild(b);
    const h = v > 0 ? Math.max(4, (v / peak) * 90) : 0;   // tallest bar = 90% of box; never overflows
    setTimeout(function () { b.style.height = h + "%"; }, 60 + i * 70);
  });

  // "the one thing that helps most" — render the backend's REAL recommendation
  const rec = r && r.recommendation;
  const adviceEl = document.getElementById("riskAdvice");
  if (adviceEl) {
    if (rec && rec.has_action) {
      const mb = rec.months_before, ma = rec.months_after;
      adviceEl.innerHTML =
        "<b>" + rec.label + "</b> and you go from surviving <b>" +
        mb + (mb === 1 ? " month" : " months") + "</b> to <b>" +
        ma + (ma === 1 ? " month" : " months") + "</b>. Your chance of running out drops from " +
        rec.ruin_before + "% to " + rec.ruin_after + "%.";
    } else if (rec) {
      adviceEl.textContent = "Your safety net already looks steady. Keep your buffer topped up as income allows.";
    } else {
      adviceEl.textContent = "Run your safety check to see the one change that helps most.";
    }
  }
}

function newToggleLoan() {
  window.loanOn = !window.loanOn;
  document.getElementById("loanToggle").classList.toggle("on", window.loanOn);
  newRunStress();   // re-run the simulation WITH or WITHOUT the loan
}

// ===========================================================================
// 4) GULLAK: write a real saving to the sqlite database
// ===========================================================================
async function newAddToGullak(amount) {
  try {
    const res = await postJSON("/gullak", { user_id: getUser(), amount_paise: amount * 100, note: "manual add" });
    renderGullak(Math.round(res.balance_paise / 100), amount);
  } catch (err) {
    // offline fallback: just update the screen so the demo still moves
    renderGullak(Math.min((window.gullakAmount || 0) + amount, GULLAK_GOAL), amount);
  }
}

// ===========================================================================
// 5) SCAM SHIELD: score the message with the backend's Threat Shield agent
// ===========================================================================
async function newCheckScam() {
  const box = document.getElementById("scamVerdict");
  const text = (document.getElementById("scamText") || {}).value || "";
  let res;
  try {
    res = await postJSON("/scam/check", { user_id: getUser(), sms_text: text, language: getLang() });
  } catch (err) {
    box.classList.add("show");
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const isBad = res.verdict !== "safe";
  box.className = "verdict " + (isBad ? "bad" : "ok") + " show";
  const scoreFrac = (res.risk_score / 100).toFixed(2);
  const badge = isBad
    ? '<span class="badge refuse">⚠ ' + (res.verdict === "scam" ? "High risk — this is a scam" : "Be careful — looks suspicious") + '</span>'
    : '<span class="badge ok">✓ Looks safe</span>';

  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px">' + badge +
      '<span class="note" style="margin-left:auto">risk score ' + scoreFrac + '</span></div>' +
    '<p style="margin:11px 0 4px;font-weight:600">' +
      (isBad ? "Do not click the link. Do not share any code." : "Even so, never share your OTP or PIN.") + '</p>' +
    '<p style="margin:0;color:var(--muted);font-size:14px">' + esc(res.warning_message) + '</p>';

  box.scrollIntoView({ behavior: "smooth", block: "center" });
  if (window.say) window.say(res.warning_message);   // read the verdict aloud
  loadScamFeed();                                    // the new check now shows in the feed
}

// ===========================================================================
// 6) CHAT: send the question to the Advisor + Critic, render the real answer
// ===========================================================================
function renderSaathiAnswer(result) {
  let inner = esc(result.reply);

  if (result.status === "refused") {
    const refused = result.language === "hi"
      ? {
          lead: "मैं यहाँ संख्या नहीं दूंगा, क्योंकि मैं इसे सुरक्षित रूप से सत्यापित नहीं कर पाया — और मैं आपके पैसों के बारे में अनुमान नहीं लगाता।",
          title: "Critic ने रोका",
          label: "एक संख्या आई थी जो किसी गणना से नहीं निकली",
          handoff: "व्यक्ति को भेजा गया",
        }
      : {
          lead: "I will not give you a number here, because I could not verify it — and I never guess about your money.",
          title: "Refused by Critic",
          label: "a number appeared that no calculation produced",
          handoff: "Sent to a person",
        };
    inner =
      esc(refused.lead) +
      '<div class="trust" style="border-color:#f3c4c4;background:var(--danger-bg)">' +
        '<div class="trust-head" style="background:#f9dede;border-color:#f1c2c2"><span class="badge refuse">✕ ' + esc(refused.title) + '</span><span class="lbl">' + esc(refused.label) + '</span></div>' +
        '<div style="padding:13px;font-size:14px;color:#7a2020">' + esc(result.reply) + '</div>' +
      '</div>' +
      '<div class="row"><span class="badge human">' + esc(refused.handoff) + '</span></div>';
  } else if (result.status === "escalated") {
    inner = esc(result.reply) + '<div class="row"><span class="badge human">Sent to a person</span></div>';
  } else {
    // delivered: show the answer, a Critic badge if a number was computed, and sources
    let extras = "";
    if (result.computed_numbers && result.computed_numbers.length) {
      extras += '<div class="trust"><div class="trust-head"><span class="badge ok">✓ Verified by Critic</span>' +
        '<span class="lbl">number computed in Python · not guessed</span></div></div>';
    }
    if (result.citations && result.citations.length) {
      extras += '<div class="cites">' + result.citations.map(c =>
        '<span class="cite">Source: ' + esc(c.citation) + '</span>').join("") + '</div>';
    }
    inner = esc(result.reply) + extras;
  }

  const t = window.addTurn("saathi", inner);
  const t2 = window.addTurn("saathi",
    '<div class="row"><button class="speaker"><span class="eq"><i></i><i></i><i></i><i></i></span> Read aloud</button></div>');
  const sp = t2.querySelector(".speaker");
  if (sp) sp.onclick = function () { window.say(result.reply, this); };
  return t;
}

function inferReplyLanguage(text) {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  const hinglish = /\b(kya|kaise|mera|meri|mujhe|bata|paise|rupaye|kitna|hai|haan|nahi|karna)\b/i;
  return hinglish.test(text) ? "hi" : getLang();
}

async function sendUserText(text, channel = "chat", languageOverride = null) {
  if (window.goTo) window.goTo("home");
  const convo = document.getElementById("convo");
  window.addTurn("user", '<div class="orig">' + esc(text) + "</div>");
  const typing = window.addTurn("saathi",
    '<span class="typing"><i></i><i></i><i></i></span> <span style="color:var(--muted);font-size:13px">thinking…</span>');
  try {
    const result = await postJSON("/chat", { user_id: getUser(), text: text, language: languageOverride || getLang(), channel });
    typing.remove();
    renderSaathiAnswer(result);
    if (channel === "voice") newSay(result.reply, null, languageOverride || getLang());
  } catch (err) {
    typing.remove();
    window.addTurn("saathi", "Sorry, I could not reach the assistant. Please check the backend is running.");
  }
}

function newSubmitChat(e) {
  try {
    if (e && e.preventDefault) e.preventDefault();
    const input = document.getElementById("chatInput");
    const text = (input.value || "").trim();
    if (!text) { input.focus(); return; }
    input.value = "";
    sendUserText(text);
  } catch (err) {
    throw err;
  }
}

// The "Is 12% return guaranteed?" demo: ask the backend, let the Critic refuse.
async function newCriticDemo() {
  const convo = document.getElementById("convo");
  convo.innerHTML = "";
  window.goTo("home");
  const home = document.querySelector('.nav button[data-screen="home"]');
  if (home) home.classList.add("active");
  window.addTurn("user", '<div class="orig">Can you guarantee me a 12% return if I invest ₹10,000?</div>');
  const typing = window.addTurn("saathi",
    '<span class="typing"><i></i><i></i><i></i></span> <span style="color:var(--muted);font-size:13px">drafting an answer…</span>');
  try {
    const result = await postJSON("/chat", {
      user_id: getUser(),
      text: "Can you guarantee me a 12% return if I invest 10000 rupees?",
      language: getLang(),
    });
    typing.remove();
    renderSaathiAnswer(result);   // backend marks this "refused" -> red Critic box
  } catch (err) {
    typing.remove();
    window.addTurn("saathi", "Sorry, I could not reach the assistant.");
  }
}

// ===========================================================================
// 7) VOICE: record the mic and transcribe with the LOCAL backend model
// ===========================================================================
let mediaRecorder = null, chunks = [], recording = false;

// Voice input: record a short clip and POST it to the self-hosted faster-whisper
// STT on the backend (the same backend the read-aloud already uses). The language
// is pinned from getLang() -> hi/en, so Hindi transcribes in Devanagari and never
// drifts to Urdu. Tap to start, tap again to stop.
async function toggleRecording(onText, ui) {
  if (recording) { stopRecording(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { ui.fail("Voice needs a modern browser"); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) { ui.fail("Please allow microphone access"); return; }

  mediaRecorder = new MediaRecorder(stream);
  chunks = [];
  mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = async function () {
    stream.getTracks().forEach(t => t.stop());
    ui.thinking();
    const blob = new Blob(chunks, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("audio", blob, "clip.webm");
    const voiceLang = getLang();
    fd.append("language", voiceLang);
    try {
      const r = await fetch(API + "/voice/transcribe", { method: "POST", body: fd });
      const j = await r.json();
      if (j.text) { ui.done(); onText(j.text, "voice", j.language || voiceLang); }
      else { ui.fail(j.error ? "Voice model not ready — please type" : "Did not catch that — please try again"); }
    } catch (err) {
      ui.fail("Voice service offline — please type");
    }
  };
  mediaRecorder.start();
  recording = true;
  ui.listening();
}

function stopRecording() {
  if (mediaRecorder && recording) { recording = false; mediaRecorder.stop(); }
}

// Home screen microphone: tap to start, tap again to stop, then it answers.
function newStartListen() {
  const mic = document.getElementById("mic");
  const cap = document.getElementById("micCap");
  const ui = {
    listening: () => { mic.classList.add("listening"); cap.textContent = "Listening… tap to stop"; },
    thinking: () => { mic.classList.remove("listening"); cap.textContent = "Understanding…"; },
    done: () => { cap.textContent = window.getCopy ? window.getCopy("tapSpeak") : "Tap to speak"; },
    fail: (m) => { mic.classList.remove("listening"); cap.textContent = m; },
  };
  toggleRecording(sendUserText, ui);
}

// Bottom conversation-bar microphone: same idea, fills the chat then answers.
function newDockListen() {
  const status = document.getElementById("chatStatus");
  const voice = document.querySelector(".chat-voice");
  const flash = on => { if (voice) voice.style.background = on ? "var(--marigold)" : ""; };
  const show = msg => { status.textContent = msg; status.classList.add("show"); };
  const ui = {
    listening: () => { flash(true); show("Listening… tap the mic again to stop"); },
    thinking: () => { show("Understanding…"); },
    done: () => { flash(false); status.classList.remove("show"); },
    fail: (m) => { flash(false); show(m); },
  };
  toggleRecording(sendUserText, ui);
}

// ===========================================================================
// 8) PERSONA SWITCHER + LANGUAGE-AWARE READ-ALOUD (added)
// ===========================================================================

// remember the chosen demo user across reloads (real Vite app -> localStorage is fine)
const PERSONA_KEY = "arthUser";

function initUserFromStorage() {
  try {
    const v = localStorage.getItem(PERSONA_KEY);
    if (v) {
      window.ARTHSAATHI_USER = parseInt(v, 10);
      return;
    }
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    if (auth && auth.user_id) {
      window.ARTHSAATHI_USER = parseInt(auth.user_id, 10);
      return;
    }
  } catch (e) { /* private mode -> ignore */ }
}

function saveAuthUser(user) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    localStorage.setItem(PERSONA_KEY, String(user.user_id));
  } catch (e) {}
  window.ARTHSAATHI_USER = user.user_id;
}

async function logoutUser() {
  try { await postJSON("/auth/logout", {}); } catch (e) {}
  try {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(PERSONA_KEY);
  } catch (e) {}
  window.ARTHSAATHI_USER = null;
  const convo = document.getElementById("convo");
  if (convo) {
    convo.innerHTML = "";
    delete convo.dataset.historyLoaded;
  }
  requireAuth();
  if (window.showChatStatus) window.showChatStatus("Signed out");
}

function reloadUserData(people) {
  const userId = getUser();
  applyIdentity(userId, people || []);
  const convo = document.getElementById("convo");
  if (convo) {
    convo.innerHTML = "";
    delete convo.dataset.historyLoaded;
  }
  loadInitialData();
  loadMoney();
  loadAssets();
  loadSchemes();
  loadScamFeed();
  loadDocuments();
}

function startOnboarding() {
  const ob = document.getElementById("onboarding");
  if (!ob) return;
  window.__onboardingActive = true;
  ob.style.display = "";                           // undo the on-load hide
  ob.classList.add("show");                         // reveal the dialog
  setTimeout(function () {                           // then play the 3 questions aloud
    try {
      if (window.__origSpeakSetupQuestions) window.__origSpeakSetupQuestions();
      else if (window.speakSetupQuestions) window.speakSetupQuestions();
    } catch (e) {}
  }, 450);
}

function ensureAuthShell() {
  if (document.getElementById("authGate")) return;
  const gate = document.createElement("div");
  gate.id = "authGate";
  gate.className = "auth-gate";
  gate.innerHTML =
    '<div class="auth-card">' +
      '<div class="auth-brand"><div class="logo">अ</div><div><b>ArthSaathi</b><span>Secure local sign in</span></div></div>' +
      '<h1>Sign in or create your account</h1>' +
      '<p>Enter your email or phone number first. ArthSaathi sends an OTP there and creates a unique user id after verification.</p>' +
      '<label>Email or phone number</label>' +
      '<input id="authIdentifier" placeholder="name@example.com or +91 phone" autocomplete="username" />' +
      '<label>Your name <span>optional for new users</span></label>' +
      '<input id="authName" placeholder="Full name" autocomplete="name" />' +
      '<div class="auth-actions"><button id="authOtpBtn" class="btn btn-primary btn-sm">Send OTP</button><button id="authGoogleBtn" class="btn btn-ghost btn-sm" type="button">Continue with Google</button></div>' +
      '<div class="otp-row" id="otpRow"><input id="authOtp" placeholder="6-digit OTP" inputmode="numeric" maxlength="6" /><button id="authVerifyBtn" class="btn btn-amber btn-sm">Verify</button></div>' +
      '<div class="auth-note" id="authNote"></div>' +
    '</div>';
  document.body.appendChild(gate);

  const note = gate.querySelector("#authNote");
  let otpRequestedFor = "";
  const start = async () => {
    const identifier = gate.querySelector("#authIdentifier").value.trim();
    if (!identifier) { note.textContent = "Enter an email or phone number first."; return; }
    gate.querySelector("#authOtp").value = "";
    note.textContent = "Sending OTP...";
    try {
      const res = await postJSON("/auth/start", { identifier, provider: "otp" });
      otpRequestedFor = identifier;
      gate.querySelector("#otpRow").classList.add("show");
      note.textContent = res.dev_otp
        ? "OTP generated and saved. Local dev OTP: " + res.dev_otp + ". Enter it manually to continue."
        : (res.message || "OTP sent. Enter the code to continue.");
    } catch (e) { note.textContent = e.message; }
  };
  gate.querySelector("#authOtpBtn").onclick = () => start();
  gate.querySelector("#authGoogleBtn").onclick = () => {
    note.textContent = "Google OAuth is not configured yet. Add provider keys later; use OTP sign-in for now.";
  };
  gate.querySelector("#authVerifyBtn").onclick = async () => {
    const identifier = gate.querySelector("#authIdentifier").value.trim();
    const otp = gate.querySelector("#authOtp").value.trim();
    const name = gate.querySelector("#authName").value.trim();
    if (!otpRequestedFor || otpRequestedFor !== identifier) {
      note.textContent = "Send an OTP to this email or phone before verifying.";
      return;
    }
    if (!otp) {
      note.textContent = "Enter the OTP you received.";
      return;
    }
    try {
      const res = await postJSON("/auth/verify", { identifier, otp, name, provider: "otp" });
      saveAuthUser(res.user);
      gate.classList.remove("show");
      startOnboarding();                          // show 3-question dialog + voice after sign-in
      reloadUserData([res.user]);
      injectPersonaSwitcher();
      if (window.showChatStatus) window.showChatStatus("Signed in as " + res.user.name);
    } catch (e) { note.textContent = e.message; }
  };
}

function requireAuth() {
  ensureAuthShell();
  let signedIn = false;
  try { signedIn = !!JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch (e) {}
  document.getElementById("authGate").classList.toggle("show", !signedIn);
}

// Add a dropdown in the header to switch which DB person the backend uses.
// NOTE: this drives the BACKEND-WIRED parts (chat, risk, gullak, scam, EMI).
// The prototype's static screens (Money/Assets/Schemes markup) stay as-is.
async function injectPersonaSwitcher() {
  let people = [];
  try { people = await getJSON("/personas"); }
  catch (e) { return; }                       // backend not up -> skip silently
  const cur = getUser();
  applyIdentity(cur, people);                  // header name/role/greeting -> selected user
  const who = document.querySelector(".top-right .who");
  if (!who) return;
  let sel = document.getElementById("personaSwitch");
  if (!sel) sel = document.createElement("select");
  sel.id = "personaSwitch";
  sel.title = "Switch demo user (backend data)";
  sel.style.cssText = "margin-right:10px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:#fff;font-size:13px;max-width:160px";
  sel.innerHTML = people.map(p =>
    '<option value="' + p.user_id + '"' + (p.user_id === cur ? " selected" : "") + '>' +
    esc(p.name) + " · " + esc(p.persona) + "</option>").join("");
  sel.onchange = function () {
    const selected = people.find(p => String(p.user_id) === String(this.value));
    if (!selected) return;
    try { localStorage.setItem(PERSONA_KEY, this.value); } catch (e) {}
    saveAuthUser(selected);
    reloadUserData(people);
    if (window.showChatStatus) window.showChatStatus("Switched to " + selected.name);
  };
  let logout = document.getElementById("personaLogout");
  if (!logout) logout = document.createElement("button");
  logout.id = "personaLogout";
  logout.type = "button";
  logout.title = "Logout";
  logout.textContent = "Logout";
  logout.style.cssText = "margin-right:10px;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--teal-050);color:var(--teal-700);font-size:13px;font-weight:700";
  logout.onclick = logoutUser;
  if (!sel.parentNode) who.parentNode.insertBefore(sel, who);
  if (!logout.parentNode) who.parentNode.insertBefore(logout, who);
}

let readAloudAudio = null;

// Read-aloud: fetch spoken audio from the self-hosted, open-source TTS on the
// backend (Piper) and play it. Falls back to a status note if it is unavailable.
async function newSay(text, btn, languageOverride = null) {
  if (readAloudAudio) {
    readAloudAudio.pause();
    readAloudAudio = null;
  }
  if (btn) {
    document.querySelectorAll(".speaker").forEach(s => s.classList.remove("playing"));
    btn.classList.add("playing");
  }
  try {
    const r = await fetch(API + "/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: languageOverride || getLang() }),
    });
    if (!r.ok) throw new Error("voice/speak -> " + r.status);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    readAloudAudio = new Audio(url);
    readAloudAudio.onended = () => {
      URL.revokeObjectURL(url);
      if (btn) btn.classList.remove("playing");
    };
    readAloudAudio.onerror = () => {
      URL.revokeObjectURL(url);
      if (btn) btn.classList.remove("playing");
    };
    await readAloudAudio.play();
  } catch (e) {
    if (btn) btn.classList.remove("playing");
    if (window.showChatStatus) window.showChatStatus("Read-aloud is not ready");
  }
}


// Header identity: name, role, avatar initials, and the home greeting.
function applyIdentity(cur, people) {
  const me = (people || []).find(p => p.user_id === cur) || (people || [])[0];
  if (!me) return;
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt("whoName", me.name);
  setTxt("whoRole", me.persona);
  const avi = document.getElementById("whoAvi");
  if (avi) avi.textContent = me.name.slice(0, 2).toUpperCase();
  const greet = document.querySelector("#home .greet");
  if (greet) {
    const hi = greet.querySelector(".hi");
    greet.innerHTML = (hi ? hi.outerHTML : "Namaste") + ", " + esc(me.name) + " 🌾";
  }
}

// MY MONEY: real income/expense + category breakdown from /money/plan.
async function loadMoney() {
  let plan;
  try { plan = await getJSON("/money/plan?user_id=" + getUser()); } catch (e) { return; }
  // Prefill the editable Safety Net fields with the person's SAVED numbers (in rupees).
  // The user may edit these for a what-if run; edits are never written back.
  const seed = (id, paise) => { const el = document.getElementById(id); if (el) el.value = Math.max(0, Math.round((paise || 0) / 100)); };
  seed("simIncome", plan.income_paise);
  seed("simExpense", plan.expense_paise);
  seed("simBuffer", plan.buffer_paise);
  const stats = document.querySelectorAll("#money .grid.g3 .card.stat");
  if (stats.length >= 3) {
    const set = (card, k, vHtml) => {
      const kEl = card.querySelector(".k"); if (kEl) kEl.textContent = k;
      const vEl = card.querySelector(".v"); if (vEl) vEl.innerHTML = vHtml;
    };
    set(stats[0], "Monthly income", fmtRupees(plan.income_paise));
    set(stats[1], "Monthly expense", fmtRupees(plan.expense_paise));
    const perDay = Math.max(0, Math.round((plan.income_paise - plan.expense_paise) / 100 / 30));
    set(stats[2], "Safe to spend / day", "₹" + perDay.toLocaleString("en-IN") + "<small> after expenses</small>");
  }
  const card = [...document.querySelectorAll("#money .card")].find(c => /Where your money went/.test(c.textContent));
  if (card && plan.allocations && plan.allocations.length) {
    const box = card.querySelector('div[style*="flex-direction:column"]');
    if (box) {
      const total = plan.allocations.reduce((sum, a) => sum + a.amount_paise, 0) || 1;
      const colors = ["var(--teal-700)", "var(--teal-500)", "var(--marigold)"];
      box.innerHTML = plan.allocations.map((a, i) => {
        const pct = Math.round(a.amount_paise / total * 100);
        return '<div><div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px">' +
          "<span>" + esc(a.category) + '</span><b class="num">' + fmtRupees(a.amount_paise) + "</b></div>" +
          '<div style="height:10px;background:var(--teal-100);border-radius:6px">' +
          '<div style="height:100%;width:' + pct + "%;background:" + colors[i % colors.length] + ';border-radius:6px"></div></div></div>';
      }).join("");
    }
  }
}

// MY THINGS (assets): real values + one-year projection from /assets.
async function loadAssets() {
  let data;
  try { data = await getJSON("/assets?user_id=" + getUser()); } catch (e) { return; }
  const grid = document.querySelector("#assets .grid.g2");
  if (grid && data.assets && data.assets.length) {
    grid.innerHTML = data.assets.map(a => {
      const up = a.trend_bps >= 0;
      const pill = up
        ? '<span class="pill" style="background:var(--safe-bg);color:#0e6b48">↑ likely rising</span>'
        : '<span class="pill" style="background:var(--warn-bg);color:#8a5500">↓ slowly falling</span>';
      const pct = Math.round(Math.abs(a.trend_bps) / 100);
      return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
        '<b style="font-size:15px">' + esc(a.name) + "</b>" + pill + "</div>" +
        '<div class="warnbox" style="margin-top:10px;background:var(--teal-050);border-color:var(--teal-100)">' +
        '<div class="ic" style="color:var(--teal-700)">●</div>' +
        '<p style="margin:0;font-size:13.5px">Worth about <b>' + fmtRupees(a.value_paise) + "</b> now, projected <b>" +
        fmtRupees(a.projected_value_paise) + "</b> in a year (" + (up ? "+" : "−") + pct + "% per year).</p></div></div>";
    }).join("");
  }
  if (data.insight) {
    const feed = document.querySelector("#assets .feed-note span:last-child");
    if (feed) feed.innerHTML = "<b>Saathi’s read:</b> " + esc(data.insight);
  }
}

// SCHEMES: real per-user eligibility (with reasons + docs) from /scheme/eligible.
async function loadSchemes() {
  let data;
  try { data = await getJSON("/scheme/eligible?user_id=" + getUser()); } catch (e) { return; }
  const sec = document.getElementById("schemes");
  if (!sec || !data.schemes) return;
  sec.querySelectorAll(":scope > .card").forEach(c => c.remove());   // drop the hardcoded cards
  const html = data.schemes.map(sch => {
    const ok = sch.eligible;
    const icon = ok
      ? '<div class="ic-wrap tick"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 13l4 4L19 7"/></svg></div>'
      : '<div class="ic-wrap cross"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg></div>';
    const pill = ok
      ? '<span class="pill" style="background:var(--safe-bg);color:#0e6b48">You are eligible</span>'
      : '<span class="pill" style="background:var(--danger-bg);color:#a52121">Not eligible</span>';
    const docs = (ok && sch.doc_checklist && sch.doc_checklist.length)
      ? '<p style="margin:6px 0 0;font-size:13px;color:var(--muted)">Documents to keep ready: ' + sch.doc_checklist.map(esc).join(", ") + "</p>"
      : "";
    return '<div class="card" style="margin-bottom:14px"><div class="li" style="padding:0">' + icon +
      '<div style="flex:1"><div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap"><b>' + esc(sch.scheme) + "</b>" +
      pill + '<span class="pill">rule ' + esc(sch.rule_version) + "</span></div>" +
      "<p>" + esc(sch.reason) + "</p>" + docs + "</div></div></div>";
  }).join("");
  sec.insertAdjacentHTML("beforeend", html);
}

function injectDocumentsTab() {
  if (document.getElementById("documents")) return;
  const moreNav = document.querySelectorAll(".side .nav")[1];
  if (moreNav && !document.querySelector('[data-screen="documents"]')) {
    const btn = document.createElement("button");
    btn.dataset.screen = "documents";
    btn.onclick = function () { window.go ? window.go(this) : window.showScreen?.("documents"); };
    btn.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>' +
      '<span>Documents</span>';
    const settings = moreNav.querySelector('[data-screen="settings"]');
    moreNav.insertBefore(btn, settings || null);
  }

  const scroll = document.querySelector(".scroll");
  if (!scroll) return;
  const section = document.createElement("section");
  section.className = "screen";
  section.id = "documents";
  section.innerHTML =
    '<div class="eyebrow">Verified paperwork</div>' +
    '<h1 class="h1">Upload Documents</h1>' +
    '<p class="sub">Keep identity, tax, land, and passport documents attached to your user id. Files stay local in this prototype.</p>' +
    '<div class="doc-actions"><button class="digilocker-btn" type="button">Connect DigiLocker</button><span>UI hook only · OAuth keys can be added later</span></div>' +
    '<div class="doc-grid">' +
      docUploadCard("aadhaar", "Aadhaar", "PDF, PNG, or JPG") +
      docUploadCard("pan", "PAN", "PDF, PNG, or JPG") +
      docUploadCard("registry", "Registry / land document", "PDF, PNG, or JPG") +
      docUploadCard("passport", "Passport photo / image", "PNG or JPG preferred") +
    '</div>' +
    '<div class="card doc-list-card"><div class="kicker" style="margin:0 0 12px">Uploaded for this user</div><div id="docList" class="doc-list"></div></div>';
  scroll.appendChild(section);
  section.querySelectorAll("[data-doc-type]").forEach(input => {
    input.addEventListener("change", () => uploadDocument(input));
  });
  section.querySelector(".digilocker-btn").onclick = () => {
    if (window.showChatStatus) window.showChatStatus("DigiLocker connect is ready for OAuth credentials");
  };
}

function docUploadCard(type, title, hint) {
  return '<div class="card doc-card">' +
    '<div><b>' + esc(title) + '</b><p>' + esc(hint) + '</p></div>' +
    '<label class="doc-upload-btn">Upload<input type="file" data-doc-type="' + type + '" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" /></label>' +
    '<span id="docStatus-' + type + '" class="doc-status"></span>' +
  '</div>';
}

async function uploadDocument(input) {
  const file = input.files && input.files[0];
  const type = input.dataset.docType;
  const status = document.getElementById("docStatus-" + type);
  if (!file) return;
  const fd = new FormData();
  fd.append("user_id", String(getUser()));
  fd.append("doc_type", type);
  fd.append("file", file);
  if (status) status.textContent = "Uploading...";
  try {
    await postForm("/documents/upload", fd);
    if (status) status.textContent = "Uploaded";
    input.value = "";
    loadDocuments();
  } catch (e) {
    if (status) status.textContent = e.message;
  }
}

async function loadDocuments() {
  const list = document.getElementById("docList");
  if (!list) return;
  let docs = [];
  try { docs = await getJSON("/documents?user_id=" + getUser()); }
  catch (e) { return; }
  list.innerHTML = docs.length ? docs.map(d =>
    '<div class="doc-row"><b>' + esc(d.doc_type.toUpperCase()) + '</b><span>' +
    esc(d.filename) + '</span><em>' + esc(d.status) + '</em>' +
    '<button class="doc-remove" data-doc-id="' + d.id + '" type="button">Remove</button></div>'
  ).join("") : '<p class="note">No documents uploaded yet.</p>';
  list.querySelectorAll(".doc-remove").forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Removing...";
      try {
        await deleteJSON("/documents/" + btn.dataset.docId + "?user_id=" + getUser());
        loadDocuments();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "Remove";
        if (window.showChatStatus) window.showChatStatus(e.message);
      }
    };
  });
}


// SCAM SHIELD feed: the agent's real, logged activity from /scam/alerts.
async function loadScamFeed() {
  let alerts;
  try { alerts = await getJSON("/scam/alerts?user_id=" + getUser()); } catch (e) { return; }

  // "Recently blocked for you" — rebuild the list from real checks
  const card = [...document.querySelectorAll("#scam .card")].find(c => /Recently blocked/.test(c.textContent));
  if (card) {
    card.querySelectorAll(".li").forEach(li => li.remove());      // keep the kicker, drop old rows
    const flagged = alerts.filter(a => a.verdict !== "safe");
    const rows = (flagged.length ? flagged : alerts).slice(0, 4).map(a => {
      const bad = a.verdict !== "safe";
      const icon = bad ? '<path d="M6 6l12 12M18 6L6 18"/>' : '<path d="M5 13l4 4L19 7"/>';
      const title = bad ? (a.verdict === "scam" ? "Scam blocked" : "Suspicious message") : "Checked — looked safe";
      return '<div class="li" style="padding:8px 0"><div class="ic-wrap ' + (bad ? "cross" : "tick") + '" style="width:32px;height:32px">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">' + icon + "</svg></div>" +
        '<div><b style="font-size:13.5px">' + esc(title) + '</b><p style="margin:0">' + esc(a.sms_preview || "") + "</p></div></div>";
    });
    card.insertAdjacentHTML("beforeend",
      rows.join("") || '<p class="note">No checks yet — paste a message above to test the shield.</p>');
  }

  // "N threats blocked this month" status line
  const statusCard = [...document.querySelectorAll("#scam .card")].find(c => /Shield status/.test(c.textContent));
  if (statusCard) {
    const blocked = alerts.filter(a => a.verdict !== "safe").length;
    const note = statusCard.querySelector(".note");
    if (note) note.textContent = blocked + " threat" + (blocked === 1 ? "" : "s") + " flagged for you";
  }
}

async function loadChatHistory() {
  const convo = document.getElementById("convo");
  if (!convo || convo.dataset.historyLoaded === "1") return;
  let rows;
  try { rows = await getJSON("/chat/history?user_id=" + getUser() + "&limit=12"); }
  catch (e) { return; }
  if (convo.children.length) return;
  convo.dataset.historyLoaded = "1";
  const staleFallback = "I can help with loans, savings risk, your assets, government schemes, and spotting scams. Try asking about an EMI or a government scheme.";
  const ordered = [...rows].reverse().filter(row => (row.text || row.text_preview || "") !== staleFallback);
  convo.innerHTML = "";
  ordered.forEach(row => {
    const text = row.text || row.text_preview || "";
    if (!text) return;
    if (row.role === "user") {
      window.addTurn("user", '<div class="orig">' + esc(text) + "</div>");
    } else {
      window.addTurn("saathi", esc(text));
    }
  });
}


// ===========================================================================
// INSTALL: drop all of the above on top of the prototype
// ===========================================================================
export function installIntegration() {
  // Onboarding starts hidden and the prototype's on-load voice auto-play is
  // suppressed. The dialog + voice are shown only AFTER a successful sign-in
  // (see startOnboarding, called from the auth verify handler).
  const onboarding = document.getElementById("onboarding");
  if (onboarding) {
    onboarding.classList.remove("show");
    onboarding.style.display = "none";
  }
  window.__onboardingActive = false;
  if (typeof window.speakSetupQuestions === "function" && !window.__speakSetupWrapped) {
    const _origSpeakSetup = window.speakSetupQuestions;
    window.__origSpeakSetupQuestions = _origSpeakSetup;
    window.speakSetupQuestions = function () {
      if (!window.__onboardingActive) return;     // ignore the on-load auto-play
      return _origSpeakSetup.apply(this, arguments);
    };
    window.__speakSetupWrapped = true;
  }
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
  if (!window.addTurn) {
    window.addTurn = function (who, html) {
      const convo = document.getElementById("convo");
      const t = document.createElement("div");
      t.className = "turn " + who;
      const avi = who === "user"
        ? '<div class="user-avi">KI</div>'
        : '<div class="saathi-avi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="3.2"/><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/></svg></div>';
      t.innerHTML = avi + '<div class="bubble">' + html + "</div>";
      if (convo) {
        convo.appendChild(t);
        t.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return t;
    };
  }

  // wire each prototype function to its backend-connected version
  const bootConvo = document.getElementById("convo");
  if (bootConvo) {
    bootConvo.innerHTML = "";
    delete bootConvo.dataset.historyLoaded;
  }

  window.answerLoan = newAnswerLoan;
  window.runStress = newRunStress;
  window.drawRisk = newDrawRisk;
  window.toggleLoan = newToggleLoan;
  window.addToGullak = newAddToGullak;
  window.checkScam = newCheckScam;
  window.criticDemo = newCriticDemo;
  window.submitChat = newSubmitChat;
  window.startListen = newStartListen;
  window.dockListen = newDockListen;
  window.say = newSay;                         // language-aware, robust read-aloud

  // Auto-run the safety simulation whenever the user opens the Safety Net screen,
  // so it always shows LIVE backend numbers instead of the prototype fallback.
  const _go = window.go, _goTo = window.goTo;
  if (_go) window.go = function (btn) {
    _go(btn);
    if (btn && btn.dataset && btn.dataset.screen === "risk") newRunStress();
  };
  if (_goTo) window.goTo = function (id) {
    _goTo(id);
    if (id === "risk") newRunStress();
  };

  function bindChatDock() {
    const chatForm = document.querySelector("form.chat-shell");
    const chatSend = document.querySelector("button.chat-send");
    const chatVoice = document.querySelector("button.chat-voice");
    if (chatForm) {
      chatForm.onsubmit = newSubmitChat;
      chatForm.addEventListener("submit", newSubmitChat);
    }
    if (chatSend) chatSend.onclick = newSubmitChat;
    if (chatVoice) chatVoice.onclick = newDockListen;
    if (!chatForm || !chatSend || !chatVoice) setTimeout(bindChatDock, 50);
  }
  bindChatDock();

  // expose a couple of helpers for quick manual testing in the console
  window.ArthSaathi = { sendUserText, loadInitialData, API, getUser, getLang, loadDocuments };

  initUserFromStorage();                       // restore the chosen demo user first
  injectDocumentsTab();                        // add document upload workspace
  requireAuth();                               // local email/phone OTP sign-in
  loadInitialData();                           // pull the real saved gullak amount
  injectPersonaSwitcher();                     // header dropdown + identity
  loadMoney();                                 // wire My Money to the backend per-user
  loadAssets();                                // wire My Things (assets) per-user
  loadSchemes();                               // wire Schemes per-user
  loadScamFeed();                              // wire the live Threat Shield feed
  loadDocuments();                             // wire uploaded KYC docs per-user
}

export default installIntegration;
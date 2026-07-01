import { useLayoutEffect, useRef } from "react";
import { installIntegration } from "./integration";

// ===========================================================================
// ArthSaathi frontend = THIS file + integration.js. Only English and Hindi.
//   markup  : the dashboard HTML for every screen (injected once)
//   runtime : the vanilla-JS behaviour for that HTML (run once; installs the
//             prototype's global handlers used by the inline onclick attributes)
// integration.js runs last and swaps the demo functions for real backend calls.
// ===========================================================================
const markup = `<!-- first-login personalisation -->
<div class="onboard show" id="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboardTitle">
  <div class="onboard-card">
    <div class="onboard-top">
      <div class="onboard-brand">अ</div>
      <div><b>ArthSaathi में स्वागत · Welcome</b><div style="font-size:10px;color:var(--muted)">आपकी सुविधा के अनुसार · Made comfortable for you</div></div>
      <div class="onboard-progress" aria-label="Onboarding progress"><i class="on"></i><i></i><i></i><i></i></div>
      <button class="onboard-skip" onclick="finishOnboarding()">Skip for now</button>
    </div>
    <div class="onboard-body">
      <section class="onboard-step show" data-onboard-step="1">
        <div class="onboard-eyebrow">Step 1 of 4 · तीन आसान सवाल / Three simple questions</div>
        <h2 class="onboard-title" id="onboardTitle">पहले आपको बेहतर समझ लें<br><span style="font-size:.7em;color:var(--muted)">First, let us understand what feels comfortable</span></h2>
        <div class="bilingual-note">🔊 हर सवाल स्क्रीन पर भी है और आवाज़ में भी। / Every question is available as text and voice.</div>
        <div class="question-voice"><div><b>सभी तीन सवाल सुनें / Hear all three questions</b>Hindi first, then English</div><button id="questionVoiceBtn" onclick="speakSetupQuestions()">▶ Play voice</button></div>

        <div class="setup-question">
          <div class="setup-question-head"><span class="setup-question-icon">👁️</span><div><b>क्या आप स्क्रीन साफ़ देख सकते हैं?</b><small>Can you see the screen clearly?</small></div></div>
          <div class="setup-options">
            <button class="setup-choice" onclick="chooseVision('clear',this)">हाँ, साफ़ / Yes, clearly</button>
            <button class="setup-choice" onclick="chooseVision('low',this)">थोड़ी कठिनाई / Some difficulty</button>
            <button class="setup-choice" onclick="chooseVision('audio',this)">नहीं, आवाज़ चाहिए / No, use audio</button>
          </div>
        </div>

        <div class="setup-question">
          <div class="setup-question-head"><span class="setup-question-icon">🌐</span><div><b>आप किस भाषा में सहज हैं?</b><small>Which language are you comfortable in?</small></div></div>
          <select class="language-question-select" id="onboardLanguage" aria-label="Comfortable language" onchange="selectSetupLanguage()"><option value="hi" selected>हिन्दी — Hindi</option><option value="en">English</option></select>
        </div>

        <div class="setup-question">
          <div class="setup-question-head"><span class="setup-question-icon">📖</span><div><b>क्या आप पढ़ सकते हैं?</b><small>Can you read comfortably?</small></div></div>
          <div class="setup-options">
            <button class="setup-choice" id="readChoice" onclick="chooseLiteracy('reader',this)">हाँ / Yes</button>
            <button class="setup-choice" id="voiceChoice" onclick="chooseLiteracy('voice',this)">थोड़ा / A little</button>
            <button class="setup-choice" onclick="chooseLiteracy('voice',this)">नहीं / No</button>
          </div>
        </div>
        <div class="onboard-actions"><span></span><button class="onboard-next" id="onboardContinue" disabled onclick="confirmBasicSetup()">आगे बढ़ें / Continue →</button></div>
      </section>

      <section class="onboard-step" data-onboard-step="2">
        <div class="onboard-eyebrow">Step 2 of 4 · Personal welcome</div>
        <h2 class="onboard-title" id="welcomeHeading">Welcome—Saathi now speaks your language</h2>
        <p class="onboard-sub" id="welcomeSub">Here is a message from someone like you.</p>
        <div class="welcome-story">
          <div class="farmer-face">🧑🏽‍🌾</div>
          <div><b id="welcomeStoryTitle">आपके गाँव के कमलेश ने ArthSaathi से फायदा पाया</b><p id="welcomeStoryText">उसने बोलकर अपनी योजना जाँची और बचत का तरीका समझा। आप भी एक बार कोशिश कीजिए—साथी आपकी भाषा में सुनेगा।</p></div>
        </div>
        <div class="onboard-language"><span></span><button class="voice-preview" id="welcomeVoiceBtn" onclick="playWelcomeVoice(this)">🔊 Hear welcome</button></div>
        <div class="onboard-actions"><button class="onboard-back" onclick="goOnboardStep(1)">← Back</button><button class="onboard-next" onclick="goOnboardStep(3)">Start tutorial →</button></div>
      </section>

      <section class="onboard-step" data-onboard-step="3">
        <div class="onboard-eyebrow">Step 3 of 4 · A quick practice</div>
        <h2 class="onboard-title" id="tutorialHeading">Let us learn the easiest way to use Saathi</h2>
        <p class="onboard-sub" id="tutorialSub">This tutorial will match the way you prefer to learn.</p>
        <div class="tutorial-stage" id="tutorialStage">
          <span class="tutorial-time" id="tutorialTime">▶ 30-second voice tutorial</span>
          <div class="tutorial-scene">
            <div class="tutorial-visual" id="tutorialIcon">🎙️</div>
            <h3 id="tutorialTitle">Tap the yellow microphone</h3>
            <p id="tutorialText">You do not need to type or read. Tap once, then ask about money in your own words.</p>
            <div class="tutorial-dots"><i class="on"></i><i></i><i></i><i></i></div>
          </div>
          <div class="tour-map" id="readerTour" style="display:none">
            <div class="tour-nav"><div class="on">Talk to Saathi</div><div>My Money</div><div>Safety Net</div><div>Schemes</div><div>Learn</div></div>
            <div class="tour-screen"><b>Your dashboard, one section at a time</b><p id="tourDescription">Ask by voice or text from anywhere. The bottom bar always stays with you.</p><div class="mini-card"></div><div class="mini-card"></div></div>
          </div>
          <div class="tutorial-controls"><button onclick="tutorialPrev()">← Back</button><button class="primary" id="tutorialPlayBtn" onclick="toggleTutorial()">▶ Play tutorial</button><button onclick="tutorialNext()">Next →</button></div>
        </div>
        <div class="onboard-actions"><button class="onboard-back" onclick="goOnboardStep(2)">← Back</button><button class="onboard-next" onclick="goOnboardStep(4)">I understand →</button></div>
      </section>

      <section class="onboard-step" data-onboard-step="4">
        <div class="onboard-done">
          <div class="done-icon">✓</div>
          <div class="onboard-eyebrow" id="readyEyebrow">Your Saathi is ready</div>
          <h2 class="onboard-title" id="readyTitle">बस बोलिए। Saathi साथ है।</h2>
          <p class="onboard-sub" id="readySub">Your language, voice, and learning preference are now set. You can change them anytime in Profile &amp; Safety.</p>
          <button class="onboard-next" id="readyButton" onclick="finishOnboarding()">Start using ArthSaathi →</button>
        </div>
      </section>
    </div>
  </div>
</div>

<div class="app">

  <!-- ===================== SIDEBAR ===================== -->
  <aside class="side" id="side">
    <div class="brand">
      <div class="logo">अ</div>
      <div><b>ArthSaathi</b><small data-i18n="brandTag">your money companion</small></div>
    </div>

    <div class="navlabel" data-i18n="everyday">Everyday</div>
    <nav class="nav">
      <button class="active" data-screen="home" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>
        <span data-i18n="talk">Talk to Saathi</span>
      </button>
      <button data-screen="money" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.6"/></svg>
        <span data-i18n="money">My Money</span>
      </button>
      <button data-screen="risk" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>
        <span data-i18n="safety">Safety Net</span>
        <span class="hi">●</span>
      </button>
      <button data-screen="schemes" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>
        <span data-i18n="schemes">Schemes &amp; Benefits</span>
      </button>
      <button data-screen="scam" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-4z"/><path d="M12 8v4M12 16h.01"/></svg>
        <span data-i18n="scam">Scam Shield</span>
      </button>
      <button data-screen="learn" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M7 9v5c0 1.5 2.5 3 5 3s5-1.5 5-3V9"/></svg>
        <span data-i18n="learn">Learn</span>
      </button>
    </nav>

    <div class="navlabel" data-i18n="more">More</div>
    <nav class="nav">
      <button data-screen="assets" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V7l8-4 8 4v13M9 20v-5h6v5"/><path d="M4 20h16"/></svg>
        <span data-i18n="things">My Things</span>
      </button>
      <button data-screen="legacy" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z"/></svg>
        <span data-i18n="legacy">Legacy</span>
      </button>
      <button data-screen="settings" onclick="go(this)">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1L14.5 2h-5l-.3 2.4a7 7 0 00-1.7 1l-2.4-1-2 3.4L3.1 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1L9.5 22h5l.3-2.4a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z"/></svg>
        <span data-i18n="profile">Profile &amp; Safety</span>
      </button>
    </nav>

    <div class="side-foot">
      <div class="role">
        <label data-i18n="viewAs">View as</label>
        <select id="roleSel" onchange="setRole(this.value)">
          <option value="personal">👤 Personal — a citizen</option>
          <option value="manager">🏛️ Manager — gram panchayat operator</option>
          <option value="educator">📚 Educator — NGO / teacher</option>
          <option value="admin">📊 Administrator — governance</option>
        </select>
        <div class="assist">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>
          <span data-i18n="assisted">Assisted access on, ward office</span>
        </div>
      </div>
    </div>
  </aside>
  <div class="backdrop" id="backdrop" onclick="closeSide()"></div>

  <!-- ===================== MAIN ===================== -->
  <div class="main">
    <header class="top">
      <button class="hamb" onclick="openSide()" aria-label="Menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
      <div class="search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa6a1" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input id="topSearch" placeholder="Search or ask anything — schemes, loans, lessons…" />
        <button class="micbtn" title="Search by voice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>
        </button>
        <span class="hint">Hybrid · words + meaning</span>
      </div>
      <div class="top-right">
        <span class="conn"><span class="dot"></span><span id="connText" data-i18n="online">Online</span></span>
        <div class="lang" id="langPicker">
          <button class="lang-trigger" onclick="toggleLangMenu(event)" aria-haspopup="true" aria-expanded="false">
            <span class="lang-globe">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>
            </span>
            <span class="lang-copy"><b id="currentLang">English</b><small>English & Hindi</small></span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="lang-menu" id="langMenu">
            <div class="lang-head"><b>Choose your language</b><span>Voice + text</span></div>
            
            <div class="lang-grid"><button class="lang-option on" data-code="en" onclick="setLang('en','English',this)"><span class="script">Aa</span>English</button><button class="lang-option" data-code="hi" onclick="setLang('hi','हिन्दी',this)"><span class="script">अ</span>हिन्दी</button></div>
            <div class="lang-foot">Saathi can listen, reply, and read guidance aloud in your chosen language.</div>
          </div>
        </div>
        <div class="who">
          <div class="avi" id="whoAvi">KI</div>
          <div><b id="whoName">Kisan</b><small id="whoRole">Seasonal farmer</small></div>
        </div>
      </div>
    </header>

    <div class="scroll">

      <!-- ============ HOME ============ -->
      <section class="screen show" id="home">
        <div class="hero">
          <div class="hero-inner">
            <p class="greet"><span class="hi" data-i18n="greet">Namaste</span>, Kisan 🌾</p>
            <p class="greet-sub" data-i18n="subtitle">Ask me anything about your money. No reading needed.</p>
            <div class="micwrap">
              <button class="mic" id="mic" onclick="startListen()" aria-label="Tap and speak">
                <span class="ring"></span><span class="ripple"></span><span class="ripple d2"></span><span class="ripple d3"></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8"/></svg>
              </button>
            </div>
            <p class="mic-cap" id="micCap" data-i18n="tapSpeak">Tap to speak</p>
            <div class="chips">
              <button class="chip" data-i18n="loanQ" onclick="askChip('loan')">Can I afford a loan?</button>
              <button class="chip" data-i18n="eligibleQ" onclick="goTo('schemes')">Am I eligible for PM-KISAN?</button>
              <button class="chip" data-i18n="scamQ" onclick="goTo('scam')">Is this message a scam?</button>
              <button class="chip" data-i18n="savingsQ" onclick="goTo('learn')">Teach me about savings</button>
            </div>
          </div>
        </div>

        <div class="access-rail">
          <div class="access-head">
            <div class="access-pulse">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M5.6 18.4a9 9 0 010-12.8M18.4 5.6a9 9 0 010 12.8M8.5 15.5a5 5 0 010-7M15.5 8.5a5 5 0 010 7"/></svg>
            </div>
            <div><b>One Saathi. Every channel.</b><p>No smartphone or internet? Your conversation continues from the same secure profile.</p></div>
          </div>
          <div class="channels">
            <button class="channel live"><span class="channel-icon">▣</span>Web / App</button>
            <button class="channel live"><span class="channel-icon">◉</span>WhatsApp</button>
            <button class="channel live"><span class="channel-icon">✉</span>SMS</button>
            <button class="channel assisted"><span class="channel-icon">☎</span>IVR / Voice</button>
            <button class="channel assisted"><span class="channel-icon">*99#</span>USSD</button>
            <button class="channel assisted"><span class="channel-icon">⌨</span>Keypad phone</button>
            <button class="channel assisted"><span class="channel-icon">🏛</span>Govt. centre</button>
          </div>
          <div class="channel-path">Every message becomes <b>one normalised, multilingual conversation</b> for the Advisor and trust layer.</div>
        </div>

        <div class="convo" id="convo"></div>
      </section>

      <!-- ============ RISK DESK / SAFETY NET ============ -->
      <section class="screen" id="risk">
        <div class="eyebrow">The Personal Risk Desk</div>
        <h1 class="h1">Will I be okay?</h1>
        <p class="sub">A tool from the bank's risk desk, handed to your household. We run <b>1,000 possible futures</b> for your family and show how many end in trouble, plus the one change that helps most.</p>

        <div class="card" style="margin-bottom:16px">
          <div style="font-weight:600;font-size:15px;margin-bottom:2px">Your numbers</div>
          <p class="note" style="margin:0 0 14px;max-width:52ch">Prefilled from your saved details. Change any value to explore a "what if" — edits here only affect this simulation and are not saved.</p>
          <div class="grid g3" style="gap:12px">
            <div>
              <label for="simIncome" style="display:block;font-size:12.5px;color:var(--muted);margin-bottom:5px">Monthly income (₹)</label>
              <input id="simIncome" inputmode="numeric" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-size:15px;font-family:inherit;background:var(--surface)">
            </div>
            <div>
              <label for="simExpense" style="display:block;font-size:12.5px;color:var(--muted);margin-bottom:5px">Monthly expense (₹)</label>
              <input id="simExpense" inputmode="numeric" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-size:15px;font-family:inherit;background:var(--surface)">
            </div>
            <div>
              <label for="simBuffer" style="display:block;font-size:12.5px;color:var(--muted);margin-bottom:5px">Safety buffer (₹)</label>
              <input id="simBuffer" inputmode="numeric" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-size:15px;font-family:inherit;background:var(--surface)">
            </div>
          </div>
          <div class="row" style="margin-top:14px">
            <button class="btn btn-amber" onclick="runStress()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Run with these numbers
            </button>
          </div>
        </div>

        <div id="riskEmpty" class="card" style="text-align:center;padding:36px">
          <div style="font-size:40px">🧮</div>
          <p style="font-weight:600;font-size:17px;margin:10px 0 4px">Run your safety check</p>
          <p class="note" style="max-width:42ch;margin:0 auto 16px">We simulate a thousand versions of your year — good harvests, bad ones, a sudden illness — and count how often you run out of money.</p>
          <button class="btn btn-amber" onclick="runStress()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Run 1,000 futures
          </button>
        </div>

        <div id="riskOut" style="display:none">
          <div class="grid g2" style="margin-bottom:18px">
            <div class="card">
              <div class="kicker" style="margin:0 0 8px">Your resilience score</div>
              <div class="score-card">
                <div class="gauge">
                  <svg viewBox="0 0 200 118" width="200" height="118">
                    <path d="M14 110 A86 86 0 0 1 186 110" fill="none" stroke="#ece6da" stroke-width="16" stroke-linecap="round"/>
                    <path id="gaugeArc" d="M14 110 A86 86 0 0 1 186 110" fill="none" stroke="var(--marigold)" stroke-width="16" stroke-linecap="round" stroke-dasharray="270" stroke-dashoffset="270" style="transition:stroke-dashoffset 1.1s ease"/>
                  </svg>
                  <div class="big"><b id="months">0</b><span>months you can survive with no income</span></div>
                </div>
                <div class="legend">
                  <div class="legrow"><span class="sw" style="background:var(--teal-500)"></span>You stay safe in <b id="safePct">—</b> of futures</div>
                  <div class="legrow"><span class="sw" style="background:var(--danger)"></span>You run out of money in <b id="ruinPct">—</b></div>
                  <button class="speaker" onclick="say('You can survive about two months with no income. In eighteen percent of futures you run out of money.', this)">
                    <span class="eq"><i></i><i></i><i></i><i></i></span> Read this aloud
                  </button>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="kicker" style="margin:0 0 8px">Out of 1,000 simulated years</div>
              <div class="hist" id="hist"></div>
              <div class="histx"><span>ran out</span><span>1 mo</span><span>3 mo</span><span>6 mo</span><span>survived the year</span></div>
            </div>
          </div>

          <div class="action" style="margin-bottom:18px">
            <div class="star">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6L12 2z"/></svg>
            </div>
            <div>
              <div class="kicker" style="margin:0 0 4px">The one thing that helps most</div>
              <p id="riskAdvice" style="margin:0;font-size:16px">Run your safety check to see the one change that helps most for your situation.</p>
              <p class="note">We tested every change one at a time. This buffer beat cutting expenses or changing the loan.</p>
            </div>
          </div>

          <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
            <div>
              <b style="font-size:15px">What if I take the ₹50,000 seed loan?</b>
              <p class="note" style="margin:4px 0 0">See how a new EMI changes your safety, before you borrow.</p>
            </div>
            <label class="toggle" onclick="toggleLoan(this)">
              <span class="sw-toggle" id="loanToggle"></span> Add the loan
            </label>
          </div>
        </div>
      </section>

      <!-- ============ SCHEMES ============ -->
      <section class="screen" id="schemes">
        <div class="eyebrow">Decided by rules, not a guess</div>
        <h1 class="h1">What can I get?</h1>
        <p class="sub">A government rules engine checks your details against each scheme. Every answer shows the rule version, so it is auditable, not an AI opinion.</p>

        <div class="card" style="margin-bottom:18px">
          <div class="li" style="padding-top:0">
            <div class="ic-wrap tick"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 13l4 4L19 7"/></svg></div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap"><b>PM-KISAN</b><span class="pill" style="background:var(--safe-bg);color:#0e6b48">You are eligible</span><span class="pill">rule v2024.1</span></div>
              <p>₹6,000 a year in three instalments. You match: small landholding, valid Aadhaar, active bank account.</p>
            </div>
            <button class="speaker btn-sm" onclick="say('You are eligible for PM-KISAN. You will get six thousand rupees a year. You need your Aadhaar, your land record, and your bank passbook.', this)"><span class="eq"><i></i><i></i><i></i><i></i></span></button>
          </div>
          <div style="padding:14px 0 4px 53px">
            <div class="auto-apply">
              <div class="auto-apply-icon">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/><path d="M20 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h10"/></svg>
              </div>
              <div class="auto-apply-copy"><b>Auto-apply when documents are ready</b><p>On by default. Saathi submits the verified application with the citizen’s saved consent.</p></div>
              <button class="sw-toggle on" id="autoApplyToggle" onclick="toggleAutoApply()" aria-label="Toggle auto-apply" aria-pressed="true"></button>
            </div>
            <div class="kicker" style="margin:0 0 10px">Bring these — tap as you find them</div>
            <div class="scheme-checklist" id="pmKisanChecklist">
              <div class="check done" onclick="toggleSchemeDoc(this)"><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span><span>Aadhaar card</span></div>
              <div class="check" onclick="toggleSchemeDoc(this)"><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span><span>Land ownership record (7/12 extract)</span></div>
              <div class="check" onclick="toggleSchemeDoc(this)"><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span><span>Bank passbook (front page)</span></div>
            </div>
            <div class="scheme-status" id="schemeStatus"></div>
            <div class="row"><button class="btn btn-primary btn-sm" id="manualApplyBtn">Apply with help at the ward office</button><button class="btn btn-ghost btn-sm">Print this checklist</button></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:18px">
          <div class="li" style="padding:0">
            <div class="ic-wrap tick"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 13l4 4L19 7"/></svg></div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap"><b>Pradhan Mantri Fasal Bima (crop insurance)</b><span class="pill" style="background:var(--safe-bg);color:#0e6b48">You are eligible</span><span class="pill">rule v2024.1</span></div>
              <p>Covers crop loss from a failed monsoon — directly relevant to your safety check.</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="li" style="padding:0">
            <div class="ic-wrap cross"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap"><b>Disability pension</b><span class="pill" style="background:var(--danger-bg);color:#a52121">Not eligible</span><span class="pill">rule v2024.1</span></div>
              <p>Reason given plainly: this scheme needs a disability certificate of 40% or more, which is not on your profile. Nothing is hidden.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ SCAM SHIELD ============ -->
      <section class="screen" id="scam">
        <div class="eyebrow">Always watching, with your permission</div>
        <h1 class="h1">Scam Shield</h1>
        <p class="sub">Detection is deterministic — it cannot be talked out of a real warning. Saathi only writes the alert in your language; it never decides whether something is safe.</p>

        <div class="grid g2" style="margin-bottom:18px">
          <div class="card" style="display:flex;align-items:center;gap:16px">
            <div style="width:54px;height:54px;border-radius:16px;background:var(--safe-bg);display:grid;place-items:center;color:#0e6b48">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>
            </div>
            <div><div class="kicker" style="margin:0">Shield status</div><b style="font-size:18px;color:#0e6b48">Active · protecting</b><p class="note" style="margin:2px 0 0">14 threats blocked this month</p></div>
          </div>
          <div class="card">
            <div class="kicker" style="margin:0 0 8px">Recently blocked for you</div>
            <div class="li" style="padding:8px 0"><div class="ic-wrap cross" style="width:32px;height:32px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg></div><div><b style="font-size:13.5px">Fake "KYC blocked" SMS</b><p style="margin:0">2 hours ago · link removed</p></div></div>
            <div class="li" style="padding:8px 0"><div class="ic-wrap cross" style="width:32px;height:32px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg></div><div><b style="font-size:13.5px">Loan-app harassment call</b><p style="margin:0">Yesterday · caller flagged</p></div></div>
          </div>
        </div>

        <div class="card">
          <div class="kicker" style="margin:0 0 10px">Got a message you are not sure about? Check it here</div>
          <textarea class="scaminput" id="scamText">Congratulations! Your bank KYC is BLOCKED. Update within 24 hrs or account will be suspended. Click: bit.ly/kyc-verify-now</textarea>
          <div class="row"><button class="btn btn-primary" onclick="checkScam()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>Check this message</button><span class="note">Or forward suspicious SMS to Saathi on WhatsApp</span></div>
          <div class="verdict bad" id="scamVerdict">
            <div style="display:flex;align-items:center;gap:10px"><span class="badge refuse">⚠ High risk — this is a scam</span><span class="note" style="margin-left:auto">risk score 0.96</span></div>
            <p style="margin:11px 0 4px;font-weight:600">Do not click the link. Do not share any code.</p>
            <p style="margin:0;color:var(--muted);font-size:14px">Real banks never block KYC by SMS or ask you to click a short link. The "24 hours" rush is the trick — it is designed to scare you into acting fast.</p>
            <p style="margin:9px 0 0;font-weight:600;color:#a52121" lang="hi">असली बैंक कभी SMS से KYC ब्लॉक नहीं करते। लिंक पर क्लिक न करें।</p>
            <button class="speaker" style="margin-top:11px" onclick="say('This is a scam. Do not click the link. Real banks never block your KYC by SMS. The twenty-four hours rush is a trick to scare you.', this)"><span class="eq"><i></i><i></i><i></i><i></i></span> Hear this warning</button>
          </div>
        </div>
      </section>

      <!-- ============ MY MONEY ============ -->
      <section class="screen" id="money">
        <div class="eyebrow">Built for income that comes and goes</div>
        <h1 class="h1">My Money</h1>
        <p class="sub">Your seasonal cash-flow, safety buffer, and next best money action—in one calm view.</p>
        <div class="grid g3" style="margin-bottom:18px">
          <div class="card stat"><div class="k">This season's income</div><div class="v num">₹84,000</div></div>
          <div class="card stat"><div class="k">Spent so far</div><div class="v num">₹61,200</div></div>
          <div class="card stat"><div class="k">Safe to spend / day</div><div class="v num">₹240<small> till next harvest</small></div></div>
        </div>

        <div class="money-hero">
          <div class="card gullak-card">
            <div class="kicker" style="margin:0 0 4px">My safety Gullak</div>
            <div class="gullak-layout">
              <div class="gullak-wrap">
                <button class="gullak" id="gullak" onclick="addToGullak(100)" aria-label="Add 100 rupees to Gullak">
                  <span class="gullak-coin">₹</span>
                  <span class="gullak-pot"><span class="gullak-fill" id="gullakPotFill"><span class="gullak-fill-label" id="gullakFillLabel">53%</span></span></span>
                  <span class="gullak-rim"></span><span class="gullak-pattern"></span>
                </button>
                <div class="gullak-balance num" id="gullakBalance">₹4,200</div>
                <div class="gullak-label">saved safely for a bad month</div>
              </div>
              <div>
                <div class="goal-line"><span>First buffer goal</span><b><span id="gullakSaved">₹4,200</span> / ₹8,000</b></div>
                <div class="goal-track"><div class="goal-fill" id="gullakFill"></div></div>
                <div class="save-actions">
                  <button class="save-chip" onclick="addToGullak(100)">+ ₹100</button>
                  <button class="save-chip" onclick="addToGullak(500)">+ ₹500</button>
                  <button class="save-chip" onclick="addToGullak(1000)">+ ₹1,000</button>
                </div>
                <div class="profile-nudge"><span>🌾</span><div><b>Made for your harvest cycle:</b> put aside ₹100 on good-income days. You need ₹3,800 more to reach the buffer that most improves your risk score.</div></div>
              </div>
            </div>
          </div>

          <div class="card advice-card">
            <span class="advice-label">✦ Saathi’s profile-based guidance</span>
            <h2>Protect first. Grow second.</h2>
            <p>Your income varies and the next harvest is four months away, so Saathi does not push risky products first.</p>
            <div class="advice-step"><span class="advice-num">1</span><div><b>Complete your ₹8,000 buffer</b><small>Keep it liquid and easy to withdraw.</small></div><span class="advice-tag now">Do now</span></div>
            <div class="advice-step"><span class="advice-num">2</span><div><b>Use a bank RD for the next crop cycle</b><small>Regular saving, predictable value, low complexity.</small></div><span class="advice-tag">Next</span></div>
            <div class="advice-step"><span class="advice-num">3</span><div><b>Explore a small SIP only after the buffer</b><small>Long-term growth; value can rise or fall.</small></div><span class="advice-tag">Later</span></div>
            <button class="btn btn-amber btn-sm" style="margin-top:13px" onclick="showMoneyPlan()">Show why this fits me</button>
          </div>
        </div>

        <div class="card" id="moneyPlan" style="display:none;margin-bottom:18px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div class="ic-wrap tick"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M12 3l8 4v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg></div>
            <div><b>Your advice is based on your profile—not a generic product list.</b><p class="note" style="margin:4px 0 0">Seasonal income · 4 months to harvest · <span id="planBuffer">₹4,200</span> current buffer · existing EMI · medium-term crop expense. The recommendation changes when these facts change.</p></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div><div class="kicker" style="margin:0">Understand before you choose</div><b style="font-size:17px">Money options, without the jargon</b></div>
            <span class="badge ok">No guaranteed-return claims</span>
          </div>
          <div class="explain-grid">
            <div class="explain-card"><div class="explain-icon">🏦</div><b>Savings account</b><p>Money stays easy to access. Best for emergencies, though growth is usually modest.</p><span class="fit-pill">Fits your buffer</span><br><button class="learn-link" onclick="openLesson('buffer')">Learn in 60 seconds →</button></div>
            <div class="explain-card"><div class="explain-icon">📅</div><b>Recurring Deposit (RD)</b><p>You put in a fixed amount regularly. It builds discipline and has a known maturity value.</p><span class="fit-pill">Fits crop planning</span><br><button class="learn-link" onclick="openLesson('rd')">See a simple example →</button></div>
            <div class="explain-card"><div class="explain-icon">📈</div><b>Mutual-fund SIP</b><p>Small regular investments for long goals. Returns are not fixed and the value may fall.</p><span class="fit-pill later">Only after buffer</span><br><button class="learn-link" onclick="openLesson('sip')">What is a SIP? →</button></div>
          </div>
          <div class="money-insight"><div class="spark">i</div><div style="flex:1"><b>Confused by any term?</b><p>Saathi can explain it with pictures, voice, and a story in your chosen language.</p></div><button class="btn btn-ghost btn-sm" onclick="openLesson('money-basics')">Go to Learn</button></div>
        </div>

        <div class="card" style="margin-bottom:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><b style="font-size:15px">Where your money went</b><button class="speaker btn-sm" onclick="say('This season you earned eighty four thousand rupees and spent sixty one thousand. You can safely spend two hundred forty rupees a day.', this)"><span class="eq"><i></i><i></i><i></i><i></i></span></button></div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div><div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px"><span>🌱 Seeds &amp; farm</span><b class="num">₹28,000</b></div><div style="height:10px;background:var(--teal-100);border-radius:6px"><div style="height:100%;width:46%;background:var(--teal-700);border-radius:6px"></div></div></div>
            <div><div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px"><span>🏠 Home &amp; food</span><b class="num">₹19,000</b></div><div style="height:10px;background:var(--teal-100);border-radius:6px"><div style="height:100%;width:31%;background:var(--teal-500);border-radius:6px"></div></div></div>
            <div><div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px"><span>💳 Loan EMI</span><b class="num">₹14,200</b></div><div style="height:10px;background:var(--teal-100);border-radius:6px"><div style="height:100%;width:23%;background:var(--marigold);border-radius:6px"></div></div></div>
          </div>
        </div>
        <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <button class="btn btn-amber"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>Say "I spent ₹200 on seeds"</button>
          <span class="note">Saathi reads the amount back before saving, so a misheard number never slips in.</span>
        </div>
      </section>

      <!-- ============ LEARN ============ -->
      <section class="screen" id="learn">
        <div class="eyebrow">60-second lessons, in pictures</div>
        <h1 class="h1">Learn</h1>
        <p class="sub">Stories with people like you, drawn fresh for each lesson. Watch, listen, or read — whatever works.</p>
        <div class="action" id="lessonContext" style="display:none;margin-bottom:18px">
          <div class="star">▶</div>
          <div><div class="kicker" style="margin:0 0 3px">Recommended from My Money</div><b id="lessonContextTitle">Start with the safety-buffer lesson</b><p class="note" id="lessonContextText" style="margin:3px 0 0">A one-minute explanation selected for your current money plan.</p></div>
        </div>
        <div class="grid g3">
          <div class="lesson"><div class="art" style="background:linear-gradient(135deg,#0c5c4c,#13836b)">🧑‍🌾</div><div class="body"><span class="gen">picture drawn by AI</span><b>Two loans, one farmer</b><p>Ravi compares a 14% and a 24% loan. See why the small number matters so much.</p><button class="speaker btn-sm" style="margin-top:10px" onclick="say('Ravi the farmer looks at two loans. One charges fourteen percent, one charges twenty four percent. Over a year, that small difference costs him a whole month of food.', this)"><span class="eq"><i></i><i></i><i></i><i></i></span> Play lesson</button></div></div>
          <div class="lesson"><div class="art" style="background:linear-gradient(135deg,#13836b,#1E9E6A)">🥬</div><div class="body"><span class="gen">picture drawn by AI</span><b>The vegetable seller's jar</b><p>Sita saves ₹20 a day in a jar. A year later it becomes her safety buffer.</p><button class="speaker btn-sm" style="margin-top:10px" onclick="say('Sita sells vegetables. Every day she puts twenty rupees in a jar. After one year, she has over seven thousand rupees — her safety buffer.', this)"><span class="eq"><i></i><i></i><i></i><i></i></span> Play lesson</button></div></div>
          <div class="lesson"><div class="art" style="background:linear-gradient(135deg,#0a4a3d,#0c5c4c)">📱</div><div class="body"><span class="gen">picture drawn by AI</span><b>Spotting a fake message</b><p>Three signs a money message is a trap — links, rush, and secrets.</p><button class="speaker btn-sm" style="margin-top:10px" onclick="say('A fake message has three signs. It has a link to click. It rushes you. And it asks you to keep a secret. If you see these, stop.', this)"><span class="eq"><i></i><i></i><i></i><i></i></span> Play lesson</button></div></div>
        </div>
        <div class="card" style="margin-top:18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:var(--teal-050);border-color:var(--teal-100)">
          <span style="font-size:24px">👥</span>
          <div style="flex:1;min-width:200px"><b>Learning circle — 6 farmers near you</b><p class="note" style="margin:3px 0 0">Meet weekly, learn together, finish challenges. <span style="color:var(--warn);font-weight:600">Coming soon</span></p></div>
          <button class="btn btn-ghost btn-sm">Join the waitlist</button>
        </div>
      </section>

      <!-- ============ ASSETS ============ -->
      <section class="screen" id="assets">
        <div class="eyebrow">A weekly read on what you own</div>
        <h1 class="h1">My Things</h1>
        <p class="sub">Saathi watches local news and markets, then tells you in plain words what is happening to the value of what you own.</p>
        <div class="grid g2">
          <div class="card"><div style="display:flex;justify-content:space-between"><b style="font-size:15px">🌾 Farmland (2 acres)</b><span class="pill" style="background:var(--safe-bg);color:#0e6b48">↑ likely rising</span></div><div class="warnbox" style="background:var(--teal-050);border-color:var(--teal-100)"><div class="ic" style="color:var(--teal-700)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="9"/></svg></div><p style="margin:0;font-size:13.5px">A new district hospital is planned 3 km away. Land near it usually rises in value. Holding may be wise this year.</p></div></div>
          <div class="card"><div style="display:flex;justify-content:space-between"><b style="font-size:15px">🛺 Tractor (2019)</b><span class="pill" style="background:var(--warn-bg);color:#8a5500">↓ slowly falling</span></div><div class="warnbox"><div class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/></svg></div><p style="margin:0;font-size:13.5px">Older models lose value each year. If you rent it out at harvest, it can still earn ₹6,000 a season.</p></div></div>
        </div>
        <div class="local-head"><div><div class="eyebrow" style="margin-bottom:4px">Profile-matched local intelligence</div><h2>Near you &amp; relevant to your farm</h2><p>Indore district · wheat and soybean profile · illustrative demo feed</p></div><button class="speaker btn-sm" onclick="say('Soybean prices are up today. Rain is expected this week. A new cold storage centre has been approved near your block.',this)"><span class="eq"><i></i><i></i><i></i><i></i></span> Hear local update</button></div>
        <div class="local-grid">
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">Local developments</b><span class="pill">Matched to your assets</span></div>
            <div class="news-list">
              <div class="news-item"><div class="news-icon">🏥</div><div><b>District hospital project moves to tender stage</b><p>Planned 3 km from your farmland. Better road access may support nearby land values over time.</p><span class="relevance">Relevant: your 2-acre farmland</span></div><span class="news-time">Today</span></div>
              <div class="news-item"><div class="news-icon">🏬</div><div><b>Cold-storage centre approved for Sanwer block</b><p>Could reduce post-harvest losses and give you more flexibility over when to sell produce.</p><span class="relevance">Relevant: seasonal crop income</span></div><span class="news-time">2d ago</span></div>
              <div class="news-item"><div class="news-icon">🌧️</div><div><b>Moderate rain expected over the next five days</b><p>Saathi suggests delaying hired tractor work by two days and protecting stored seed.</p><span class="relevance">Action: adjust farm schedule</span></div><span class="news-time">Weather</span></div>
            </div>
          </div>
          <div class="card mandi-card">
            <div style="display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:15px">Nearby mandi snapshot</b><p class="note" style="margin:2px 0 0">₹ per quintal · illustrative</p></div><span class="pill" style="background:var(--safe-bg);color:#0e6b48">Indore</span></div>
            <div class="mandi-row"><span class="mandi-crop">🫘 Soybean</span><span class="mandi-price">₹4,720</span><span class="price-move">↑ ₹85</span></div>
            <div class="mandi-row"><span class="mandi-crop">🌾 Wheat</span><span class="mandi-price">₹2,485</span><span class="price-move">↑ ₹20</span></div>
            <div class="mandi-row"><span class="mandi-crop">🌽 Maize</span><span class="mandi-price">₹2,140</span><span class="price-move down">↓ ₹15</span></div>
            <div class="mandi-row"><span class="mandi-crop">🧅 Onion</span><span class="mandi-price">₹1,760</span><span class="price-move">↑ ₹110</span></div>
            <div class="feed-note"><span>✦</span><span><b>Saathi’s read:</b> your soybean price is stronger today, but one-day movement alone should not decide when you sell.</span></div>
          </div>
        </div>
      </section>

      <!-- ============ LEGACY ============ -->
      <section class="screen" id="legacy">
        <div class="eyebrow">A steady hand in a hard time</div>
        <h1 class="h1">Legacy</h1>
        <p class="sub">If the family's earner passes away, Saathi becomes a calm guide — helping the family find, claim, and protect what was left to them, one gentle step at a time.</p>
        <div class="legacy-link">
          <div class="card legacy-lock">
            <div class="legacy-lock-icon"><svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg></div>
            <h2>Connect a loved one’s profile securely</h2>
            <p>Private financial information remains sealed until identity, relationship, and authority are verified.</p>
            <div class="legacy-security"><div><i>1</i> Match the deceased person’s ArthSaathi ID</div><div><i>2</i> Verify death record and your relationship</div><div><i>3</i> Confirm with registered nominee OTP or ward officer</div></div>
          </div>
          <div class="card legacy-form">
            <div class="kicker" style="margin:0 0 4px">Request authorised access</div>
            <div class="verify-progress"><span class="on"></span><span id="legacyProgress2"></span><span id="legacyProgress3"></span></div>
            <div id="legacyVerifyForm">
              <label>Deceased person’s ArthSaathi ID</label><input id="legacyProfileId" value="AS-IND-2048" placeholder="Example: AS-IND-2048">
              <div class="legacy-form-grid"><div><label>Your relationship</label><select id="legacyRelation"><option>Spouse</option><option>Son / daughter</option><option>Parent</option><option>Legal heir</option></select></div><div><label>Death certificate reference</label><input id="deathRef" value="MP-DC-78142" placeholder="Certificate number"></div></div>
              <label><input type="checkbox" id="legacyConsent" style="width:auto;margin-right:6px"> I consent to verification and understand that access is logged.</label>
              <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="startLegacyVerification()">Verify relationship →</button>
            </div>
            <div id="legacyOtpForm" style="display:none">
              <div class="warnbox" style="margin-top:8px"><div class="ic">✦</div><div>An OTP was sent to the registered nominee contact ending in <b>••42</b>. If unavailable, request ward-officer review.</div></div>
              <label>Enter 6-digit authorization code</label><input id="legacyOtp" inputmode="numeric" maxlength="6" placeholder="Demo code: 482731">
              <div class="row"><button class="btn btn-primary btn-sm" onclick="completeLegacyVerification()">Unlock authorised view</button><button class="btn btn-ghost btn-sm" onclick="requestOfficerReview()">Ask ward officer</button></div>
            </div>
            <div class="legacy-status" id="legacyStatus"></div>
          </div>
        </div>
        <div class="card legacy-profile" id="legacyProfile">
          <div class="profile-summary"><div class="profile-avatar">RL</div><div><b>Ramesh Lal’s legacy profile</b><p class="note" style="margin:2px 0 0">Linked as spouse · access logged · sensitive values partly masked</p></div><span class="private-pill">✓ Authorised</span></div>
          <div class="legacy-facts"><div class="legacy-fact"><small>Accounts located</small><b>2 bank accounts</b></div><div class="legacy-fact"><small>Nominee status</small><b>You are nominee on 1</b></div><div class="legacy-fact"><small>Potential claims</small><b>Insurance + PM benefit</b></div></div>
        </div>
        <div class="card" id="legacyChecklist">
          <div class="kicker" style="margin:0 0 12px">A guided checklist appears when it is needed</div>
          <div class="check" onclick="this.classList.toggle('done')"><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span><span>Find all bank accounts and the nominee on each</span></div>
          <div class="check" onclick="this.classList.toggle('done')"><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span><span>Claim any life insurance or PM scheme benefit</span></div>
          <div class="check" onclick="this.classList.toggle('done')"><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span><span>Transfer land or property records to the heir</span></div>
          <div class="check" onclick="this.classList.toggle('done')"><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span><span>Stop auto-payments that are no longer needed</span></div>
          <p class="note">Each step can be read aloud and done with an operator at the ward office. No legal jargon, ever.</p>
        </div>
      </section>

      <!-- ============ SETTINGS ============ -->
      <section class="screen" id="settings">
        <div class="eyebrow">You are in control</div>
        <h1 class="h1">Profile &amp; Safety</h1>
        <p class="sub">Your language, your voice, your data — all yours to change in one tap.</p>
        <div class="grid g2" style="margin-bottom:18px">
          <div class="card"><div class="kicker" style="margin:0 0 12px">Language &amp; voice</div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)"><span>Spoken language</span><b>English &amp; Hindi</b></div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)"><span>Read every answer aloud</span><span class="sw-toggle on"></span></div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0"><span>Larger text &amp; high contrast</span><span class="sw-toggle on"></span></div>
          </div>
          <div class="card"><div class="kicker" style="margin:0 0 12px">Your data is locked</div>
            <div class="warnbox" style="background:var(--teal-050);border-color:var(--teal-100)"><div class="ic" style="color:var(--teal-700)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg></div><p style="margin:0;font-size:13.5px"><b>AES-256 encryption.</b> Even we cannot read your details without your key.</p></div>
          </div>
        </div>
        <div class="card dangerbox" style="background:#fff;border:1px solid #f3c4c4">
          <div style="display:flex;gap:14px;align-items:flex-start">
            <div class="ic" style="color:var(--danger);margin-top:2px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></div>
            <div style="flex:1"><b style="font-size:15px;color:#a52121">Phone lost or in danger? Erase everything</b><p class="note" style="margin:4px 0 12px">Say <b>"Saathi, delete my data"</b> out loud, or tap below. Everything is wiped instantly and cannot be recovered.</p>
            <button class="btn btn-sm" style="background:var(--danger);color:#fff">Erase all my data now</button></div>
          </div>
        </div>
      </section>

      <!-- ============ MANAGER MODE ============ -->
      <section class="screen" id="manager">
        <div class="eyebrow">Gram panchayat · assisted access</div>
        <h1 class="h1">Citizens you are helping</h1>
        <p class="sub">For people with no phone. You open their assisted portfolio, check schemes, and apply on their behalf — with their consent.</p>
        <div class="card" style="padding:0;overflow:hidden;margin-bottom:18px">
          <table class="tbl">
            <thead><tr><th>Citizen</th><th>Income type</th><th>Resilience</th><th>Open schemes</th><th></th></tr></thead>
            <tbody>
              <tr><td class="nm">Kisan Lal</td><td>Seasonal</td><td><span class="dotstat"><span class="d" style="background:var(--warn)"></span>2 months</span></td><td>2 eligible</td><td><button class="btn btn-ghost btn-sm">Open portfolio</button></td></tr>
              <tr><td class="nm">Savitri Devi</td><td>Fixed pension</td><td><span class="dotstat"><span class="d" style="background:var(--danger)"></span>3 weeks</span></td><td>3 eligible</td><td><button class="btn btn-ghost btn-sm">Open portfolio</button></td></tr>
              <tr><td class="nm">Rajesh Kumar</td><td>Gig / daily</td><td><span class="dotstat"><span class="d" style="background:var(--safe)"></span>5 months</span></td><td>1 eligible</td><td><button class="btn btn-ghost btn-sm">Open portfolio</button></td></tr>
            </tbody>
          </table>
        </div>
        <div class="grid g3">
          <div class="card stat"><div class="k">Citizens assisted today</div><div class="v num">23</div></div>
          <div class="card stat"><div class="k">Applications filed</div><div class="v num">11</div></div>
          <div class="card stat"><div class="k">Pending human review</div><div class="v num" style="color:var(--warn)">2</div></div>
        </div>
      </section>

      <!-- ============ EDUCATOR MODE ============ -->
      <section class="screen" id="educator">
        <div class="eyebrow">NGOs · teachers · community leaders</div>
        <h1 class="h1">Teach your community</h1>
        <p class="sub">Make local-language lessons, track who is learning, and run financial-literacy drives.</p>
        <div class="grid g2">
          <div class="card">
            <div class="kicker" style="margin:0 0 12px">Create a lesson in your language</div>
            <input class="scaminput" style="min-height:auto;margin-bottom:10px" value="Topic: Why a Self-Help Group loan beats a moneylender" />
            <div class="row"><button class="btn btn-amber btn-sm">Generate illustrated card</button><span class="pill">Kannada</span></div>
            <p class="note">Saathi drafts the story and draws the picture; you approve before it goes out.</p>
          </div>
          <div class="card">
            <div class="kicker" style="margin:0 0 12px">Your community's progress</div>
            <div class="stat" style="padding:0"><div class="k">Learners active this week</div><div class="v num">142</div></div>
            <div style="height:1px;background:var(--line);margin:14px 0"></div>
            <div class="stat" style="padding:0"><div class="k">Lessons completed</div><div class="v num">896</div></div>
          </div>
        </div>
      </section>

      <!-- ============ ADMIN MODE ============ -->
      <section class="screen" id="admin">
        <div class="eyebrow">Governance · anonymised</div>
        <h1 class="h1">System &amp; fraud overview</h1>
        <p class="sub">Anonymised analytics, scam-trend monitoring, and the human-escalation queue. No individual is identifiable here.</p>
        <div class="grid g3" style="margin-bottom:18px">
          <div class="card stat"><div class="k">Citizens served (30d)</div><div class="v num">48,200</div></div>
          <div class="card stat"><div class="k">Scams blocked</div><div class="v num" style="color:var(--danger)">3,140</div></div>
          <div class="card stat"><div class="k">Avg resilience score</div><div class="v num">2.8<small> mo</small></div></div>
        </div>
        <div class="grid g2">
          <div class="card">
            <div class="kicker" style="margin:0 0 14px">Scam reports this week — a spike to watch</div>
            <div class="hist" style="height:120px">
              <div class="bar" style="height:30%"></div><div class="bar" style="height:38%"></div><div class="bar" style="height:34%"></div><div class="bar" style="height:50%"></div><div class="bar ruin" style="height:82%"></div><div class="bar ruin" style="height:95%"></div><div class="bar" style="height:60%"></div>
            </div>
            <div class="histx"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div>
            <p class="note">A fake "electricity bill" scam is trending in 3 districts. Threat shield rules updated automatically.</p>
          </div>
          <div class="card">
            <div class="kicker" style="margin:0 0 12px">Sent to a human — review queue</div>
            <div class="li" style="padding:10px 0"><span class="badge human">Distress</span><div style="flex:1"><b style="font-size:13.5px">Citizen mentioned self-harm</b><p style="margin:0">Auto-advice blocked · routed to counsellor</p></div></div>
            <div class="li" style="padding:10px 0"><span class="badge human">High stakes</span><div style="flex:1"><b style="font-size:13.5px">₹4L loan decision</b><p style="margin:0">Above auto-advice limit · awaiting officer</p></div></div>
            <div class="li" style="padding:10px 0"><span class="badge refuse">Refused</span><div style="flex:1"><b style="font-size:13.5px">Number could not be traced</b><p style="margin:0">Critic rejected · advisor re-running</p></div></div>
          </div>
        </div>
      </section>

    </div>
  </div>
</div>

<!-- persistent Saathi conversation bar -->
<div class="chat-dock">
  <div class="chat-status" id="chatStatus">Listening in your selected language…</div>
  <form class="chat-shell" onsubmit="submitChat(event)">
    <div class="chat-quick">
      <span class="chat-quick-label" data-i18n="tryAsking">Try asking</span>
      <button type="button" class="quick-prompt" data-i18n="loanQ" onclick="runChatAction('loan')">Can I afford this loan?</button>
      <button type="button" class="quick-prompt" data-i18n="returnQ" onclick="runChatAction('critic')">Is 12% return guaranteed?</button>
      <button type="button" class="quick-prompt" data-i18n="checkScam" onclick="runChatAction('scam')">Check a suspicious message</button>
    </div>
    <div class="chat-row">
      <div class="chat-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="3.2"/><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/></svg>
      </div>
      <input class="chat-input" id="chatInput" aria-label="Ask Saathi" placeholder="Ask Saathi in any Indian language…" autocomplete="off" />
      <button type="button" class="chat-voice" onclick="dockListen()" aria-label="Speak to Saathi">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>
      </button>
      <button class="chat-send" type="submit" aria-label="Send message">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
      </button>
    </div>
  </form>
  <button class="sign-dock" onclick="openSign()" aria-label="Sign language help">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 11V6a1.5 1.5 0 013 0v4M10 10V4.5a1.5 1.5 0 013 0V10M13 10V6a1.5 1.5 0 013 0v6c0 4-2 7-6 7s-6-2-7-6l-.5-2a1.5 1.5 0 012.8-1L9 12"/></svg>
    <span data-i18n="signLanguage">Sign language help</span>
  </button>
</div>

<div class="modal" id="signModal" onclick="if(event.target===this)closeSign()">
  <div class="sheet">
    <div class="sheet-head">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal-700)" stroke-width="2"><path d="M7 11V6a1.5 1.5 0 013 0v4M10 10V4.5a1.5 1.5 0 013 0V10M13 10V6a1.5 1.5 0 013 0v6c0 4-2 7-6 7s-6-2-7-6l-.5-2a1.5 1.5 0 012.8-1L9 12"/></svg>
      <b>Sign language help</b>
      <button class="x" onclick="closeSign()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="sheet-body">
      <div class="sign-video"><div class="play"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div></div>
      <p style="margin:0 0 14px;font-weight:600">"Am I eligible for PM-KISAN?" — explained in ISL</p>
      <div class="kicker" style="margin:0 0 10px">Or pick a topic</div>
      <div class="sign-grid">
        <div class="sign-item"><div class="th"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/></svg></div>Spotting a scam</div>
        <div class="sign-item"><div class="th"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/></svg></div>Reading your balance</div>
        <div class="sign-item"><div class="th"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V9l7-5 7 5v12"/></svg></div>Applying for schemes</div>
        <div class="sign-item"><div class="th"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v5c0 4.5-3.2 7.8-8 9"/></svg></div>Your safety score</div>
      </div>
      <p class="note" style="margin-top:14px">Pre-recorded ISL videos now. A live signing avatar is on our roadmap — and we say so honestly.</p>
    </div>
  </div>
</div>`;

const runtime = `/* ---------- first-login personalisation ---------- */
var literacyPreference='';
var visionPreference='';
var selectedSetupLanguage='hi';
var tutorialIndex=0;
var tutorialTimer=null;
var onboardLabels={hi:'हिन्दी',en:'English'};
var welcomeStories={
  hi:['आपके गाँव के कमलेश ने ArthSaathi से फायदा पाया','उसने बोलकर अपनी योजना जाँची और बचत का तरीका समझा। आप भी एक बार कोशिश कीजिए—साथी आपकी भाषा में सुनेगा।','नमस्ते किसान भाई। आपके ही गाँव के कमलेश ने अर्थसाथी से अपनी सरकारी योजना जाँची और बचत का आसान तरीका सीखा। आप भी एक बार कोशिश कीजिए। बस पीला माइक दबाकर अपनी बात बोलिए।'],
  en:['Kamlesh, a farmer from your village, benefited from ArthSaathi','He checked his schemes by speaking and learned an easier way to save. You should try it too—Saathi will listen in your language.','Namaste. Kamlesh, a farmer from your village, used ArthSaathi to check a government scheme and learn a simple way to save. You should try it too. Just tap the yellow microphone and speak naturally.'],
};
var voiceTutorial=[
  ['🎙️','Tap the yellow microphone','You do not need to type or read. Tap once, then ask about money in your own words.'],
  ['🗣️','Speak naturally','Say: “Mujhe PM-KISAN ke baare mein batao.” Saathi understands everyday language.'],
  ['🔊','Listen to the answer','Saathi reads the answer aloud and repeats important amounts before doing anything.'],
  ['🛡️','Look for the green check','The green verified mark means the number was calculated and the fact was checked.']
];
var readerTutorial=[
  ['⌨️','Talk to Saathi','Use voice or text from any screen. The conversation bar stays at the bottom.'],
  ['🐷','My Money','Track seasonal spending, build your Gullak buffer, and understand suitable money options.'],
  ['🛡️','Safety Net','See how your household handles bad months before you take a loan.'],
  ['🏛️','Schemes & Learn','Check eligibility, finish documents, and open a simple lesson whenever a term is unfamiliar.']
];
var tutorialLocales={
  hi:{
    voice:[['🎙️','पीला माइक दबाएँ','आपको टाइप या पढ़ने की ज़रूरत नहीं है। एक बार दबाएँ और अपने शब्दों में पैसे की बात पूछें।'],['🗣️','जैसे बोलते हैं वैसे बोलिए','कहिए: “मुझे PM-KISAN के बारे में बताओ।” साथी रोज़ की भाषा समझता है।'],['🔊','जवाब सुनिए','साथी जवाब पढ़कर सुनाता है और कोई भी ज़रूरी रकम पहले दोहराता है।'],['🛡️','हरा निशान देखिए','हरा Verified निशान बताता है कि रकम की गणना और जानकारी की जाँच हुई है।']],
    reader:[['⌨️','साथी से बात करें','किसी भी स्क्रीन से बोलें या लिखें। नीचे का बातचीत बार हमेशा साथ रहता है।'],['🐷','मेरा पैसा','मौसमी खर्च देखें, Gullak में सुरक्षा बचत बनाएँ और आसान विकल्प समझें।'],['🛡️','सुरक्षा कवच','ऋण लेने से पहले देखें कि खराब महीने में घर का पैसा कैसे चलेगा।'],['🏛️','योजनाएँ और सीखें','पात्रता जाँचें, दस्तावेज़ पूरे करें और कठिन शब्द पर आसान पाठ खोलें।']]
  }
};
var onboardUi={
  en:['How would you like Saathi to guide you?','There is no right or wrong answer. This only changes how we explain things.','I am comfortable reading','Show me the full dashboard tour with labels, examples, and voice.','I prefer listening and speaking','Use large pictures, voice instructions, and a simple 30-second tutorial.','Learn to use Saathi without reading','Four simple voice steps. You can replay them anytime.','See the complete dashboard in your language','A guided tour shows where everything lives and when to use it.'],
  hi:['Saathi आपको कैसे समझाए?','कोई उत्तर सही या गलत नहीं है। इससे केवल समझाने का तरीका बदलेगा।','मुझे पढ़ना सहज लगता है','लेबल, उदाहरण और आवाज़ के साथ पूरा डैशबोर्ड दिखाएँ।','मैं सुनना और बोलना पसंद करता/करती हूँ','बड़ी तस्वीरें, आवाज़ और आसान 30-सेकंड का अभ्यास दिखाएँ।','बिना पढ़े Saathi चलाना सीखें','आवाज़ के चार आसान कदम। इन्हें कभी भी दोबारा सुन सकते हैं।','अपनी भाषा में पूरा डैशबोर्ड देखें','यह छोटा मार्गदर्शन बताएगा कि हर सुविधा कहाँ है और कब काम आती है।'],
};
function chooseLiteracy(value,button){
  literacyPreference=value;
  button.closest('.setup-options').querySelectorAll('.setup-choice').forEach(function(card){card.classList.remove('selected');});
  button.classList.add('selected');
  checkSetupReady();
}
function chooseVision(value,button){
  visionPreference=value;
  button.closest('.setup-options').querySelectorAll('.setup-choice').forEach(function(card){card.classList.remove('selected');});
  button.classList.add('selected');
  checkSetupReady();
}
function selectSetupLanguage(){
  selectedSetupLanguage=document.getElementById('onboardLanguage').value;
  checkSetupReady();
  speakOnePrompt(selectedSetupLanguage==='en'?'Language selected. Now answer whether you can read comfortably.':'भाषा चुन ली गई है। अब बताइए कि क्या आप पढ़ सकते हैं।',selectedSetupLanguage==='en'?'en-IN':'hi-IN');
}
function checkSetupReady(){
  document.getElementById('onboardContinue').disabled=!(visionPreference&&literacyPreference&&selectedSetupLanguage);
}
function speakOnePrompt(text,lang){
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  var u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=.9;window.speechSynthesis.speak(u);
}
function speakSetupQuestions(){
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  var btn=document.getElementById('questionVoiceBtn');
  var prompts=[
    ['नमस्ते। तीन आसान सवाल हैं। पहला, क्या आप स्क्रीन साफ़ देख सकते हैं? दूसरा, आप किस भाषा में सहज हैं? तीसरा, क्या आप पढ़ सकते हैं?','hi-IN'],
    ['Hello. There are three simple questions. First, can you see the screen clearly? Second, which language are you comfortable in? Third, can you read comfortably?','en-IN']
  ];
  btn.textContent='◼ Playing';
  var index=0;
  function next(){
    if(index>=prompts.length){btn.textContent='▶ Play voice';return;}
    var u=new SpeechSynthesisUtterance(prompts[index][0]);u.lang=prompts[index][1];u.rate=.88;index++;u.onend=next;window.speechSynthesis.speak(u);
  }
  next();
}
function applySelectedLanguage(){
  var code=selectedSetupLanguage||document.getElementById('onboardLanguage').value;
  var story=welcomeStories[code]||welcomeStories.en;
  var ui=onboardUi[code]||onboardUi.en;
  document.getElementById('welcomeStoryTitle').textContent=story[0];
  document.getElementById('welcomeStoryText').textContent=story[1];
  document.getElementById('welcomeHeading').textContent=code==='hi'?'स्वागत है—अब Saathi आपकी भाषा में है':code==='en'?'Welcome—Saathi now speaks your language':ui[0];
  document.getElementById('welcomeSub').textContent=code==='hi'?'आप जैसे ही एक किसान का छोटा संदेश सुनिए।':code==='en'?'Hear a short message from a farmer like you.':story[1];
  var ready={
    hi:['आपका Saathi तैयार है','बस बोलिए। Saathi साथ है।','आपकी भाषा, आवाज़ और सीखने का तरीका सेट हो गया है। इसे प्रोफ़ाइल और सुरक्षा में कभी भी बदल सकते हैं।','ArthSaathi शुरू करें →'],
    en:['Your Saathi is ready','Just speak. Saathi is with you.','Your language, voice, and learning preference are set. You can change them anytime in Profile & Safety.','Start using ArthSaathi →'],
  };
  var readyCopy=ready[code]||[ui[0],story[0],story[1],'Start ArthSaathi →'];
  document.getElementById('readyEyebrow').textContent=readyCopy[0];
  document.getElementById('readyTitle').textContent=readyCopy[1];
  document.getElementById('readySub').textContent=readyCopy[2];
  document.getElementById('readyButton').textContent=readyCopy[3];
  applyTranslations(code);
  document.documentElement.lang=code;
  document.documentElement.dir='ltr';
  document.getElementById('currentLang').textContent=onboardLabels[code]||'English';
  document.querySelectorAll('.lang-option').forEach(function(btn){btn.classList.toggle('on',btn.dataset.code===code);});
}
function confirmBasicSetup(){
  applySelectedLanguage();
  document.documentElement.classList.remove('vision-low','vision-audio');
  if(visionPreference==='low')document.documentElement.classList.add('vision-low');
  if(visionPreference==='audio')document.documentElement.classList.add('vision-audio');
  if(visionPreference==='audio')literacyPreference='voice';
  goOnboardStep(2);
  setTimeout(function(){playWelcomeVoice(document.getElementById('welcomeVoiceBtn'));},350);
}
function playWelcomeVoice(button){
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  var code=document.getElementById('onboardLanguage').value;
  var story=welcomeStories[code]||welcomeStories.en;
  var utterance=new SpeechSynthesisUtterance(story[2]);
  var speechCodes={hi:'hi-IN',en:'en-IN'};
  utterance.lang=speechCodes[code]||code+'-IN';utterance.rate=.9;
  button.classList.add('playing');button.textContent='◼ Playing welcome';
  utterance.onend=function(){button.classList.remove('playing');button.textContent='🔊 Hear welcome';};
  window.speechSynthesis.speak(utterance);
}
function goOnboardStep(step){
  clearInterval(tutorialTimer);tutorialTimer=null;
  document.querySelectorAll('.onboard-step').forEach(function(el){el.classList.toggle('show',Number(el.dataset.onboardStep)===step);});
  document.querySelectorAll('.onboard-progress i').forEach(function(dot,index){dot.classList.toggle('on',index<step);});
  if(step===3){tutorialIndex=0;renderTutorial();setTimeout(function(){toggleTutorial();},350);}
}
function renderTutorial(){
  var isReader=literacyPreference==='reader';
  var code=document.getElementById('onboardLanguage').value;
  var locale=tutorialLocales[code];
  var ui=onboardUi[code]||onboardUi.en;
  var scenes=locale?(isReader?locale.reader:locale.voice):(isReader?readerTutorial:voiceTutorial);
  var scene=scenes[tutorialIndex];
  document.getElementById('tutorialTime').textContent=isReader?'▶ Full dashboard navigation':'▶ 30-second voice tutorial';
  document.getElementById('tutorialHeading').textContent=isReader?ui[8]:ui[6];
  document.getElementById('tutorialSub').textContent=isReader?ui[9]:ui[7];
  document.getElementById('tutorialIcon').textContent=scene[0];
  document.getElementById('tutorialTitle').textContent=scene[1];
  document.getElementById('tutorialText').textContent=scene[2];
  document.getElementById('readerTour').style.display=isReader?'grid':'none';
  document.querySelectorAll('.tutorial-dots i').forEach(function(dot,index){dot.classList.toggle('on',index===tutorialIndex);});
  if(isReader){
    var navKeys=['talk','money','safety','schemes','learn'];
    document.querySelectorAll('.tour-nav div').forEach(function(item,index){item.textContent=getCopy(navKeys[index],code);});
    document.querySelectorAll('.tour-nav div').forEach(function(item,index){item.classList.toggle('on',index===tutorialIndex);});
    document.getElementById('tourDescription').textContent=scene[2];
  }
}
function tutorialNext(){tutorialIndex=(tutorialIndex+1)%4;renderTutorial();}
function tutorialPrev(){tutorialIndex=(tutorialIndex+3)%4;renderTutorial();}
function toggleTutorial(){
  var button=document.getElementById('tutorialPlayBtn');
  if(tutorialTimer){clearInterval(tutorialTimer);tutorialTimer=null;button.textContent='▶ Play tutorial';return;}
  button.textContent='Ⅱ Pause';
  var code=document.getElementById('onboardLanguage').value;
  var locale=tutorialLocales[code];
  var scenes=locale?(literacyPreference==='reader'?locale.reader:locale.voice):(literacyPreference==='reader'?readerTutorial:voiceTutorial);
  var speakScene=function(){
    renderTutorial();
    if('speechSynthesis' in window){
      window.speechSynthesis.cancel();
      var u=new SpeechSynthesisUtterance(scenes[tutorialIndex][1]+'. '+scenes[tutorialIndex][2]);
      var speechCodes={hi:'hi-IN',en:'en-IN'};
      u.lang=speechCodes[code]||code+'-IN';u.rate=.92;window.speechSynthesis.speak(u);
    }
  };
  speakScene();
  tutorialTimer=setInterval(function(){tutorialIndex=(tutorialIndex+1)%4;speakScene();},6500);
}
function finishOnboarding(){
  if(!selectedSetupLanguage)selectedSetupLanguage='hi';
  if(!visionPreference)visionPreference='clear';
  if(!literacyPreference)literacyPreference='voice';
  clearInterval(tutorialTimer);window.speechSynthesis&&window.speechSynthesis.cancel();
  document.getElementById('onboarding').classList.remove('show');
  applySelectedLanguage();
  showChatStatus(literacyPreference==='voice'?'Voice-first mode is ready':'Your personalised dashboard is ready');
}
window.addEventListener('load',function(){
  selectedSetupLanguage='hi';
  setTimeout(function(){speakSetupQuestions();},650);
});

/* ---------- navigation ---------- */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
  var el=document.getElementById(id); if(el){el.classList.add('show'); document.querySelector('.scroll').scrollTop=0;}
}
function go(btn){
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  showScreen(btn.dataset.screen);
  closeSide();
}
function goTo(id){
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active', b.dataset.screen===id));
  showScreen(id); closeSide();
}

/* ---------- mobile sidebar ---------- */
function openSide(){document.getElementById('side').classList.add('open');document.getElementById('backdrop').classList.add('show');}
function closeSide(){document.getElementById('side').classList.remove('open');document.getElementById('backdrop').classList.remove('show');}

/* ---------- multilingual language picker ---------- */
var currentLanguage='en';
var copyKeys=['brandTag','everyday','talk','money','safety','schemes','scam','learn','more','things','legacy','profile','viewAs','assisted','online','greet','subtitle','tapSpeak','loanQ','eligibleQ','scamQ','savingsQ','tryAsking','returnQ','checkScam','signLanguage','searchPlaceholder','chatPlaceholder'];
var copyRows={
  en:['your money companion','Everyday','Talk to Saathi','My Money','Safety Net','Schemes & Benefits','Scam Shield','Learn','More','My Things','Legacy','Profile & Safety','View as','Assisted access on, ward office','Online','Namaste','Ask me anything about your money. No reading needed.','Tap to speak','Can I afford a loan?','Am I eligible for PM-KISAN?','Is this message a scam?','Teach me about savings','Try asking','Is 12% return guaranteed?','Check a suspicious message','Sign language help','Search or ask anything — schemes, loans, lessons…','Ask Saathi in any Indian language…'],
  hi:['आपका धन साथी','रोज़मर्रा','साथी से बात करें','मेरा पैसा','सुरक्षा कवच','योजनाएँ और लाभ','धोखा सुरक्षा','सीखें','और','मेरी संपत्ति','विरासत','प्रोफ़ाइल और सुरक्षा','भूमिका','वार्ड कार्यालय में सहायता उपलब्ध','ऑनलाइन','नमस्ते','अपने पैसे के बारे में कुछ भी पूछें। पढ़ना ज़रूरी नहीं।','बोलने के लिए दबाएँ','क्या मैं यह ऋण चुका सकता हूँ?','क्या मैं PM-KISAN के योग्य हूँ?','क्या यह संदेश धोखा है?','मुझे बचत सिखाएँ','पूछकर देखें','क्या 12% रिटर्न की गारंटी है?','संदिग्ध संदेश जाँचें','सांकेतिक भाषा सहायता','योजना, ऋण या पाठ खोजें…','साथी से किसी भी भारतीय भाषा में पूछें…'],
};
function getCopy(key,code){
  var row=copyRows[code||currentLanguage]||copyRows.en;
  var index=copyKeys.indexOf(key);
  return row[index]||copyRows.en[index]||'';
}
function applyTranslations(code){
  currentLanguage=code;
  document.querySelectorAll('[data-i18n]').forEach(function(el){el.textContent=getCopy(el.dataset.i18n,code);});
  document.getElementById('topSearch').placeholder=getCopy('searchPlaceholder',code);
  document.getElementById('chatInput').placeholder=getCopy('chatPlaceholder',code);
}
function toggleLangMenu(e){
  e.stopPropagation();
  var picker=document.getElementById('langPicker');
  picker.classList.toggle('open');
  picker.querySelector('.lang-trigger').setAttribute('aria-expanded',picker.classList.contains('open'));
}
function setLang(l,label,btn){
  selectedSetupLanguage=l;
  document.querySelectorAll('.lang-option').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('currentLang').textContent=label;
  document.documentElement.lang=l;
  document.documentElement.dir='ltr';
  applyTranslations(l);
  document.getElementById('langPicker').classList.remove('open');
  document.querySelector('.lang-trigger').setAttribute('aria-expanded','false');
  showChatStatus(label+' selected · Saathi will listen and reply in this language');
}
document.addEventListener('click',function(e){if(!e.target.closest('.lang'))document.getElementById('langPicker').classList.remove('open');});

/* ---------- role switch ---------- */
var personalScreens=['home','money','risk','schemes','scam','learn','assets','legacy','settings'];
function setRole(r){
  var map={manager:'manager',educator:'educator',admin:'admin'};
  var whoName=document.getElementById('whoName'), whoRole=document.getElementById('whoRole'), whoAvi=document.getElementById('whoAvi');
  if(r==='personal'){ whoName.textContent='Kisan'; whoRole.textContent='Seasonal farmer'; whoAvi.textContent='KI'; goTo('home'); document.querySelector('.nav button[data-screen="home"]').classList.add('active'); }
  else if(r==='manager'){ whoName.textContent='S. Naik'; whoRole.textContent='Ward operator'; whoAvi.textContent='SN'; showScreen('manager'); document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active')); }
  else if(r==='educator'){ whoName.textContent='Asha NGO'; whoRole.textContent='Educator'; whoAvi.textContent='AN'; showScreen('educator'); document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active')); }
  else if(r==='admin'){ whoName.textContent='District'; whoRole.textContent='Administrator'; whoAvi.textContent='DA'; showScreen('admin'); document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active')); }
}

/* ---------- read aloud (real, via browser) ---------- */
function say(text,btn){
  if(!('speechSynthesis' in window)){ return; }
  window.speechSynthesis.cancel();
  if(btn){ document.querySelectorAll('.speaker').forEach(s=>s.classList.remove('playing')); btn.classList.add('playing'); }
  var u=new SpeechSynthesisUtterance(text); u.rate=.96;
  u.onend=function(){ if(btn) btn.classList.remove('playing'); };
  window.speechSynthesis.speak(u);
}

/* ---------- HOME: mic + scripted trust flow ---------- */
var convo=document.getElementById('convo');
function addTurn(who,html){
  var t=document.createElement('div'); t.className='turn '+who;
  var avi = who==='user' ? '<div class="user-avi">KI</div>' : '<div class="saathi-avi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="3.2"/><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/></svg></div>';
  t.innerHTML = avi + '<div class="bubble">'+html+'</div>';
  convo.appendChild(t); t.scrollIntoView({behavior:'smooth',block:'center'}); return t;
}
function startListen(){
  var mic=document.getElementById('mic'), cap=document.getElementById('micCap');
  mic.classList.add('listening'); cap.textContent='Listening…';
  setTimeout(function(){
    mic.classList.remove('listening'); cap.textContent=getCopy('tapSpeak');
    runLoanFlow(true);
  },1700);
}
function askChip(kind){ if(kind==='loan') runLoanFlow(false); }

/* ---------- persistent conversation bar ---------- */
function showChatStatus(message){
  var status=document.getElementById('chatStatus');
  status.textContent=message; status.classList.add('show');
  clearTimeout(window.chatStatusTimer);
  window.chatStatusTimer=setTimeout(function(){status.classList.remove('show');},1800);
}
function runChatAction(kind){
  document.getElementById('chatInput').value='';
  if(kind==='loan'){goTo('home');runLoanFlow(false);}
  else if(kind==='critic'){criticDemo();}
  else if(kind==='scam'){goTo('scam');setTimeout(checkScam,350);}
}
function submitChat(e){
  e.preventDefault();
  var input=document.getElementById('chatInput'), text=input.value.trim();
  if(!text){input.focus();return;}
  var q=text.toLowerCase();
  input.value='';
  if(/scam|fraud|sms|message|link|धोखा|फर्जी/.test(q)){runChatAction('scam');}
  else if(/return|guarantee|invest|sip|12%|निवेश|रिटर्न/.test(q)){runChatAction('critic');}
  else{goTo('home');convo.innerHTML='';addTurn('user','<div class="orig"></div>');convo.querySelector('.orig').textContent=text;answerLoan();}
}
function dockListen(){
  var status=document.getElementById('chatStatus'), voice=document.querySelector('.chat-voice');
  status.textContent='Listening in '+document.getElementById('currentLang').textContent+'…';
  status.classList.add('show'); voice.style.background='var(--marigold)';
  setTimeout(function(){status.classList.remove('show');voice.style.background='';runChatAction('loan');},1500);
}

/* ---------- My Money: interactive Gullak + learning handoff ---------- */
var gullakAmount=4200;
function addToGullak(amount){
  gullakAmount=Math.min(gullakAmount+amount,8000);
  var gullak=document.getElementById('gullak');
  gullak.classList.remove('saving');void gullak.offsetWidth;gullak.classList.add('saving');
  document.getElementById('gullakBalance').textContent='₹'+gullakAmount.toLocaleString('en-IN');
  document.getElementById('gullakSaved').textContent='₹'+gullakAmount.toLocaleString('en-IN');
  document.getElementById('planBuffer').textContent='₹'+gullakAmount.toLocaleString('en-IN');
  var percentage=Math.min(gullakAmount/8000*100,100);
  document.getElementById('gullakFill').style.width=percentage+'%';
  document.getElementById('gullakPotFill').style.height=percentage+'%';
  document.getElementById('gullakFillLabel').textContent=Math.round(percentage)+'%';
  if(gullakAmount>=8000)showChatStatus('Gullak goal reached · your first safety buffer is ready');
  else showChatStatus('₹'+amount.toLocaleString('en-IN')+' added · ₹'+(8000-gullakAmount).toLocaleString('en-IN')+' left to your buffer goal');
}
function showMoneyPlan(){
  var plan=document.getElementById('moneyPlan');
  plan.style.display='block';
  plan.scrollIntoView({behavior:'smooth',block:'center'});
}
var lessonCopy={
  buffer:['Your safety buffer comes first','Why easy-access savings protect a seasonal household when income pauses.'],
  rd:['How a Recurring Deposit works','See how small fixed deposits can prepare for the next crop cycle.'],
  sip:['What a SIP really means','Learn why market-linked returns can rise or fall and why this comes after your buffer.'],
  'money-basics':['Your money-options starter lesson','Savings accounts, RDs, and SIPs compared through one simple story.']
};
function openLesson(topic){
  goTo('learn');
  var copy=lessonCopy[topic]||lessonCopy['money-basics'];
  document.getElementById('lessonContextTitle').textContent=copy[0];
  document.getElementById('lessonContextText').textContent=copy[1];
  document.getElementById('lessonContext').style.display='flex';
  setTimeout(function(){document.getElementById('lessonContext').scrollIntoView({behavior:'smooth',block:'start'});},80);
}
document.querySelectorAll('.channel').forEach(function(channel){
  channel.addEventListener('click',function(){
    showChatStatus(channel.textContent.trim()+' connects to the same secure Saathi profile');
  });
});

/* ---------- Legacy: authorised relative linking ---------- */
function startLegacyVerification(){
  var id=document.getElementById('legacyProfileId').value.trim();
  var deathRef=document.getElementById('deathRef').value.trim();
  var consent=document.getElementById('legacyConsent').checked;
  var status=document.getElementById('legacyStatus');
  status.className='legacy-status show';
  if(!id||!deathRef||!consent){
    status.classList.add('wait');
    status.textContent='Please enter both references and confirm consent before verification.';
    return;
  }
  status.classList.add('wait');
  status.textContent='Matching identity, death record, and registered family relationship…';
  setTimeout(function(){
    document.getElementById('legacyVerifyForm').style.display='none';
    document.getElementById('legacyOtpForm').style.display='block';
    document.getElementById('legacyProgress2').classList.add('on');
    status.className='legacy-status show ok';
    status.textContent='Records matched. One final authorization is required; no financial data has been revealed yet.';
  },850);
}
function completeLegacyVerification(){
  var otp=document.getElementById('legacyOtp').value.trim();
  var status=document.getElementById('legacyStatus');
  if(otp!=='482731'){
    status.className='legacy-status show wait';
    status.textContent='That code did not match. For this prototype, use 482731 or request officer review.';
    return;
  }
  document.getElementById('legacyProgress3').classList.add('on');
  status.className='legacy-status show ok';
  status.textContent='Authorization complete. Only information needed for inheritance and claims is now visible.';
  document.getElementById('legacyProfile').classList.add('show');
  document.getElementById('legacyChecklist').scrollIntoView({behavior:'smooth',block:'center'});
}
function requestOfficerReview(){
  var status=document.getElementById('legacyStatus');
  status.className='legacy-status show wait';
  status.textContent='Review request created for the ward officer. The profile stays locked until documents are checked in person.';
}

function runLoanFlow(heard){
  convo.innerHTML='';
  addTurn('user','<div class="orig" lang="hi">मुझे बीज के लिए ₹50,000 का लोन चाहिए — क्या मैं इसे चुका पाऊंगा?</div><div class="tx">"I want a ₹50,000 loan for seeds — can I afford it?"</div>');
  if(heard){
    var c=addTurn('saathi','<b>I heard ₹50,000.</b> Is that right?<div class="row"><button class="btn btn-amber btn-sm" onclick="confirmAmount(this)">✓ Yes, ₹50,000</button><button class="btn btn-ghost btn-sm" onclick="runLoanFlow(true)">✗ No, say again</button></div>');
  } else {
    answerLoan();
  }
}
function confirmAmount(btn){ btn.closest('.turn').remove(); answerLoan(); }
function answerLoan(){
  var typing=addTurn('saathi','<span class="typing"><i></i><i></i><i></i></span> <span style="color:var(--muted);font-size:13px">checking the calculator and RBI rules…</span>');
  setTimeout(function(){
    typing.remove();
    addTurn('saathi',
      'Yes, you can likely manage this loan — but it is tight. Here is the real number, checked properly:'+
      '<div class="trust">'+
        '<div class="trust-head"><span class="badge ok"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg> Verified by Critic</span><span class="lbl">number computed in Python · not guessed</span></div>'+
        '<div class="compute"><div class="figure num">₹4,387<small>/month</small></div><div style="color:var(--muted);font-size:13.5px;align-self:center">for 12 months · your EMI</div></div>'+
        '<div class="assum"><details><summary>How I got this ▾</summary><ul><li>Loan amount: ₹50,000</li><li>Interest: 14% per year (informal lender rate)</li><li>Time: 12 months</li><li>Computed with exact paise arithmetic, then read back to you</li></ul></details></div>'+
        '<div class="cites"><span class="cite"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l3 3v17H6z"/><path d="M9 8h6M9 12h6"/></svg> Source: RBI fair-practice guidance</span></div>'+
      '</div>'+
      '<div class="warnbox"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div><div>This EMI is about <b>30% of your monthly income</b>. That is risky if a month goes badly. Let me check whether you could survive a bad season with this loan.</div></div>'+
      '<div class="row"><button class="btn btn-primary" onclick="goTo(\\'risk\\');setTimeout(runStress,400)">Run my safety check →</button>'+
      '<button class="speaker" onclick="say(\\'Yes, you can likely manage this loan, but it is tight. Your monthly payment would be four thousand three hundred eighty seven rupees for twelve months. That is about thirty percent of your income.\\', this)"><span class="eq"><i></i><i></i><i></i><i></i></span> Read aloud</button></div>'
    );
  },1500);
}

/* the Critic refusing a hallucination — the winning demo beat */
function criticDemo(){
  convo.innerHTML='';
  goTo('home'); document.querySelector('.nav button[data-screen="home"]').classList.add('active');
  addTurn('user','<div class="orig">What return will I get if I invest ₹10,000?</div>');
  var typing=addTurn('saathi','<span class="typing"><i></i><i></i><i></i></span> <span style="color:var(--muted);font-size:13px">drafting an answer…</span>');
  setTimeout(function(){
    typing.remove();
    addTurn('saathi',
      'I will not give you a number here, because I could not verify it — and I never guess about your money.'+
      '<div class="trust" style="border-color:#f3c4c4;background:var(--danger-bg)">'+
        '<div class="trust-head" style="background:#f9dede;border-color:#f1c2c2"><span class="badge refuse">✕ Refused by Critic</span><span class="lbl">a number appeared that no calculation produced</span></div>'+
        '<div style="padding:13px;font-size:14px;color:#7a2020">The draft claimed a fixed “12% return.” The Critic blocked it: no investment has a guaranteed return, and the figure was not traceable to a real calculation or a regulator source.</div>'+
      '</div>'+
      '<div class="warnbox"><div class="ic" style="color:var(--teal-700)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg></div><div>What I <b>can</b> do safely: explain how a SIP works, show real historical ranges with their source, and connect you to a person for a decision this big.</div></div>'+
      '<div class="row"><span class="badge human">Sent to a person</span><button class="speaker" onclick="say(\\'I will not give you that number, because I could not verify it. No investment has a guaranteed return. I never guess about your money.\\', this)"><span class="eq"><i></i><i></i><i></i><i></i></span> Read aloud</button></div>'
    );
  },1400);
}

/* ---------- Risk Desk ---------- */
var loanOn=false;
function runStress(){
  document.getElementById('riskEmpty').style.display='none';
  document.getElementById('riskOut').style.display='block';
  drawRisk();
}
function drawRisk(){
  var months = loanOn ? 1.3 : 2.0;
  var ruin = loanOn ? 31 : 18;
  var safe = 100-ruin;
  // gauge: 2 months out of ~6 scale
  var frac = Math.min(months/6,1);
  document.getElementById('gaugeArc').style.strokeDashoffset = 270 - 270*frac;
  document.getElementById('gaugeArc').setAttribute('stroke', loanOn? 'var(--danger)':'var(--marigold)');
  animateNum('months', months, months%1?1:0, months%1? ' ':'');
  document.getElementById('safePct').textContent = safe+'%';
  document.getElementById('ruinPct').textContent = ruin+'%';
  // histogram buckets: ran-out, 1-2mo, 3-4, 5, survived
  var base = loanOn ? [31,26,20,13,10] : [18,22,24,18,18];
  var hist=document.getElementById('hist'); hist.innerHTML='';
  var peak=Math.max.apply(null,[1].concat(base));
  base.forEach(function(v,i){
    var b=document.createElement('div'); b.className='bar'+(i===0?' ruin':''); b.style.height='0%';
    hist.appendChild(b);
    var h = v>0 ? Math.max(4,(v/peak)*90) : 0;
    setTimeout(function(){ b.style.height=h+'%'; }, 60+i*70);
  });
}
function animateNum(id,target,dec,suffix){
  var el=document.getElementById(id), start=0, t0=performance.now(), dur=900;
  function step(t){ var p=Math.min((t-t0)/dur,1); var val=(start+(target-start)*p); el.textContent = (dec?val.toFixed(1):Math.round(val)); if(p<1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}
function toggleLoan(wrap){
  loanOn=!loanOn;
  document.getElementById('loanToggle').classList.toggle('on',loanOn);
  drawRisk();
}

/* ---------- Scam check ---------- */
function checkScam(){ document.getElementById('scamVerdict').classList.add('show'); document.getElementById('scamVerdict').scrollIntoView({behavior:'smooth',block:'center'}); }

/* ---------- Scheme checklist + consented auto-apply ---------- */
var autoApplyOn=true;
var schemeApplied=false;
function toggleAutoApply(){
  if(schemeApplied){showChatStatus('Application already submitted · ASK-2418');return;}
  autoApplyOn=!autoApplyOn;
  var toggle=document.getElementById('autoApplyToggle');
  toggle.classList.toggle('on',autoApplyOn);
  toggle.setAttribute('aria-pressed',String(autoApplyOn));
  updateSchemeApplication();
}
function toggleSchemeDoc(item){
  if(schemeApplied)return;
  item.classList.toggle('done');
  updateSchemeApplication();
}
function updateSchemeApplication(){
  var checks=Array.from(document.querySelectorAll('#pmKisanChecklist .check'));
  var complete=checks.every(function(item){return item.classList.contains('done');});
  var status=document.getElementById('schemeStatus');
  var manual=document.getElementById('manualApplyBtn');
  status.className='scheme-status';
  if(!complete){
    status.textContent='';
    manual.style.display='';
    return;
  }
  status.classList.add('show');
  if(autoApplyOn){
    schemeApplied=true;
    status.classList.add('applied');
    status.innerHTML='<span>✓</span><span>Documents verified. PM-KISAN application auto-submitted with saved consent. Tracking ID: <b>ASK-2418</b></span>';
    manual.style.display='none';
    document.getElementById('autoApplyToggle').disabled=true;
    checks.forEach(function(item){item.setAttribute('aria-disabled','true');});
  }else{
    status.classList.add('ready');
    status.innerHTML='<span>●</span><span>All documents are ready. Turn on auto-apply or submit with ward-office help.</span>';
    manual.style.display='';
  }
}

/* ---------- sign modal ---------- */
function openSign(){document.getElementById('signModal').classList.add('show');}
function closeSign(){document.getElementById('signModal').classList.remove('show');}
document.addEventListener('keydown',function(e){ if(e.key==='Escape'){closeSign();closeSide();} });`;

export default function App() {
  const initialized = useRef(false);

  const boot = () => {
    if (initialized.current) return;
    if (!document.getElementById("convo")) { setTimeout(boot, 0); return; }
    initialized.current = true;

    // install the prototype's tested handlers as globals so inline controls work
    try {
      (0, eval)(runtime);
      window.dispatchEvent(new Event("load"));
    } catch (err) {
      window.__arthSaathiRuntimeError = err;
      console.warn("Prototype runtime did not fully install.", err);
    }

    // override the demo functions with real FastAPI-backed versions
    try {
      installIntegration();
    } catch (err) {
      window.__arthSaathiInstallError = err;
      console.warn("Backend integration did not fully install.", err);
    }
  };

  useLayoutEffect(() => { boot(); }, []);

  return <div ref={() => setTimeout(boot, 0)} dangerouslySetInnerHTML={{ __html: markup }} />;
}
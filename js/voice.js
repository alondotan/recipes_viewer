'use strict';

// Speech output (speechSynthesis) and hands-free commands (SpeechRecognition), in Hebrew.
const Voice = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window;
  const canListen = !!SR;

  /* ---------- Speaking ---------- */

  let heVoice = null;
  const pickVoice = () => { heVoice = speechSynthesis.getVoices().find(v => /^(he|iw)/i.test(v.lang)) || null; };
  if (canSpeak) {
    pickVoice();
    speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  }

  let speaking = false, gen = 0, watchdog = 0;
  // Chrome skips onend for utterances that get garbage-collected, so keep them referenced.
  const live = new Set();

  function finishSpeaking(my, onend) {
    if (my !== gen || !speaking) return;
    speaking = false;
    clearInterval(watchdog);
    live.clear();
    scheduleStart(300);
    onend?.();
  }

  // Half-duplex: the mic is off while we talk, so we never hear ourselves.
  // Long utterances get cut off in some browsers, so speak sentence by sentence.
  function speak(text, onend) {
    if (!canSpeak) return onend?.();
    speechSynthesis.cancel();
    const my = ++gen;
    speaking = true;
    abortRec();
    const parts = String(text).split(/(?<=[.!?:])\s+/).filter(Boolean);
    parts.forEach((part, k) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = 'he-IL';
      if (heVoice) u.voice = heVoice;
      if (k === parts.length - 1) u.onend = u.onerror = () => finishSpeaking(my, onend);
      live.add(u);
      speechSynthesis.speak(u);
    });
    // Fallback for browsers where onend never fires at all.
    const began = Date.now();
    clearInterval(watchdog);
    watchdog = setInterval(() => {
      if (Date.now() - began > 800 && !speechSynthesis.speaking && !speechSynthesis.pending) finishSpeaking(my, onend);
    }, 300);
  }

  function stopSpeaking() {
    gen++;
    clearInterval(watchdog);
    if (canSpeak) speechSynthesis.cancel();
    live.clear();
    if (speaking) { speaking = false; scheduleStart(300); }
  }

  /* ---------- Listening ---------- */

  let rec = null, listening = false, handler = null, stateFn = null, startedAt = 0, restartTimer = 0;

  function scheduleStart(ms) {
    clearTimeout(restartTimer);
    if (listening) restartTimer = setTimeout(start, ms);
  }

  function abortRec() {
    clearTimeout(restartTimer);
    const r = rec;
    rec = null;
    try { r?.abort(); } catch {}
  }

  function start() {
    clearTimeout(restartTimer);
    if (!listening || speaking || rec || document.hidden) return;
    const r = rec = new SR();
    r.lang = 'he-IL';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;

    // Safari keeps appending to one growing result ("הבא" → "הבא שוב"), so track how much
    // of each result was already acted on and only parse the new part.
    const consumed = new Map();
    let pending = 0;
    const emit = (i, alts) => {
      if (speaking || rec !== r) return;
      const done = consumed.get(i) || 0;
      const fresh = done ? [alts[0].slice(done).trim()] : alts;
      if (!fresh[0]) return;
      consumed.set(i, alts[0].length);
      handler?.(fresh);
    };
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alts = [...res].map(a => a.transcript.trim()).filter(Boolean);
        if (!alts.length) continue;
        clearTimeout(pending);
        if (res.isFinal) emit(i, alts);
        // Safari often never marks results final in continuous mode: act once the words stop changing.
        else pending = setTimeout(() => emit(i, alts), 700);
      }
    };
    r.onstart = () => stateFn?.('listening');
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        listening = false;
        stateFn?.('denied');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') stateFn?.('error', e.error);
    };
    // Browsers end recognition after a stretch of silence; restart while voice mode is on.
    r.onend = () => {
      if (rec !== r) return;
      rec = null;
      scheduleStart(Date.now() - startedAt < 1000 ? 2000 : 250);
    };
    startedAt = Date.now();
    try { r.start(); }
    catch (e) { rec = null; stateFn?.('error', e.message); }
  }

  function listen(onHeard, onState) {
    if (!canListen) return false;
    handler = onHeard;
    stateFn = onState;
    listening = true;
    start();
    return true;
  }

  function stopListening() {
    listening = false;
    abortRec();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

  /* ---------- Commands ---------- */

  const NUMBERS = {
    אחד: 1, אחת: 1, ראשון: 1, שתיים: 2, שניים: 2, שני: 2, שתי: 2, שלוש: 3, שלושה: 3, שלישי: 3,
    ארבע: 4, ארבעה: 4, רביעי: 4, חמש: 5, חמישה: 5, חמישי: 5, שש: 6, שישה: 6, שישי: 6,
    שבע: 7, שבעה: 7, שביעי: 7, שמונה: 8, שמיני: 8, תשע: 9, תשעה: 9, תשיעי: 9, עשר: 10, עשרה: 10, עשירי: 10,
  };
  const word = list => new RegExp(`(^|\\s)(${list})(\\s|$)`);
  // Order matters: more specific phrases first ("חזור אחורה" is prev, not repeat).
  const RULES = [
    ['stop', word('עצור|עצרי|תעצור|תעצרי|די|שקט|הפסק|תפסיק|תפסיקי|סטופ')],
    ['timeLeft', /כמה (זמן|נשאר|עוד)/],
    ['timer', /טיימר|שעון/],
    ['ingredients', /מרכיב|מצרכ|מה צריך/],
    ['tip', /טיפ/],
    ['next', word('הבא|הבאה|הלאה|קדימה|תמשיך|תמשיכי|המשך|נקסט')],
    ['prev', word('הקודם|הקודמת|אחורה|קודם')],
    ['repeat', /שוב|עוד פעם|עוד הפעם|חזור|תחזור|תחזרי|תקריא|תקריאי|תקרא|תקראי|הקרא|מה עכשיו|לא שמעתי/],
  ];

  // Accepts the recognizer's alternatives; returns { cmd, n? } or null.
  function parse(alternatives) {
    for (const raw of alternatives) {
      const t = raw.replace(/[.,!?"'״׳]/g, ' ').replace(/\s+/g, ' ').trim();
      // Commands are short; longer phrases are conversation, not meant for us.
      if (!t || t.split(' ').length > 6) continue;
      const m = t.match(/שלב (?:מספר )?(\d+|\S+)/);
      if (m) {
        const n = /^\d+$/.test(m[1]) ? +m[1] : NUMBERS[m[1].replace(/^ה/, '')] ?? NUMBERS[m[1]];
        if (n) return { cmd: 'goto', n };
      }
      for (const [cmd, re] of RULES) if (re.test(t)) return { cmd };
    }
    return null;
  }

  /* ---------- Speakable text ---------- */

  const FRACTIONS = [[1 / 4, 'רבע'], [1 / 3, 'שליש'], [1 / 2, 'חצי'], [2 / 3, 'שני שליש'], [3 / 4, 'שלושה רבעים']];

  function amount(n) {
    const whole = Math.floor(n + 1e-9), frac = n - whole;
    if (frac < 0.01) return String(whole);
    const f = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.02);
    if (!f) return String(Math.round(n * 100) / 100);
    return whole ? `${whole} ו${f[1]}` : f[1];
  }

  function minutes(m) {
    if (m < 1) return `${Math.round(m * 60)} שניות`;
    if (m < 60) return m === 1 ? 'דקה' : `${amount(m)} דקות`;
    const h = Math.floor(m / 60), r = Math.round(m % 60);
    const hours = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
    return r ? `${hours} ו${minutes(r)}` : hours;
  }

  const range = (a, b) => (b == null || b === a ? minutes(a) : `${amount(a)} עד ${minutes(b)}`);

  function remaining(ms) {
    const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), sec = s % 60;
    if (!m) return `${sec} שניות`;
    return sec ? `${minutes(m)} ו-${sec} שניות` : minutes(m);
  }

  return {
    canSpeak, canListen,
    speak, stopSpeaking, isSpeaking: () => speaking,
    listen, stopListening,
    parse,
    say: { amount, minutes, range, remaining },
  };
})();

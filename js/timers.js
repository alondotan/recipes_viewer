'use strict';

// Timers are stored as absolute end timestamps, so they stay correct across
// step changes, background tabs and page reloads.
const Timers = (() => {
  const KEY = 'rv.timers';
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY)) || []; } catch {}

  const changeFns = [], tickFns = [];
  let ctx = null, alarm = null;

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
  const get = id => list.find(t => t.id === id);

  function changed() {
    save();
    updateAlarm();
    changeFns.forEach(f => f());
  }

  function remaining(t, now = Date.now()) {
    if (t.state === 'running') return Math.max(0, t.endAt - now);
    if (t.state === 'paused') return t.remainingMs;
    return 0;
  }

  // Browsers only allow audio after a user gesture, so unlock on any tap.
  function unlockAudio() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch {}
  }

  function beep() {
    navigator.vibrate?.([400, 150, 400]);
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const at = t0 + k * 0.25;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.2);
    }
  }

  function updateAlarm() {
    const ringing = list.some(t => t.state === 'done');
    if (ringing && !alarm) { beep(); alarm = setInterval(beep, 1500); }
    else if (!ringing && alarm) { clearInterval(alarm); alarm = null; }
  }

  function tick() {
    const now = Date.now();
    let fired = false;
    for (const t of list) {
      if (t.state === 'running' && t.endAt <= now) { t.state = 'done'; t.doneAt = t.endAt; fired = true; }
    }
    if (fired) changed();
    tickFns.forEach(f => f(now));
  }

  const api = {
    list: () => list,
    remaining,
    byKey: key => list.find(t => t.key === key),
    hasAny: () => list.length > 0,

    start({ key, label, stepIndex, minutes }) {
      unlockAudio();
      const ms = Math.round(minutes * 60000);
      list.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        key, label, stepIndex, durationMs: ms, endAt: Date.now() + ms, state: 'running',
      });
      changed();
    },
    pause(id) {
      const t = get(id);
      if (t?.state !== 'running') return;
      t.remainingMs = remaining(t);
      t.state = 'paused';
      changed();
    },
    resume(id) {
      const t = get(id);
      if (t?.state !== 'paused') return;
      t.endAt = Date.now() + t.remainingMs;
      t.state = 'running';
      changed();
    },
    addMinute(id) {
      const t = get(id);
      if (!t) return;
      if (t.state === 'running') t.endAt += 60000;
      else if (t.state === 'paused') t.remainingMs += 60000;
      else { t.state = 'running'; t.endAt = Date.now() + 60000; }
      t.durationMs += 60000;
      changed();
    },
    remove(id) { list = list.filter(t => t.id !== id); changed(); },
    clear() { list = []; changed(); },

    onChange(fn) { changeFns.push(fn); },
    onTick(fn) { tickFns.push(fn); },
  };

  setInterval(tick, 250);
  document.addEventListener('visibilitychange', tick);
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));

  return api;
})();

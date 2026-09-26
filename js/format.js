'use strict';

const Fmt = {
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // 0.5 → ½, 1.25 → 1¼
  amount(n) {
    const whole = Math.floor(n + 1e-9);
    const frac = n - whole;
    if (frac < 0.01) return String(whole);
    const F = [[1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾']];
    const f = F.find(([v]) => Math.abs(v - frac) < 0.02);
    if (f) return (whole || '') + f[1];
    return String(Math.round(n * 100) / 100);
  },

  minutes(m) {
    if (m < 1) return `${Math.round(m * 60)} שנ'`;
    if (m < 60) return `${+m.toFixed(1)} דק'`;
    const h = Math.floor(m / 60), r = Math.round(m % 60);
    return r ? `${h} ש' ${r} דק'` : `${h} ש'`;
  },

  // Hyphen-minus (not en dash) keeps "8-10" in visual LTR order inside RTL text.
  range(a, b) {
    if (b == null || b === a) return Fmt.minutes(a);
    if (a >= 1 && b < 60) return `${+a.toFixed(1)}-${+b.toFixed(1)} דק'`;
    return `${Fmt.minutes(a)} - ${Fmt.minutes(b)}`;
  },

  // Countdown rounds up so it shows 00:01 until the timer actually ends.
  clock(ms, countUp = false) {
    const s = countUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  },

  temp(t) {
    if (t.value == null) return t.note;
    const v = (t.unit || 'C') === 'C' ? `${t.value} מעלות` : `${t.value}°F`;
    return t.note ? `${v} · ${t.note}` : v;
  },
};

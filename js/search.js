'use strict';

// Free-text recipe search over title, tags, ingredients and other text, tolerant of
// Hebrew spelling details (niqqud, final letters, geresh) and simple plural forms.
const Search = (() => {
  const FINALS = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

  function norm(s) {
    return String(s ?? '')
      .normalize('NFKD')
      .replace(/[֑-ׇ]/g, '') // niqqud and cantillation marks
      .replace(/[ךםןףץ]/g, c => FINALS[c])
      .replace(/[׳״'"`]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // "ביצים" should find "ביצה", "עגבניות" → "עגבנייה", "תפוחי" → "תפוח".
  const stem = t => (t.length >= 4 ? t.replace(/(ימ|ות|ה|י)$/, '') : t);

  function totalMinutes(r) {
    if (r.totalTime?.minutes) return r.totalTime.minutes;
    // Summing step times is only meaningful when most steps have one.
    const steps = r.steps || [], times = steps.filter(s => s.time);
    return times.length && times.length * 2 > steps.length ? times.reduce((sum, s) => sum + s.time.minutes, 0) : null;
  }

  function index(r) {
    return {
      title: norm(r.title),
      // Category and cuisine search like tags ("מרק", "אסייתי").
      tags: [...(r.tags || []), r.category, r.cuisine].filter(Boolean).map(norm),
      ingredients: (r.ingredients || []).map(i => ({ name: i.name, n: norm(i.name) })),
      kashrut: norm(r.kashrut),
      other: norm([r.description, r.author, r.difficulty, ...(r.equipment || [])].filter(Boolean).join(' ')),
      minutes: totalMinutes(r),
    };
  }

  // Kashrut words match the kashrut field only ("חלבי" shouldn't find "חלבון").
  const KASHRUT = { חלבי: 'חלבי', בשרי: 'בשרי', פרווה: 'פרווה', פרוה: 'פרווה' };

  const terms = query => norm(query).split(' ').filter(Boolean).map(raw => ({ raw, stem: stem(raw) }));

  // Every term must match somewhere. Returns null, or { score, ingredients, inTitle } where
  // ingredients lists the ingredient names that matched (to show why a recipe came up).
  function match(ix, qTerms) {
    let score = 0, inTitle = true;
    const hits = new Set();
    for (const { raw, stem: t } of qTerms) {
      if (KASHRUT[raw]) {
        if (ix.kashrut !== KASHRUT[raw]) return null;
        score += 6;
        continue;
      }
      let s = 0;
      if (!ix.title.includes(t)) inTitle = false;
      if (ix.title.includes(t)) s += ix.title.startsWith(t) ? 12 : 10;
      if (ix.tags.some(tag => tag === t || tag.startsWith(t))) s += 8;
      else if (ix.tags.some(tag => tag.includes(t))) s += 5;
      const ing = ix.ingredients.filter(i => i.n.includes(t));
      if (ing.length) { s += 4; ing.forEach(i => hits.add(i.name)); }
      if (!s && ix.other.includes(t)) s += 1;
      if (!s) return null;
      score += s;
    }
    return { score, ingredients: [...hits], inTitle };
  }

  return { norm, index, terms, match, totalMinutes };
})();

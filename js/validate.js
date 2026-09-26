'use strict';

// Mirrors schema/recipe.schema.json, plus cross-field checks the schema can't express.
// Returns a list of Hebrew error messages (empty = valid).
function validateRecipe(r) {
  const errs = [];
  const add = (path, msg) => errs.push(`${path}: ${msg}`);
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isStr = v => typeof v === 'string' && v.trim() !== '';
  const isPos = v => typeof v === 'number' && isFinite(v) && v > 0;

  const only = (o, keys, path) => {
    for (const k of Object.keys(o)) if (!keys.includes(k)) add(path, `שדה לא מוכר "${k}"`);
  };
  const reqStr = (o, k, path) => { if (!isStr(o[k])) add(path, `"${k}" חובה (טקסט)`); };
  const optStr = (o, k, path) => { if (o[k] !== undefined && typeof o[k] !== 'string') add(path, `"${k}" חייב להיות טקסט`); };
  const optPos = (o, k, path) => { if (o[k] !== undefined && !isPos(o[k])) add(path, `"${k}" חייב להיות מספר חיובי`); };
  const optRange = (o, path) => {
    optPos(o, 'amount', path);
    optPos(o, 'maxAmount', path);
    if (o.maxAmount === undefined) return;
    if (o.amount === undefined) add(path, '"maxAmount" דורש "amount"');
    else if (isPos(o.amount) && isPos(o.maxAmount) && o.maxAmount < o.amount) add(path, '"maxAmount" קטן מ-"amount"');
  };
  const duration = (d, path) => {
    if (!isObj(d)) return add(path, 'חייב להיות אובייקט');
    only(d, ['minutes', 'maxMinutes'], path);
    if (!isPos(d.minutes)) add(path, '"minutes" חובה (מספר חיובי)');
    optPos(d, 'maxMinutes', path);
    if (isPos(d.minutes) && isPos(d.maxMinutes) && d.maxMinutes < d.minutes) add(path, '"maxMinutes" קטן מ-"minutes"');
  };
  const optEnum = (o, k, values, path) => {
    if (o[k] !== undefined && !values.includes(o[k])) add(path, `"${k}" חייב להיות אחד מ: ${values.join(', ')}`);
  };
  const strArr = (o, k, path) => {
    if (o[k] !== undefined && !(Array.isArray(o[k]) && o[k].every(x => typeof x === 'string')))
      add(path, `"${k}" חייב להיות רשימה של טקסטים`);
  };

  if (!isObj(r)) return ['הקובץ חייב להכיל אובייקט מתכון ({ ... })'];

  const R = 'מתכון';
  only(r, ['$schema', 'schemaVersion', 'id', 'title', 'description', 'author', 'servings', 'yield', 'totalTime', 'activeTime', 'difficulty', 'kashrut', 'tags', 'source', 'image', 'notes', 'equipment', 'ingredients', 'steps', 'fullText'], R);
  if (r.schemaVersion !== undefined && r.schemaVersion !== 1) add(R, '"schemaVersion" לא נתמך (הגרסה הנתמכת: 1)');
  reqStr(r, 'title', R);
  ['$schema', 'id', 'description', 'author', 'source', 'image', 'fullText'].forEach(k => optStr(r, k, R));
  optPos(r, 'servings', R);
  strArr(r, 'tags', R);
  strArr(r, 'notes', R);
  if (r.totalTime !== undefined) duration(r.totalTime, `${R} › totalTime`);
  if (r.activeTime !== undefined) duration(r.activeTime, `${R} › activeTime`);
  optEnum(r, 'difficulty', ['קל', 'בינוני', 'קשה'], R);
  optEnum(r, 'kashrut', ['בשרי', 'חלבי', 'פרווה'], R);
  if (r.equipment !== undefined && !(Array.isArray(r.equipment) && r.equipment.every(isStr)))
    add(R, '"equipment" חייב להיות רשימה של טקסטים');

  if (r.yield !== undefined) {
    const Q = `${R} › yield`;
    if (!isObj(r.yield)) add(Q, 'חייב להיות אובייקט');
    else {
      only(r.yield, ['amount', 'unit'], Q);
      if (!isPos(r.yield.amount)) add(Q, '"amount" חובה (מספר חיובי)');
      reqStr(r.yield, 'unit', Q);
    }
  }

  const ids = new Set();
  if (!Array.isArray(r.ingredients) || !r.ingredients.length) add(R, '"ingredients" חובה (רשימה לא ריקה)');
  else r.ingredients.forEach((ing, i) => {
    let P = `מרכיב ${i + 1}`;
    if (!isObj(ing)) return add(P, 'חייב להיות אובייקט');
    if (isStr(ing.name)) P += ` (${ing.name})`;
    only(ing, ['id', 'name', 'amount', 'maxAmount', 'unit', 'note', 'group', 'optional', 'alternatives'], P);
    if (ing.alternatives !== undefined && !(Array.isArray(ing.alternatives) && ing.alternatives.every(isStr)))
      add(P, '"alternatives" חייב להיות רשימה של טקסטים');
    reqStr(ing, 'id', P);
    reqStr(ing, 'name', P);
    if (isStr(ing.id)) {
      if (ids.has(ing.id)) add(P, `"id" כפול: "${ing.id}"`);
      ids.add(ing.id);
    }
    optRange(ing, P);
    ['unit', 'note', 'group'].forEach(k => optStr(ing, k, P));
    if (ing.optional !== undefined && typeof ing.optional !== 'boolean') add(P, '"optional" חייב להיות true או false');
  });

  if (r.steps !== undefined && !Array.isArray(r.steps)) add(R, '"steps" חייב להיות רשימה');
  else (r.steps || []).forEach((s, i) => {
    const P = `שלב ${i + 1}`;
    if (!isObj(s)) return add(P, 'חייב להיות אובייקט');
    only(s, ['id', 'group', 'title', 'instruction', 'ingredients', 'time', 'timers', 'heat', 'temperature', 'doneWhen', 'tips', 'warning'], P);
    if (s.id !== undefined && typeof s.id !== 'number' && typeof s.id !== 'string') add(P, '"id" חייב להיות מספר או טקסט');
    reqStr(s, 'instruction', P);
    ['group', 'title', 'heat', 'doneWhen', 'warning'].forEach(k => optStr(s, k, P));
    strArr(s, 'tips', P);

    if (s.ingredients !== undefined) {
      if (!Array.isArray(s.ingredients)) add(P, '"ingredients" חייב להיות רשימה');
      else s.ingredients.forEach((ref, j) => {
        const Q = `${P} › מרכיב ${j + 1}`;
        if (!isObj(ref)) return add(Q, 'חייב להיות אובייקט { "ref": ... }');
        only(ref, ['ref', 'amount', 'maxAmount', 'unit', 'note'], Q);
        if (!isStr(ref.ref)) add(Q, '"ref" חובה');
        else if (!ids.has(ref.ref)) add(Q, `"ref" מפנה למרכיב שלא קיים: "${ref.ref}"`);
        optRange(ref, Q);
        optStr(ref, 'unit', Q);
        optStr(ref, 'note', Q);
      });
    }

    if (s.time !== undefined) {
      const Q = `${P} › time`;
      const t = s.time;
      if (!isObj(t)) add(Q, 'חייב להיות אובייקט');
      else {
        only(t, ['minutes', 'maxMinutes', 'type'], Q);
        if (!isPos(t.minutes)) add(Q, '"minutes" חובה (מספר חיובי)');
        optPos(t, 'maxMinutes', Q);
        if (isPos(t.minutes) && isPos(t.maxMinutes) && t.maxMinutes < t.minutes) add(Q, '"maxMinutes" קטן מ-"minutes"');
        if (t.type !== undefined && !['active', 'passive'].includes(t.type)) add(Q, '"type" חייב להיות "active" או "passive"');
      }
    }

    if (s.timers !== undefined) {
      if (!Array.isArray(s.timers)) add(P, '"timers" חייב להיות רשימה');
      else s.timers.forEach((t, j) => {
        const Q = `${P} › טיימר ${j + 1}`;
        if (!isObj(t)) return add(Q, 'חייב להיות אובייקט');
        only(t, ['label', 'minutes'], Q);
        optStr(t, 'label', Q);
        if (!isPos(t.minutes)) add(Q, '"minutes" חובה (מספר חיובי)');
      });
    }

    if (s.temperature !== undefined) {
      const Q = `${P} › temperature`;
      const t = s.temperature;
      if (!isObj(t)) add(Q, 'חייב להיות אובייקט');
      else {
        only(t, ['value', 'maxValue', 'unit', 'note'], Q);
        if (t.value === undefined) { if (!isStr(t.note)) add(Q, 'צריך "value" (מספר) או "note" (תיאור, למשל: חום גבוה)'); }
        else if (typeof t.value !== 'number' || !isFinite(t.value)) add(Q, '"value" חייב להיות מספר');
        if (t.maxValue !== undefined) {
          if (typeof t.maxValue !== 'number' || !isFinite(t.maxValue)) add(Q, '"maxValue" חייב להיות מספר');
          else if (t.value === undefined) add(Q, '"maxValue" דורש "value"');
          else if (t.maxValue < t.value) add(Q, '"maxValue" קטן מ-"value"');
        }
        if (t.unit !== undefined && !['C', 'F'].includes(t.unit)) add(Q, '"unit" חייב להיות "C" או "F"');
        optStr(t, 'note', Q);
      }
    }
  });

  return errs;
}

if (typeof module !== 'undefined') module.exports = { validateRecipe };
